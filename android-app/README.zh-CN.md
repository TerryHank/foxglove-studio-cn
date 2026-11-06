# Foxglove Studio 中文 Android 测试封装

这是 TerryHank/foxglove-studio-cn 的 Web 构建资源 + Android WebView 封装，不是 Foxglove 官方 Android 发行版，也不是 Android 调度引擎。

## 安装与连接

1. 安装 `foxglove-studio-cn-android-test.apk`。系统提示时，仅为正在使用的文件管理器/浏览器允许安装此 APK。
2. 要求 Android 8.0 / API 26 或更新版本；推荐较新的 Android 平板并更新 Android System WebView。此要求来自构建配置，不代表所有机型已通过验证。
3. 平板和机器人应在可互通的网络中，机器人运行 foxglove_bridge。在左上角 Foxglove 菜单中选“Android 设置 → 连接机器人”，填入机器人的真实地址，例如 `ws://192.168.1.20:8765`。
4. 查看 Foxglove 页面顶部的实际连接状态。“Android 设置”中也可以重载界面和查看说明。
5. 页面资源内置 APK，不需要额外网页服务器。不代表机器人数据、远程资源、在线地图也可以离线访问。
6. 本地 bag/MCAP 文件可通过 Foxglove 文件入口打开，Android 系统文件选择器已接入；大文件和各格式仍需实机验证。

Android 首次启动采用 `android-app/default-layout.json` 中的 104 三维点云、车模、电池电压和相机布局。之后恢复本机保存的布局。应用采用单实例启动，共享同一个本地页面地址与布局存储。

## 安全与限制

- 这是测试签名 APK，不是商店发行包。签名每次重新构建可能改变，更新时可能需要卸载旧版，卸载会清除布局与连接设置。
- 仅申请 INTERNET 权限。APK 内的静态资源服务仅绑定 127.0.0.1，不对局域网开放，也不代理任意文件或网络。
- 为兼容局域网 foxglove_bridge 允许明文网络。`ws://` 只能用于可信隔离网络；正式部署使用带认证的 `wss://`。没有忽略 TLS 证书错误。
- 在前台保持屏幕常亮；没有后台保活保证。切换后台、锁屏、断网可能中断连接，机器人必须自行实现超时停车等安全措施。
- 不要将此 App 作为急停或安全控制器。
- 未完成完整触控重设计、文件导出/下载、桌面扩展、package:// 本地资源适配。文件导出会显示明确提示，不会假报成功。
- WebGL、点云帧率、视频解码、内存占用、真机 ROS 连接仍需在目标设备测试。
- 不会自动更新，也不会上传数据到新增的分析服务。Foxglove 原有在线功能的行为仍由上游源码决定。

## 构建

需要 Linux/macOS、Node.js 20 + Corepack、JDK 17 或更新、Android SDK platform 35 / build-tools 35.0.0、Python 3、zip。

```bash
corepack enable
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 corepack yarn install --immutable
corepack yarn web:build:prod
export ANDROID_SDK_ROOT=/path/to/android-sdk
bash android-app/build-apk.sh
```

输出：`android-app/build/out/foxglove-studio-cn-android-test.apk`。

GitHub Actions 工作流 `.github/workflows/android-apk.yml` 执行相同构建，并上传 APK、SHA-256、签名校验结果、构建提交号和对应源码。主分支不需要改动即可在构建分支上执行。

## 许可证

保留上游 MPL-2.0 LICENSE、NOTICE 和来源声明。Android 封装文件同样以 MPL-2.0 提供。Web 构建产物携带的第三方许可证文件一并保留。修改后分发应保留对应源码与声明。品牌不表示官方认可。
