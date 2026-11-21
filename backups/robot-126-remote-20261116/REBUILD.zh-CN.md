# 从可编辑源码重建 G20 导航 App

当前构建面向已实测的 G20 + GR01 LAN + 124 车端。Android 包名为 `dev.terryhank.robot.navigation`，versionCode 为 18。车模和控制器使用车端发布的 `map → base_link`。导航使用车端 WebSocket 消息校时，并订阅遥控器用的轻量地图、点云和相机。

## 编译

需要 Git LFS、Node.js 和 Corepack、JDK 17、Python 3、Android SDK Platform 35 与 Build Tools 35.0.0。下列步骤在 Windows PowerShell 验证，使用 Node.js 24.18.0。原 CI 使用 Node.js 20。Corepack 按 package.json 加载 Yarn 3.6.3。

```powershell
git clone --branch backup/robot-126-remote-apps-20261116 --single-branch https://github.com/TerryHank/foxglove-studio-cn.git foxglove-g20
Set-Location foxglove-g20
git lfs pull
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
corepack yarn install --immutable
corepack yarn web:build:prod

$env:ANDROID_SDK_ROOT = 'C:/Android/Sdk'
$env:PYTHONUTF8 = '1'
python android-app/scripts/prepare-assets.py
python android-app/scripts/build-standalone.py navigation --unsigned
```

SDK 路径需包含 `platforms/android-35/android.jar` 和 `build-tools/35.0.0`。JDK 的 `java` 和 `javac` 需在 PATH 上。产物为 `android-app/build/out/robot-navigation-android-unsigned.apk`。Linux 使用对应的环境变量、`python3` 和 SDK 工具。

## 签名和安装

覆盖现装导航 App 必须使用其原签名私钥。将原签名库路径及别名设为 G20_SIGNING_KEYSTORE 和 G20_SIGNING_ALIAS，通过本机私密输入机制将口令注入 G20_SIGNING_PASSWORD。签名前先核对已安装包的证书指纹，签名后核对产物。也可直接下载 [已签名的导航 v18](navigation-v18/robot-navigation-v18-lan.apk) 安装。

```powershell
$signer = "$env:ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner.bat"
& $signer sign --ks $env:G20_SIGNING_KEYSTORE --ks-key-alias $env:G20_SIGNING_ALIAS --ks-pass env:G20_SIGNING_PASSWORD --out android-app/build/out/robot-navigation-android.apk android-app/build/out/robot-navigation-android-unsigned.apk
& $signer verify --print-certs android-app/build/out/robot-navigation-android.apk
adb devices -l
$serial = 'c37cad96'  # 若是另一台 G20，换成实际序列号
adb -s $serial install -r android-app/build/out/robot-navigation-android.apk
```

覆盖安装保留设备布局和配置。在装包较新时，从所需 Git 提交重建并递增 versionCode。打开「机器人导航」，连接 `ws://192.168.144.108:8765`，核对地图、车模、相机、电压及 `map → base_link`。本次 APK 内附源码提交 `818c53c9fae68c1fa7ea2ca46e4c8763a8af4099`，实机经 GR01 LAN 口连接 124 后读取了车模与控制位姿。[实机采样](navigation-v18/verification.json)

## GR01 LAN 摇杆恢复

GR01 的 LAN 口接车端 Orin NX。G20 的 `ar_net0` 是 `192.168.144.11`，车端 LAN 网卡是 `192.168.144.108`。G20 上的「LAN 摇杆」后台服务采样并将 16 路通道发到 `192.168.144.108:29420/UDP`。

- [LAN 摇杆 v3 APK](lan-joystick/g20-lan-stick.apk) 的可编辑 Java 源码和构建脚本在同目录。源码构建使用 JDK 17、Android SDK 35、Skydroid RCSDK Demo 的 `rcsdk-v1.9.2.aar`、`h16_airlink.aar`、Kotlin stdlib 1.9.24 和原签名库。参数可用 `python build.py --help` 查看。
- 124 上的 [LAN 接收器](lan-joystick/link_joystick.py) 位于 `/home/iecme/g20-lan-joystick`，随 [g20-lan-joystick.service](lan-joystick/g20-lan-joystick.service) 启动。用 `systemctl is-active g20-lan-joystick` 和 `journalctl -u g20-lan-joystick -n 10` 查看服务和收包。
- 接收器向 `/chassis/g20_lan_channels` 发布原始通道。124 底盘驱动通过 [对应补丁](lan-joystick/chassis-lan-sbus.patch) 接入原 SBUS 仲裁。从车端工作区根目录对照版本，用 `git apply --check` 检查补丁。CH5 最低档锁停并取消导航；切到行驶档可解锁。CH3 控制前后，CH1 控制转向。推杆接管并取消导航，回中释放后可重发目标。
- 车端 `omnifleet-receiver-display` 提供轻量地图、点云和相机，`omnifleet-current-pose` 提供控制位姿及车模 TF。恢复后在导航页面打开时检查 LAN 接收器仍持续收包，并核对停车档与底盘反馈。
