package dev.terryhank.foxglove.cn;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Tracking UI bundled with the app, connected to the existing robot bridge. */
public final class VisionFollowActivity extends Activity {
    private WebView web;
    private LocalAssetServer server;
    private boolean foreground;
    private long previewStartedAt;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xff15151a);
        LinearLayout loading = new LinearLayout(this);
        loading.setOrientation(LinearLayout.HORIZONTAL);
        loading.setGravity(Gravity.CENTER);
        loading.addView(new ProgressBar(this));
        TextView label = new TextView(this);
        label.setText("  正在打开视觉跟随…");
        label.setTextColor(0xfff1edf9);
        label.setTextSize(16);
        loading.addView(label);
        root.addView(loading, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.post(() -> openPreview(root, loading));
    }

    private void openPreview(FrameLayout root, View loading) {
        if (isFinishing() || isDestroyed()) return;
        String url = getPackageName().endsWith(".follow") ? null : getIntent().getStringExtra("url");
        if (url == null) {
            try { server = new LocalAssetServer(path -> getAssets().open("www/" + path), 18767); }
            catch (java.io.IOException error) {
                new android.app.AlertDialog.Builder(this).setMessage("无法打开视觉跟随界面")
                    .setPositiveButton("退出", (d, w) -> finish()).show();
                return;
            }
            url = server.origin() + "/vision-follow.html?standalone=1&bridge=" + Uri.encode("ws://192.168.144.108:8765");
        }
        Uri origin = Uri.parse(url);
        web = new WebView(this);
        web.setBackgroundColor(0xff15151a);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.message().startsWith("RGB_FIRST_PREVIEW ")) {
                    android.util.Log.i("FOLLOW_STARTUP", "first_preview_ms=" + (SystemClock.elapsedRealtime() - previewStartedAt)
                            + " route=" + message.message().substring("RGB_FIRST_PREVIEW ".length()));
                }
                if (message.message().startsWith("RGB_")) {
                    android.util.Log.i("RGB_LATENCY", message.message());
                    return true;
                }
                if (message.message().startsWith("VISION_MODE_READY ")) {
                    android.util.Log.i("FOLLOW_MODE", message.message());
                    return true;
                }
                return super.onConsoleMessage(message);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String loadedUrl) {
                view.evaluateJavascript("window.omnifleetFollowForeground?.(" + foreground + ")", null);
                loading.setVisibility(View.GONE);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("foxglove-android://back".equals(uri.toString())) { finish(); return true; }
                return !(origin.getScheme().equals(uri.getScheme()) && origin.getHost().equals(uri.getHost()) && origin.getPort() == uri.getPort());
            }
        });
        root.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
        web.loadUrl(url);
    }
    @Override protected void onPause() {
        foreground = false;
        if (web != null) {
            web.evaluateJavascript("window.omnifleetFollowForeground?.(false)", null);
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        previewStartedAt = SystemClock.elapsedRealtime();
        if (web != null) {
            web.evaluateJavascript("window.omnifleetFollowForeground?.(true)", null);
        }
    }
    @Override protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); }
        if (server != null) server.close();
        super.onDestroy();
    }
}
