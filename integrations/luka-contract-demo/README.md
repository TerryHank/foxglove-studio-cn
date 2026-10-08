# Luka 合同功能演示：Foxglove Studio 中文版

客户端：TerryHank/foxglove-studio-cn，Windows x64开发版本1.86.0-cn.9。
不需要官方Foxglove账号、订阅或MCP令牌。这里提供本机HTTP API，不冒充官方MCP。

## 一键启动

在本机PowerShell中运行：

    pwsh -NoProfile -ExecutionPolicy Bypass -File D:\Workspace\foxglove-studio-cn\integrations\luka-contract-demo\start_demo.ps1 -Item 03 -Run

- Item选择01至27；01和02进入同一底盘演示。
- 不带-Run：只打开本机客户端、连接桥接并选布局，不启动远端设备。
- 带-Run：随后通过现有ROS launch启动远端对应功能。01/02需要交互终端，键盘输入走已有保护手动出口。
- 建立联动后，远端各demo.sh或menu.sh也会自动选择对应布局。
- Ctrl+C终止远端launch；也可使用对应远端stop.sh。复用的既有服务保留。
- 环境、文档、交付检查和未实现/服务承诺项没有伪造传感器场景。
- 本机目录移动后，按实际绝对路径调整启动命令。

## 连接

- 本机API：127.0.0.1:7334，只有--demo-control模式启用。
- WebSocket：SSH本地转发127.0.0.1:18765 → 机器人127.0.0.1:8765。
- API：SSH反向转发机器人127.0.0.1:17334 → 本机127.0.0.1:7334。
- 机器人：sunrise@192.168.3.150；密钥认证，不保存SSH密码。
- 本机令牌：%APPDATA%\foxglove-studio-cn\demo-control.json，Windows启动器限制其ACL。
- 远端令牌：~/luka_data/recordings/contract_demo/foxglove_client.json，权限600。
- Token/隧道状态/截图/现场日志不进入Git。app退出后API关闭；机器人重启后重跑启动器刷新隧道。

## 可调用接口

请求都携带Authorization: Bearer <本机令牌>。
- GET /status：连接、话题、订阅、计数、IMU/里程计反馈预览。
- GET /layout：当前布局。
- POST /layout：{name,data}，只接受3D/Plot/Image/RawMessages，没有用户脚本或发布面板。
- POST /connect：{url}，只接受ws/wss数据源。
- GET /screenshot：PNG截图。
- 切换前的布局自动备份至%APPDATA%\foxglove-studio-cn\demo-layout-backups。
- 接口不能发速度、目标、服务调用或执行shell。实际键盘/导航操作仍经过已有机器人门控。
- 18份布局位于layouts/，生成器build_layouts.py可重建。16UC1深度图用0–8000 mm彩色显示。

## 验证

2026-10-08：
- 网页生产构建、TypeScript检查、Windows x64 NSIS打包通过。
- 18布局校验、禁用脚本/命令面板、HTTP鉴权/Origin/路由/备份测试通过。
- 本机模拟fixture在18766端口验证绘图和ROS2 CDR RGB-D解码，明确标SIMULATED，无ROS连接。
- 真实IMU曲线、RGB画面、彩色深度、融合/去畸变LaserScan及3D场景已在本机显示。
- 启动/停止通过既有launch，未下发实车运动目标或速度指令。
- 01/02实车键盘运动、导航/巡航/返航等闭环仍待现场验收。
- 远端一次高负载导致SSH/数据流中断；用户重启后连接恢复并复验。未改动其他运行服务。
- 切换功能前刷新可视化连接，避免已停止话题的协议告警残留；不修改机器人数据。
- 现场图像和截图仅保存在本机应用数据目录，不上传公开源码仓库。

## 回退

卸载新版中文版即可撤销Windows程序；源码改动在独立分支。
官方3.3.0的用户布局/存储已备份在：
%LOCALAPPDATA%\luka-contract-demo\backups\official-foxglove-3.3.0-20261008。
远端只改动examples的布局选择与manifest，不修改算法参数、ROS消息包或安全门。