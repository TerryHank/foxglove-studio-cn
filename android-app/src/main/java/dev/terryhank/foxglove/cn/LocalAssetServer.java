package dev.terryhank.foxglove.cn;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.*;

/** Read-only APK asset server. Binds ONLY to loopback; never proxies requests. */
final class LocalAssetServer implements Closeable {
    interface Assets { InputStream open(String path) throws IOException; }
    private final Assets assets;
    private final ServerSocket server;
    private final ThreadPoolExecutor workers;
    private final Thread acceptThread;
    private volatile boolean closed;

    LocalAssetServer(Assets assets, int preferredPort) throws IOException {
        this.assets = assets;
        ServerSocket bound = new ServerSocket();
        try {
            bound.setReuseAddress(true);
            bound.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), preferredPort), 16);
        } catch (IOException e) {
            bound.close();
            bound = new ServerSocket();
            bound.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 16);
        }
        server = bound;
        workers = new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS,
                new ArrayBlockingQueue<Runnable>(32));
        acceptThread = new Thread(new Runnable() {
            @Override public void run() { accept(); }
        }, "FoxgloveAssets");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }
    String origin() { return "http://127.0.0.1:" + server.getLocalPort(); }
    private void accept() {
        while (!closed) {
            try {
                final Socket socket = server.accept();
                socket.setSoTimeout(10000);
                try {
                    workers.execute(new Runnable() {
                        @Override public void run() { serve(socket); }
                    });
                } catch (RejectedExecutionException e) { socket.close(); }
            } catch (IOException e) { if (!closed) close(); }
        }
    }
    private static String line(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (int n = 0; n < 8192; n++) {
            int c = in.read();
            if (c == -1 || c == '\n') return b.toString("US-ASCII").replace("\r", "");
            b.write(c);
        }
        throw new IOException("Header too long");
    }
    private void serve(Socket socket) {
        try (Socket s = socket;
             InputStream in = new BufferedInputStream(s.getInputStream());
             OutputStream out = new BufferedOutputStream(s.getOutputStream())) {
            String[] request = line(in).split(" ");
            if (request.length != 3) { error(out, 400, "Bad Request"); return; }
            String method = request[0];
            String host = "";
            int total = 0;
            for (int n = 0; n < 100; n++) {
                String h = line(in);
                if (h.isEmpty()) break;
                total += h.length();
                if (total > 32768 || n == 99) { error(out, 431, "Headers Too Large"); return; }
                if (h.toLowerCase(Locale.ROOT).startsWith("host:")) host = h.substring(5).trim();
            }
            if (!host.equals("127.0.0.1:" + server.getLocalPort())) {
                error(out, 403, "Forbidden"); return;
            }
            if (!method.equals("GET") && !method.equals("HEAD")) {
                error(out, 405, "Method Not Allowed"); return;
            }
            String target = request[1];
            if (!target.startsWith("/") || target.startsWith("//")) { error(out, 400, "Bad Request"); return; }
            String path;
            try { path = new URI(target).getPath(); }
            catch (URISyntaxException e) { error(out, 400, "Bad Request"); return; }
            if (path == null || path.contains("\\") || path.indexOf('\0') >= 0) { error(out, 400, "Bad Request"); return; }
            for (String part : path.split("/")) {
                if (part.equals("..") || part.equals(".")) { error(out, 403, "Forbidden"); return; }
            }
            if (path.equals("/")) path = "/index.html";
            InputStream resource;
            try { resource = assets.open(path.substring(1)); }
            catch (IOException e) { error(out, 404, "Not Found"); return; }
            try (InputStream data = resource) {
                String headers = "HTTP/1.1 200 OK\r\nContent-Type: " + mime(path)
                    + "\r\nConnection: close\r\nCache-Control: no-cache"
                    + "\r\nX-Content-Type-Options: nosniff"
                    + "\r\nCross-Origin-Opener-Policy: same-origin"
                    + "\r\nCross-Origin-Embedder-Policy: credentialless"
                    + "\r\nCross-Origin-Resource-Policy: same-origin"
                    + "\r\nX-Frame-Options: DENY\r\n\r\n";
                out.write(headers.getBytes(StandardCharsets.US_ASCII));
                if (method.equals("GET")) {
                    byte[] buffer = new byte[32768];
                    int n;
                    while ((n = data.read(buffer)) != -1) out.write(buffer, 0, n);
                }
                out.flush();
            }
        } catch (IOException ignored) { /* WebView may cancel requests during reload. */ }
    }
    private static void error(OutputStream out, int status, String message) throws IOException {
        byte[] b = message.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + status + " " + message + "\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: "
                + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        out.write(b); out.flush();
    }
    private static String mime(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".map")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }
    @Override public void close() {
        if (closed) return;
        closed = true;
        try { server.close(); } catch (IOException ignored) { }
        workers.shutdownNow();
    }
}
