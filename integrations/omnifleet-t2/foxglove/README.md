# OmniFleet T2 Foxglove 集成快照

本目录保存从机器人工作区导出的 Foxglove 布局、面板扩展、诊断与部署源码。快照采集于 2026-10-06，原始工作区相对路径为 `workspace/omnifleet_t2_ws/foxglove/`。

## 内容

- `fleet_panel/layout-updated.json`：机器人工作区保存的更新布局文件，远端文件时间为 2026-09-24。它是可读的布局 JSON，不包含 Electron 本地配置数据库、Cookie 或用户 profile。
- `nav2_permanent_panel/`、`dsh_diagnostic_panel/`：Nav2 参数、诊断面板及配套脚本、服务和测试。
- `foxglove_extension/omnifleet-t2-semantic-waypoints/`：扩展源码及依赖清单。
- `app_patch/`、`fleet_panel/`：Foxglove 面板补丁、编队面板源码和操作说明。
- 桌面版默认布局与急停/遥控面板实现位于仓库源码的 `packages/studio-base/`，并与本快照一起同步。

`SOURCE_MANIFEST.tsv` 列出每个集成文件在机器人上的原始相对路径、大小和 SHA-256；仓库对文本文件使用 LF 规范化，并清除了 `dsh_runner.py` 中一处行尾空格。缓存、`node_modules`、旧 `.before` 文件、旧布局备份、扩展构建目录与 `.foxe` 发布包没有纳入此源码快照。

## ARM64 安装包

机器人上的安装包以 GitHub Release 资产上传，不放入 Git 历史：[`foxglove-studio-cn_1.86.0-cn.8_arm64.deb`](https://github.com/TerryHank/foxglove-studio-cn/releases/download/v1.86.0-cn.8/foxglove-studio-cn_1.86.0-cn.8_arm64.deb)。dpkg 元数据为 `foxglove-studio-cn-desktop`、`1.86.0~cn.8`、`arm64`；SHA-256 见 `ARTIFACTS.tsv`。

这个 `.deb` 的远端文件时间是 2026-07-30。部分源码/布局文件在之后修改；此次没有从快照重建安装包，因此不把安装包声明为包含全部后续面板布局变更的构建产物。

## 复用注意

快照保留了设备专用的绝对路径和内网配置引用，不能直接当作其他设备的通用部署包。实际凭据文件和 Foxglove 用户配置目录没有上传。