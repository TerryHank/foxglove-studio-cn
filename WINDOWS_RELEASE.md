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
