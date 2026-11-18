package dev.terryhank.g20.linkstick;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

public final class StickActivity extends Activity {
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        startForegroundService(new Intent(this, StickService.class));
        finish();
    }
}
