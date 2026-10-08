# Foxglove CN MCP 与 skill

基于本仓库cn.9的本机可视化HTTP接口，使用官方Python MCP SDK 2.2.0，stdio传输。
这是自定义MCP，不依赖官方Foxglove云账号或付费MCP。

## 安装和注册

当前机器Python C:/Python313/python.exe已经有mcp==2.2.0，不改动其现有依赖。
其他机器先使用自己的Python环境安装requirements.txt。

    python -m pip install -r integrations/foxglove-mcp/requirements.txt
    codex mcp add foxglove-cn -- C:/Python313/python.exe -X utf8 D:/Workspace/foxglove-studio-cn/integrations/foxglove-mcp/server.py

将skill/foxglove复制到用户的~/.codex/skills/foxglove。
配置变动后的工具是否进入当前会话取决于客户端重载；开启新会话可重新发现skill和MCP。
不要为此中断正在执行的机器人任务。

## 八个工具

| 工具 | 功能 | 是否改界面 |
|---|---|---|
| get_status | 连接/话题/计数/问题/IMU与odom缓存 | 否 |
| get_layout | 当前名称和布局JSON | 否 |
| list_demo_layouts | 18个示例profile | 否 |
| select_demo_layout | 应用一个已验证布局 | 是 |
| set_layout | 自定义内置面板配置，自动备份旧布局 | 是 |
| connect | ws/wss可视化数据源 | 是 |
| capture_screenshot | 返回MCP PNG ImageContent | 否 |
| open_desktop | 打开/复用中文版及其API | 是 |

布局支持3D、Plot、Image、RawMessages和固定地址的LukaConsole；无用户脚本/发布面板/任意shell/ROS写工具。LukaConsole业务按钮由操作者点击，MCP不执行这些操作。
这些工具不会启动机器人ROS硬件，不会发送速度或导航目标。

## 配置

默认读取%APPDATA%/foxglove-studio-cn/demo-control.json；Linux读取~/.config/foxglove-studio-cn/demo-control.json。
每次请求重读当前token，避免客户端重启后的旧令牌缓存。MCP配置中不含token。
API地址限定loopback HTTP，不把Authorization转发给网络地址。
可用FOXGLOVE_API_CONFIG覆盖配置路径，FOXGLOVE_LAYOUTS_DIR覆盖布局目录；这些是服务端环境设置。

API: 127.0.0.1:7334。open_desktop通过系统登记的中文版入口开启--demo-control。
机器人的数据通路沿用integrations/luka-contract-demo/start_demo.ps1。
connect不会建立SSH隧道；需要查看Luka远端时先跑该启动器，默认不加-Run。

## 验证

    python -X utf8 integrations/foxglove-mcp/test_server.py
    python -X utf8 integrations/foxglove-mcp/verify_live.py

verify_live使用真实stdio MCP客户端发现8工具，读状态/布局，选择测试布局，读回名称，
取得实际窗口PNG ImageContent，最终恢复原布局。不会发机器人指令。
测试截图写入本机应用数据目录/luka-contract-demo/foxglove-mcp-verification.png，不进Git。
本机7项单元测试及真实MCP调用通过；这不代表机器人运动闭环验收。

来源：
- https://github.com/TerryHank/foxglove-studio-cn
- desktop-cn/demo-control.cjs
- packages/studio-base/src/components/DemoControlAdapter.tsx
- https://github.com/modelcontextprotocol/python-sdk
- https://developers.openai.com/codex/mcp