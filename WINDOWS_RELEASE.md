# Windows 下载与 skill

本分支保存本机 Foxglove Studio CN 的源码快照，包含 Windows 桌面打包脚本、中文界面、自定义面板、MCP 服务和 Codex skill。

## 下载

[Windows 发布页：v1.86.0-cn.21-windows](https://github.com/TerryHank/foxglove-studio-cn/releases/tag/v1.86.0-cn.21-windows)

- `foxglove-studio-cn_1.86.0-cn.21_x64.exe`：Windows x64 中文版安装包。
- `foxglove-skill-windows.zip`：本机已安装的 Foxglove skill，包含 `SKILL.md`、`agents/openai.yaml` 和 `references/layouts.md`。
- `SHA256SUMS.txt`：附件 SHA-256 校验值。

安装包是本机已有的 2026-10-09 构建，版本为 `1.86.0-cn.21`。源码是本次上传时的工作区快照，发布于 2026-10-12；本次上传未重新构建安装包，不能仅凭版本号认定安装包与所有源码文件完全对应。

## 安装 skill 与 MCP

将压缩包中的 `foxglove` 目录复制到 `%USERPROFILE%\.codex\skills\foxglove`。

克隆本分支后，按 [MCP 安装说明](integrations/foxglove-mcp/README.md) 安装依赖并注册服务。把说明中的 Python 和仓库路径替换为自己的实际路径。

skill 源码位于 [integrations/foxglove-mcp/skill/foxglove](integrations/foxglove-mcp/skill/foxglove)，与本次发布的本机已安装 skill 逐文件核对一致。

## 从源码构建 Windows 安装包

在安装 Node.js、Corepack 和所需构建依赖后，于仓库根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-desktop-cn.ps1
```

安装包生成在 `desktop-cn/dist/`。该目录的构建产物通过 Release 发布；Git 分支保存源码。

## Windows 本机参数链接（2026-10-24）

- 单车导航参数面板的“说明”在 Windows 默认浏览器打开 Nav2 官方页面，并显示浏览器调用失败的原因。
- 参数标题按当前连接机器人的配置目录信息，通过 Windows OpenSSH 下载文件，再用本机 VS Code 跳到对应行列；未安装 VS Code 时使用默认文件编辑器。
- 下载副本位于 `%APPDATA%/foxglove-studio-cn/remote-configs/<机器人地址>/snapshot-*/`，旁边的 `.source.json` 记录远端路径与下载时间。每次点击新建副本，本机编辑不会自动上传。
- SSH 使用本机已有配置与密钥（例如 `%USERPROFILE%/.ssh/config` 中对应机器人主机的 `User iecme`）；连接或认证失败会显示错误，不会退回到机器人桌面打开。
- 回归验证：`node --test desktop-cn/test-parameter-links.cjs`。

此项更新属于 Windows 分支源码；上面的 CN.21 旧安装包未包含这次改动。本机已安装客户端另行更新。
