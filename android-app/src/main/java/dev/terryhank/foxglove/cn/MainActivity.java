package dev.terryhank.foxglove.cn;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;

/** Offline-bundled Web UI. No ROS or scheduling engine runs on Android. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 1001;
    private static final String DEFAULT_BRIDGE = "ws://192.168.144.108:8765";
    private WebView web;
    private LocalAssetServer server;
    private ValueCallback<Uri[]> fileCallback;
    private ProgressBar progress;
    private SharedPreferences preferences;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        preferences = getSharedPreferences("connection", MODE_PRIVATE);
        try { server = new LocalAssetServer(path -> getAssets().open("www/" + path), 18765); }
        catch (IOException e) {
            new AlertDialog.Builder(this).setTitle("无法启动界面")
                .setMessage("本地资源服务启动失败：" + e.getMessage())
                .setPositiveButton("退出", (d, w) -> finish()).setCancelable(false).show();
            return;
        }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(22, 25, 31));
        root.setFitsSystemWindows(true);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " FoxgloveAndroid");
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        // ACTION_OPEN_DOCUMENT grants access only to files selected by the user.
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        WebView.setWebContentsDebuggingEnabled(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (request.isForMainFrame() && "foxglove-android://settings".equals(uri.toString())
                    && view.getUrl() != null && isLocal(Uri.parse(view.getUrl()))) {
                    showAndroidSettings();
                    return true;
                }
                if (isLocal(uri)) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    new AlertDialog.Builder(MainActivity.this).setTitle("打开外部链接？")
                        .setMessage(uri.toString()).setNegativeButton("取消", null)
                        .setPositiveButton("浏览器打开", (d, w) -> {
                            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                            catch (ActivityNotFoundException e) { toast("未找到浏览器"); }
                        }).show();
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    new AlertDialog.Builder(MainActivity.this).setTitle("页面加载失败")
                        .setNegativeButton("取消", null)
                        .setPositiveButton("重载", (d, w) -> view.reload()).show();
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                progress.setVisibility(p == 100 ? View.GONE : View.VISIBLE);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, PICK_FILE); }
                catch (ActivityNotFoundException e) {
                    fileCallback.onReceiveValue(null); fileCallback = null; toast("未找到系统文件选择器");
                }
                return true;
            }
        });
        web.setDownloadListener((url, ua, disposition, mime, length) ->
            toast("此测试版尚未适配文件导出，请在桌面版导出布局或数据。"));
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        loadStudio(preferences.getString("bridge", DEFAULT_BRIDGE));
    }
    private boolean isLocal(Uri uri) {
        return server != null && "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())
            && uri.getPort() == Uri.parse(server.origin()).getPort();
    }
    private void loadStudio(String bridge) {
        Uri.Builder u = Uri.parse(server.origin() + "/").buildUpon();
        if (!bridge.isEmpty()) u.appendQueryParameter("ds", "foxglove-websocket").appendQueryParameter("ds.url", bridge);
        web.loadUrl(u.build().toString());
    }
    private void showAndroidSettings() {
        new AlertDialog.Builder(this).setTitle("Android 设置")
            .setItems(new String[]{"连接机器人", "重载界面", "显示/隐藏工具栏", "说明", "退出应用", "机器人 Wi-Fi"}, (dialog, which) -> {
                switch (which) {
                    case 0: connectionDialog(); break;
                    case 1: loadStudio(preferences.getString("bridge", DEFAULT_BRIDGE)); break;
                    case 2:
                        web.evaluateJavascript("document.documentElement.toggleAttribute('data-android-toolbar-visible')", null);
                        break;
                    case 3: about(); break;
                    case 4:
                        new AlertDialog.Builder(this).setTitle("退出应用？").setMessage("退出后机器人数据连接将中断。")
                            .setNegativeButton("取消", null).setPositiveButton("退出", (d, w) -> finish()).show();
                        break;
                    case 5: startActivity(new Intent(this, RobotWifiActivity.class)); break;
                }
            }).show();
    }
    private void connectionDialog() {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint(DEFAULT_BRIDGE);
        input.setText(preferences.getString("bridge", DEFAULT_BRIDGE));
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        TextView hint = new TextView(this);
        hint.setText("填写机器人的 Foxglove Bridge 地址，不是安卓设备地址。ws:// 为明文连接，仅用于可信局域网；正式部署使用 wss://。保存后将重载页面。");
        box.addView(hint); box.addView(input);
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle("连接机器人")
            .setView(box).setNegativeButton("取消", null)
            .setNeutralButton("不连接 / 打开本地文件", (d, w) -> {
                preferences.edit().putString("bridge", "").apply(); loadStudio("");
            }).setPositiveButton("保存并连接", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = input.getText().toString().trim();
            try {
                URI u = new URI(value);
                if (!("ws".equals(u.getScheme()) || "wss".equals(u.getScheme())) || u.getHost() == null
                    || u.getUserInfo() != null || u.getFragment() != null
                    || (u.getPort() != -1 && (u.getPort() < 1 || u.getPort() > 65535))) throw new URISyntaxException(value, "Invalid address");
                preferences.edit().putString("bridge", value).apply();
                loadStudio(value); dialog.dismiss();
            } catch (URISyntaxException e) { input.setError("请输入有效的 ws:// 或 wss:// 地址"); }
        }));
        dialog.show();
    }
    private void about() {
        new AlertDialog.Builder(this).setTitle("Foxglove 中文 · Android 测试版")
            .setMessage("基于 TerryHank/foxglove-studio-cn。不是 Foxglove 官方 Android 客户端。\n\n界面资源已内置 APK，机器人连接仍需要网络与 foxglove_bridge。\n\n推荐横屏平板。更新 Android System WebView；锁屏或切换后台可能断线。本应用不负责机器人安全控制。\n\n文件导出、桌面插件和大文件性能尚未完成移动端适配。\n\n原项目许可证 MPL-2.0，保留 LICENSE / NOTICE。")
            .setPositiveButton("知道了", null)
            .setNeutralButton("许可证", (d, w) -> web.loadUrl(server.origin() + "/NOTICE.android.txt"))
            .show();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }
    @Override public void onBackPressed() {
        showAndroidSettings();
    }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { web.stopLoading(); web.destroy(); }
        if (server != null) server.close();
        super.onDestroy();
    }
}
