package dev.terryhank.foxglove.cn;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.*;

/** Tracking UI bundled with the app, connected to the existing robot bridge. */
public final class VisionFollowActivity extends Activity {
    private WebView web;
    private LocalAssetServer server;
    private String launchUrl;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
        launchUrl = url;
        Uri origin = Uri.parse(url);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("foxglove-android://back".equals(uri.toString())) { finish(); return true; }
                return !(origin.getScheme().equals(uri.getScheme()) && origin.getHost().equals(uri.getHost()) && origin.getPort() == uri.getPort());
            }
        });
        setContentView(web);
        web.loadUrl(url);
    }
    @Override protected void onPause() {
        if (server != null && web != null) web.loadUrl("about:blank");
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null && "about:blank".equals(web.getUrl())) web.loadUrl(launchUrl);
    }
    @Override protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); }
        if (server != null) server.close();
        super.onDestroy();
    }
}
