# G20 视觉跟随 v60 恢复备份

可直接安装 [已签名 APK](robot-follow-v60-continuous-pose-overlay.apk)。包名为 `dev.terryhank.robot.follow`，版本为 `60 / 1.9.17-continuous-pose-overlay`。归档 APK 与验收后从 G20 读取的包 SHA-256 一致。签名证书 SHA-256 为 `99e46b225b8892a47b708d5ff9932dffb8eecbf9224ddf14fec847329017fd73`。

人框和骨骼共用同一个跟踪结果，优先采用同帧数据，短暂缺帧时回用最近 180 ms 内的结果。G20 连接 124 的真人走动验收中，连续 7.45 秒内 184 个叠加采样均有人框和骨骼，画面与骨骼时间差 P95 为 33 ms。约 10 秒预览平均 26.4 FPS。测试全程底盘关闭。

## 安装归档 APK

```powershell
$apk = 'backups/g20-vision-follow-v60-20261121/robot-follow-v60-continuous-pose-overlay.apk'
Get-FileHash -Algorithm SHA256 $apk
adb devices -l
adb install -r $apk
```

从仓库根目录执行。将哈希与 [SHA256SUMS.txt](SHA256SUMS.txt) 对照。多台设备连接时，用 `adb -s <设备序列号> install -r $apk` 指定 G20。归档包可覆盖同签名的 v60 或更早版本并保留 App 数据。

## 从源码重建

使用 Python 3、JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。入口为 [build-standalone.py](../../android-app/scripts/build-standalone.py)，视觉界面和绘制源码位于 [android-app/vision](../../android-app/vision)，原生入口为 [VisionFollowActivity.java](../../android-app/src/main/java/dev/terryhank/foxglove/cn/VisionFollowActivity.java)。从归档 APK 取回原版许可说明，然后直接构建视觉跟随 APK。

```powershell
$env:ANDROID_SDK_ROOT = 'C:/Android/Sdk'
$apk = 'backups/g20-vision-follow-v60-20261121/robot-follow-v60-continuous-pose-overlay.apk'
python -c "from pathlib import Path; from zipfile import ZipFile; import sys; p=Path('android-app/src/main/assets/www'); p.mkdir(parents=True,exist_ok=True); z=ZipFile(sys.argv[1]); [(p/n).write_bytes(z.read('assets/www/'+n)) for n in ('LICENSE','NOTICE','NOTICE.android.txt')]" $apk
python android-app/scripts/build-standalone.py follow --unsigned
```

重建产物位于 `android-app/build/out/robot-follow-android-unsigned.apk`。重新签名并覆盖安装时，使用原来的签名库，通过本机环境变量或安全输入提供签名口令。直接恢复时使用上面的已签名 APK。
