# 十二中 Foxglove 104 视觉案例

2026-11-05 从十二中 Windows 桌面入口“Foxglove－104 视觉案例”指向的已部署程序备份。启动参数为 `--demo-control --vision-demo`。桌面入口由安装程序重建，因此无需分发含原电脑用户路径的快捷方式文件。

- `app-web/`：视觉案例、104 面板脚本与网页加载入口。
- `desktop/`：从当前 Electron 应用归档提取的启动代码、内置布局及案例配置。安装器的快捷方式脚本也在此目录。
- [Windows 安装包](https://github.com/TerryHank/foxglove-studio-cn/releases/tag/v1.86.0-cn.21-windows)：104 专用附件为 `Foxglove-104-Vision-Setup-x64.exe`，安装后从“Foxglove－104 视觉案例”启动。完整安装包包含 Foxglove 网页运行资源，本目录只备份与面板相关的文件。
- 案例数据源使用原有 104 局域网连接，恢复使用时需要能够访问该车的 Foxglove bridge。
