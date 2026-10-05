# Foxglove Nav2 永久参数（113）

面板按钮为“保存并应用”。永久文件保存成功和当前运行节点应用成功是两个独立结果。

实际启动入口通过 `omnifleet_planner` 的安装目录读取 `config/nav2_t2.yaml`。
该文件当前是源码 YAML 的软链接：
`/home/iecme/workspace/omnifleet_t2_ws/src/omnifleet_planner/config/nav2_t2.yaml`。
服务解析软链接后更新源码文件，因此下一次启动及正常重建会保留值。
临时的 `/tmp/launch_params_*` 不会被当成永久文件修改。

面板还提供全局规划器和局部控制器选择。全局规划器包括 Smac 2D、NavFn（可选 A* 或
Dijkstra）和 Theta*；局部控制器包括 Hot DWB、Regulated Pure Pursuit 和 MPPI。
这些插件会在 Nav2 启动时同时加载，面板通过 `/planner_selector` 和 `/controller_selector`
发布选择，因此切换算法不需要重启；算法下方的常用子参数也会随选择动态显示，保存后按当前
插件能力尝试热应用，不能热应用时面板会明确标注“下次启动读取新值”。

配置依据 Nav2 官方资料：多插件配置与选择见
`https://docs.nav2.org/jazzy/configuration_and_development/first_time_robot_setup_guide/navigation_plugins/setup_navigation_plugins/`；
selector 的输入话题要求 reliable + transient local QoS，见
`https://docs.nav2.org/rolling/configuration_and_development/configuration_guide/core_servers/bt_plugins/actions/PlannerSelector/`
和 `ControllerSelector/`；NavFn、RPP、MPPI 和 Theta* 的参数分别以 Nav2 Humble 官方文档为准。

面板保留局部和全局膨胀半径、代价衰减系数、footprint 安全边界、导航最大线速度、最大角速度，
以及 DWB 障碍物/路径权重、全局规划代价权重和未知区域开关。
线速度一项在一次原子文件替换中同步更新 `FollowPath.max_vel_x` 和
`FollowPath.max_speed_xy`，运行时也通过 SetParametersAtomically 同步应用。
速度是上限，不保证机器人实际达到该速度。

`nav2_parameter_store.py` 提供：

- `/omnifleet_t2/nav2/read_saved` (`std_srvs/srv/Trigger`)：JSON 格式的磁盘保存值。
- `/omnifleet_t2/nav2/save_parameters` (`rcl_interfaces/srv/SetParameters`)：请求名称是
  面板中的数值子参数，以及 `global_planner_algorithm` 和 `local_controller_algorithm`。
  服务只接受白名单内的有限数值、布尔值和算法字符串。`successful` 指文件写入并回读成功；`reason` 中的 JSON
  包含文件路径、备份、SHA256 及各节点运行时回读结果。

保存仅替换 YAML 数值标量，保留其他配置与注释，数值保留浮点类型。
有变化时先备份，再 fsync / 原子替换。备份位于
`/home/iecme/.local/share/omnifleet_t2/nav2-parameter-backups/`。
Nav2 未运行或实时参数请求失败时，永久保存仍可成功；面板明确显示当前实例未确认，
不会将其当作运行时已生效。保存不启动导航、不重启 Nav2、不发送运动指令。

永久服务随开机启动：

```bash
sudo systemctl restart omnifleet-t2-nav2-parameters.service
sudo systemctl restart omnifleet-t2-foxglove.service
```

Foxglove 使用 `Nav2PermanentPanel.js`。当前中文构建没有本地扩展 loader，
`deploy_panel.py` 将同一源函数注册到现有内置面板位置，并同步扩展源码包装入口。
运行包修改前留备份，运行包升级后需重新集成该面板。
本次未修改航点逻辑；地图航点绑定版本已从本地部署源恢复，12 项既有测试通过。

验证：`python3 -m pytest test_parameter_store.py -q`，覆盖全部 6 项数值类型、
双速度联动、软链接、备份、拒绝非法写入和未涉及参数不变。
从真实面板把线速度 0.4 改为 0.35 并获得永久保存及运行时回读确认，
独立 ROS 参数加载进程用安装 YAML 读到 [0.35, 0.35]，随后从面板恢复 0.4。
未为验证重启真实 Nav2 或移动小车。

当前 113 实验导航栈的手动启动命令（先正常停止已有 Nav2，避免重复节点）：

```bash
source /opt/ros/humble/setup.bash
source /home/iecme/workspace/hardware_drivers_ws/install/setup.bash
source /home/iecme/workspace/mola_3_2_ws/install/setup.bash
source /home/iecme/workspace/omnifleet_t2_ws/install/setup.bash
source /home/iecme/workspace/omnifleet_t2_mola_experiments_ws/install/setup.bash
export ROS_DOMAIN_ID=73 RMW_IMPLEMENTATION=rmw_fastrtps_cpp FASTDDS_BUILTIN_TRANSPORTS=LARGE_DATA
cd /home/iecme/workspace/omnifleet_t2_mola_experiments_ws
ros2 launch omnifleet_t2_mola_experiments nav2_direct.launch.py transform_tolerance:=0.8 odom_topic:=/odom obstacle_topic:=/rslidar_points obstacle_clearing:=true
```

这是本次读取的实际运行参数组合；MOLA/地图由原有进程负责。
永久参数服务停止命令：`sudo systemctl stop omnifleet-t2-nav2-parameters.service`。
Foxglove 可关闭窗口停止，或运行 `/home/iecme/.local/bin/start-foxglove-single.sh` 手动打开。
