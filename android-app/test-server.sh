#!/usr/bin/env bash
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/LocalAssetServerTest.java" <<'JAVA'
package dev.terryhank.foxglove.cn;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
public class LocalAssetServerTest {
  static String get(String origin, String path, String method, String host) throws Exception {
    URI u = URI.create(origin);
    try(Socket s = new Socket("127.0.0.1", u.getPort())) {
      s.setSoTimeout(3000);
      String req = method+" "+path+" HTTP/1.1\r\nHost: "+(host==null?"127.0.0.1:"+u.getPort():host)+"\r\n\r\n";
      s.getOutputStream().write(req.getBytes(StandardCharsets.US_ASCII));
      ByteArrayOutputStream b = new ByteArrayOutputStream();
      byte[] buf=new byte[4096]; int n;
      while((n=s.getInputStream().read(buf))!=-1)b.write(buf,0,n);
      return b.toString("UTF-8");
    }
  }
  static void check(boolean ok, String label) { if(!ok) throw new AssertionError(label); System.out.println("PASS "+label); }
  public static void main(String[] a) throws Exception {
    try(LocalAssetServer s = new LocalAssetServer(p -> {
      if(!p.equals("index.html")&&!p.equals("worker.js")&&!p.equals("code.wasm")) throw new FileNotFoundException(p);
      return new ByteArrayInputStream("fixture".getBytes(StandardCharsets.UTF_8));
    },0)) {
      String root=get(s.origin(),"/","GET",null);
      check(root.startsWith("HTTP/1.1 200"),"root");
      check(root.endsWith("fixture"),"asset body");
      check(root.contains("Cross-Origin-Opener-Policy: same-origin"),"COOP");
      check(root.contains("Cross-Origin-Embedder-Policy: credentialless"),"COEP");
      check(get(s.origin(),"/worker.js","GET",null).contains("application/javascript"),"Worker MIME");
      check(get(s.origin(),"/code.wasm","GET",null).contains("application/wasm"),"WASM MIME");
      check(get(s.origin(),"/","HEAD",null).endsWith("\r\n\r\n"),"HEAD");
      check(get(s.origin(),"/missing","GET",null).startsWith("HTTP/1.1 404"),"missing");
      check(get(s.origin(),"/%2e%2e/etc/passwd","GET",null).startsWith("HTTP/1.1 403"),"encoded traversal");
      check(get(s.origin(),"/","GET","evil.test").startsWith("HTTP/1.1 403"),"Host guard");
      check(get(s.origin(),"/","POST",null).startsWith("HTTP/1.1 405"),"read-only");
    }
  }
}
JAVA
javac --release 8 -d "$TMP/classes" "$APP/src/main/java/dev/terryhank/foxglove/cn/LocalAssetServer.java" "$TMP/LocalAssetServerTest.java"
java -cp "$TMP/classes" dev.terryhank.foxglove.cn.LocalAssetServerTest
