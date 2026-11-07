package dev.terryhank.foxglove.cn;

import android.app.*;
import android.os.*;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.util.concurrent.*;
import javax.net.ssl.*;
import org.json.*;

/** Configure the robot's wireless interface through the receiver LAN. */
public final class RobotWifiActivity extends Activity {
    private static final String ENDPOINT = "https://192.168.144.108:8766";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextView status;
    private TextView message;
    private ProgressBar progress;
    private Button refresh;
    private Button hidden;
    private ListView list;
    private JSONArray networks = new JSONArray();
    private SSLSocketFactory tls;
    private volatile boolean closed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(android.graphics.Color.rgb(21, 21, 26));
        root.setPadding(dp(16), dp(12), dp(16), dp(8));
        root.setFitsSystemWindows(true);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(dp(16) + insets.getSystemWindowInsetLeft(), dp(12) + insets.getSystemWindowInsetTop(),
                    dp(16) + insets.getSystemWindowInsetRight(), dp(8) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView title = new TextView(this);
        title.setText("机器人 Wi-Fi"); title.setTextSize(22);
        root.addView(title);
        status = new TextView(this); status.setTextSize(16); status.setText("正在读取机器人网络状态…");
        root.addView(status);
        LinearLayout controls = new LinearLayout(this);
        Button back = new Button(this); back.setText(getPackageName().endsWith(".wifi") ? "退出" : "返回 Foxglove"); back.setOnClickListener(v -> finish());
        refresh = new Button(this); refresh.setText("刷新热点"); refresh.setOnClickListener(v -> scan());
        hidden = new Button(this); hidden.setText("隐藏网络"); hidden.setOnClickListener(v -> connectDialog(null));
        controls.addView(back); controls.addView(refresh); controls.addView(hidden); root.addView(controls);
        progress = new ProgressBar(this); progress.setVisibility(View.GONE); root.addView(progress);
        message = new TextView(this); message.setTextSize(15); root.addView(message);
        list = new ListView(this); root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        list.setOnItemClickListener((parent, view, position, id) -> connectDialog(networks.optJSONObject(position)));
        setContentView(root);
        try {
            KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType()); store.load(null);
            try (InputStream cert = getResources().openRawResource(R.raw.robot_wifi_ca)) {
                store.setCertificateEntry("robot-wifi", CertificateFactory.getInstance("X.509").generateCertificate(cert));
            }
            TrustManagerFactory trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            trust.init(store); SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, trust.getTrustManagers(), null); tls = context.getSocketFactory();
            scan();
        } catch (Exception error) {
            message.setText("无法初始化机器人配网连接，请更新安装包");
        }
    }

    private JSONObject request(String method, String path, JSONObject body) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(ENDPOINT + path).openConnection();
        connection.setSSLSocketFactory(tls);
        connection.setConnectTimeout(5000); connection.setReadTimeout(10000);
        connection.setRequestMethod(method);
        try {
            if (body != null) {
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int code = connection.getResponseCode();
            InputStream input = code < 400 ? connection.getInputStream() : connection.getErrorStream();
            if (input == null) throw new IOException("配网服务暂时不可用");
            ByteArrayOutputStream result = new ByteArrayOutputStream();
            try (InputStream stream = input) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = stream.read(buffer)) != -1) result.write(buffer, 0, count);
            }
            JSONObject value = new JSONObject(new String(result.toByteArray(), StandardCharsets.UTF_8));
            if (code >= 400) throw new IOException(value.optString("message", "配网请求失败"));
            return value;
        } finally { connection.disconnect(); }
    }

    private void ui(Runnable action) { main.post(() -> { if (!closed) action.run(); }); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void busy(boolean active) {
        progress.setVisibility(active ? View.VISIBLE : View.GONE);
        refresh.setEnabled(!active); hidden.setEnabled(!active); list.setEnabled(!active);
    }

    private void displayStatus(JSONObject value) {
        String ssid = value.optString("ssid", "");
        JSONArray addresses = value.optJSONArray("addresses");
        String ip = addresses != null && addresses.length() > 0 ? addresses.optString(0) : "未分配";
        status.setText("当前网络：" + (ssid.isEmpty() ? "未连接" : ssid) + "    IP：" + ip
                + "    " + (value.optBoolean("connected") ? "已连接" : "未就绪"));
    }

    private void scan() {
        busy(true); message.setText("正在通过接收机读取 104 的热点列表…");
        worker.execute(() -> {
            try {
                JSONObject state = request("GET", "/wifi/status", null);
                ui(() -> displayStatus(state));
                JSONObject pending = state.optJSONObject("operation");
                if (pending != null && "running".equals(pending.optString("state"))) poll(pending);
                poll(request("POST", "/wifi/scan", new JSONObject()));
                JSONObject latest = request("GET", "/wifi/status", null);
                ui(() -> displayStatus(latest));
            } catch (Exception error) { showError(error); }
            finally { ui(() -> busy(false)); }
        });
    }

    private void poll(JSONObject operation) throws Exception {
        String id = operation.getString("id");
        long deadline = System.currentTimeMillis() + 130000;
        while (!closed && "running".equals(operation.optString("state"))) {
            final String text = operation.optString("message", "正在处理…");
            ui(() -> message.setText(text));
            if (System.currentTimeMillis() > deadline) throw new IOException("操作仍在进行，请稍后刷新机器人状态");
            Thread.sleep(1000);
            operation = request("GET", "/wifi/operations/" + id, null);
        }
        if (closed) return;
        final JSONObject completed = operation;
        ui(() -> {
            message.setText(completed.optString("message", "操作完成"));
            JSONObject state = completed.optJSONObject("status");
            if (state != null) displayStatus(state);
            JSONArray values = completed.optJSONArray("networks");
            if (values != null) displayNetworks(values);
        });
    }

    private void displayNetworks(JSONArray values) {
        networks = values;
        String[] labels = new String[values.length()];
        for (int i = 0; i < labels.length; i++) {
            JSONObject item = values.optJSONObject(i);
            String type = item.optString("security");
            String security = "open".equals(type) ? "开放" : "sae".equals(type) ? "WPA3" : "wpa-psk".equals(type) ? "WPA/WPA2" : "暂不支持的企业或旧式网络";
            labels[i] = item.optString("ssid") + "    信号 " + item.optInt("signal") + "%    " + security
                    + (item.optBoolean("saved") ? "    已保存" : "");
        }
        list.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, labels));
    }

    private void connectDialog(JSONObject network) {
        boolean isHidden = network == null;
        if (!isHidden && "unsupported".equals(network.optString("security"))) {
            message.setText("首版支持普通个人热点和开放网络"); return;
        }
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        EditText ssid = new EditText(this); ssid.setSingleLine(true); ssid.setHint("Wi-Fi 名称");
        ssid.setText(isHidden ? "" : network.optString("ssid")); ssid.setEnabled(isHidden); box.addView(ssid);
        Spinner security = new Spinner(this);
        security.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"WPA/WPA2 密码网络", "WPA3 密码网络", "开放网络"}));
        if (isHidden) box.addView(security);
        EditText password = new EditText(this); password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setHint(!isHidden && network.optBoolean("saved") ? "留空使用机器人已保存的密码" : "Wi-Fi 密码");
        if (!isHidden && "open".equals(network.optString("security"))) password.setVisibility(View.GONE);
        box.addView(password);
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle("连接机器人 Wi-Fi")
            .setView(box).setNegativeButton("取消", null).setPositiveButton("连接", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String name = ssid.getText().toString();
            if (name.isEmpty()) { ssid.setError("请填写网络名称"); return; }
            try {
                String type = isHidden ? new String[]{"wpa-psk", "sae", "open"}[security.getSelectedItemPosition()] : network.getString("security");
                JSONObject body = new JSONObject().put("ssid", name).put("password", password.getText().toString()).put("security", type).put("hidden", isHidden);
                password.setText(""); dialog.dismiss(); busy(true); message.setText("正在提交机器人连接请求…");
                worker.execute(() -> {
                    try {
                        poll(request("POST", "/wifi/connect", body));
                        JSONObject state = request("GET", "/wifi/status", null); ui(() -> displayStatus(state));
                    } catch (Exception error) { showError(error); }
                    finally { body.remove("password"); ui(() -> busy(false)); }
                });
            } catch (JSONException error) { message.setText("网络信息无效，请刷新后重试"); }
        }));
        dialog.show();
    }

    private void showError(Exception error) {
        String text = error instanceof IOException ? error.getMessage() : "连接机器人配网服务失败，请检查接收机链路";
        ui(() -> message.setText(text == null ? "配网服务暂时不可用" : text));
    }

    @Override protected void onDestroy() {
        closed = true; worker.shutdownNow(); super.onDestroy();
    }
}
