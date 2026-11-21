# 126 遥控器 App 备份

2026-11-18 已从源码编译并实测 [G20 导航 v18](navigation-v18/robot-navigation-v18-lan.apk)，同时收录 [LAN 摇杆 v3 和 124 车端接收代码](lan-joystick/)。编译、签名、安装和接线见 [构建与恢复步骤](REBUILD.zh-CN.md)。原始 2026-11-16 快照如下。

2026-11-16 通过 ADB 从 126 的 G20 遥控器读取三个独立 App。每个 APK 都是设备当前安装的原签名文件，可用本目录的 `SHA256SUMS.txt` 校验。

| App | 包名 | versionCode | APK | 可重建源码包 |
| --- | --- | ---: | --- | --- |
| 机器人导航 | `dev.terryhank.robot.navigation` | 16 | [APK](robot-navigation.apk) | [源码包](robot-navigation-apktool-source.zip) |
| 视觉跟随 | `dev.terryhank.robot.follow` | 38 | [APK](robot-follow.apk) | [源码包](robot-follow-apktool-source.zip) |
| 机器人 Wi-Fi | `dev.terryhank.robot.wifi` | 4 | [APK](robot-wifi.apk) | [源码包](robot-wifi-apktool-source.zip) |

## 源码

Git 分支基于上一版 126 Android 源码 `f80132ccb5f07c3abb1bc03798b8a2030c931847`，保留 Java、TypeScript、构建脚本及可编辑页面。视觉跟随的 HTML/JS 和导航启动脚本来自在装 APK。导航的历史改动也曾直接写入编译产物，Git 中的可编辑工程未验证能够从头生成三份在装 APK。

源码 ZIP 来自各在装 APK，含 Android Manifest、资源、Smali 和应用内网页资源。导航包也保留 APK 内已有的 source map。解压到单独目录后可用 Apktool 3.0.3 重建无签名 APK，例如 `java -jar apktool_3.0.3.jar b robot-navigation-src -o robot-navigation-unsigned.apk`。三份重建包均已核对包名、版本、`classes.dex` 和全部应用内资源 `assets/` 的内容。恢复安装优先使用表中的原签名 APK。源码备份不含签名私钥或遥控器 App 数据。
