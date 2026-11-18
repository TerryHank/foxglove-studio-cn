package dev.terryhank.g20.linkstick;

import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.util.Log;
import android.os.*;
import com.skydroid.rcsdk.*;
import com.skydroid.rcsdk.common.callback.CompletionCallbackWith;
import com.skydroid.rcsdk.common.error.SkyException;
import com.skydroid.rcsdk.key.RemoteControllerKey;
import java.net.*;
import java.nio.ByteBuffer;
import java.util.Arrays;

public final class StickService extends Service {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final HandlerThread worker = new HandlerThread("gr01-lan-udp");
    private Handler net;
    private PowerManager.WakeLock wakeLock;
    private DatagramSocket socket;
    private volatile boolean running;
    private boolean connected;
    private long lastAccepted;
    private volatile long generation;
    private long lastErrorLog;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(
                "lan-stick", "摇杆后台服务", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
        startForeground(1, new Notification.Builder(this, "lan-stick")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentTitle("LAN 摇杆服务运行中")
                .setContentText("遥控器摇杆通过 GR01 连接车辆")
                .setOngoing(true).setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE).build());
        wakeLock = getSystemService(PowerManager.class).newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "g20:lan-stick");
        wakeLock.acquire();
        running = true;
        worker.start();
        net = new Handler(worker.getLooper());
        RCSDKManager.INSTANCE.initSDK(getApplicationContext(), new SDKManagerCallBack() {
            public void onRcConnected() {
                ui.post(() -> {
                    if (!running) return;
                    connected = true;
                    ui.removeCallbacks(reconnect);
                    Log.i("G20Stick", "RC connected");
                });
            }
            public void onRcConnectFail(SkyException e) { offline("遥控器连接失败：" + e); }
            public void onRcDisconnect() { offline("摇杆连接已断开"); }
        });
        RCSDKManager.INSTANCE.setMainThreadCallBack(true);
        ui.post(reconnect);
        ui.post(poll);
        Log.i("G20Stick", "Background service started");
    }
    private void offline(String message) {
        ui.post(() -> {
            if (!running) return;
            connected = false;
            generation++;
            ui.removeCallbacks(reconnect);
            ui.postDelayed(reconnect, 3000);
            Log.w("G20Stick", message);
        });
    }
    private final Runnable reconnect = new Runnable() {
        public void run() {
            if (!running || connected) return;
            RCSDKManager.INSTANCE.connectToRC();
            ui.removeCallbacks(this);
            ui.postDelayed(this, 3000);
        }
    };
    private final Runnable poll = new Runnable() {
        public void run() {
            if (!running) return;
            ui.postDelayed(this, 100);
            if (!connected) return;
            long now = SystemClock.elapsedRealtime();
            long session = generation;
            KeyManager.INSTANCE.get(RemoteControllerKey.INSTANCE.getKeyChannels(), new CompletionCallbackWith<int[]>() {
                public void onSuccess(int[] values) {
                    if (!running || session != generation || now <= lastAccepted) return;
                    if (values == null || values.length < 16 || SystemClock.elapsedRealtime() - now >= 300) return;
                    lastAccepted = now;
                    int[] channels = Arrays.copyOf(values,16);
                    net.post(() -> send(now, session, channels));
                }
                public void onFailure(SkyException e) {
                    if (!running || session != generation || now <= lastAccepted) return;
                    // The existing car-side timeout handles missing samples.
                }
            });
        }
    };
    private void closeSocket() {
        if (socket != null) socket.close();
        socket = null;
    }
    private void send(long tick, long session, int[] channels) {
        if (!running || session != generation || SystemClock.elapsedRealtime() - tick >= 300) return;
        try {
            InetAddress local = InetAddress.getByName("192.168.144.11");
            if (socket == null) {
                NetworkInterface link = NetworkInterface.getByInetAddress(local);
                if (link == null || !"ar_net0".equals(link.getName())) throw new SocketException("ar_net0 未连接");
                socket = new DatagramSocket(new InetSocketAddress(local, 0));
                socket.connect(InetAddress.getByName("192.168.144.108"), 29420);
            }
            ByteBuffer b = ByteBuffer.allocate(44);
            b.putInt(0x4732304a).putLong(tick);
            for (int v : channels) b.putShort((short)v);
            socket.send(new DatagramPacket(b.array(), b.position()));
        } catch (Exception e) {
            closeSocket();
            if (tick - lastErrorLog >= 10000) {
                Log.w("G20Stick", "LAN send failed", e);
                lastErrorLog = tick;
            }
        }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onDestroy() {
        running = false;
        generation++;
        ui.removeCallbacksAndMessages(null);
        RCSDKManager.INSTANCE.disconnectRC();
        net.post(this::closeSocket);
        worker.quitSafely();
        if (wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }
}
