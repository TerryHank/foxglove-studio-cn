"""Generate the operator acceptance guide from the audited clause index."""
import argparse
import csv
import html
import json
from pathlib import Path

# action | observable evidence | item-level acceptance condition
CASES={
"01":("启动01；原生控制→启用本次方向操作→低速方向键，逐一短按前/后/左移/右移/转向，松开和立即停车。",
"记录/wheel/odom、底盘gate、通信错误日志；观察反馈是否连续且松开停止。",
"上位机链路演示可通过；整项还需STM32固件、串口/RS485/CAN协议及异常恢复实测。当前缺固件/CAN，不能整项通过。"),
"02":("复用01场景；按事先量好的直线距离（例如0.50m）低速前进、停车，再验证后退/横移/转向。",
"终端x/y/yaw、vx/vy/wz、measured_path与尺量/角度测量对照；记录设定速度、实测速度和停止误差。",
"双方填写距离/角度/速度误差容限并验证闭环；当前麦克纳姆与合同四轮差速存在车型差异，需先明确验收模型。"),
"03":("启动03看原始六轴；改变可测试的传感器姿态和角运动。融合测试先启动01，再在第二个终端03 -WithEkf -Run。",
"加速度/角速度/姿态/协方差及时间戳；EKF面板需出现/contract_demo/odometry/filtered，同时有有效/wheel/odom。",
"必须验证六轴、姿态及多传感器融合，不把默认原始IMU显示当完整融合验收。偏置、噪声和精度门槛由双方填写。"),
"04":("启动04；在视野内移动/遮挡一个测试目标，对照原扫描、融合和去畸变。运动去畸变测试先启动01再运行04。",
"扫描点数、最近距离、目标位置、原/去畸变差异和时间戳。静止输出相同不能证明去畸变效果。",
"驱动/滤波/稳定性及受控运动去畸变均需记录；目前是2D LaserScan，不应宣称已交付完整3D点云链。"),
"05":("启动05；图像面板观察不同距离目标，移动目标；与尺量距离对照，可在图像中查看深度像素。",
"RGB、彩色16UC1深度图、终端中心深度（米）、图像帧计数、有效像素/盲区。",
"预先填写距离误差、持续时长、帧率和允许丢帧阈值；逐距离实测而非只确认一帧图像。"),
"06":("执行06检查；Foxglove原始消息/Topic Graph查看状态；终端查看资源和服务。另按交付流程从干净源码完成colcon构建、测试、重新启动。",
"Ubuntu/ROS版本、唯一包名、构建/测试结果及可复现环境/依赖清单。",
"完整开发环境可复现构建和运行，所有阻断失败解决；包目录存在或入口检查不是全量构建通过。"),
"07":("启动07；比较原始消息字段、时间戳、单位和命名空间；对照已交付接口规范与订阅端。",
"标准Odometry/IMU、已有ai_msgs/语义地图接口；记录序列化和无效输入处理。",
"底盘/传感/控制专用接口需覆盖合同范围并与规范一致；当前标准消息覆盖不能证明完整专用消息封装。"),
"08":("启动08；查看实际节点、数据流、相机、位姿、地图和路径，逐层核对上游/下游。",
"节点图、唯一设备/TF/速度出口所有者、异常/恢复日志。",
"底盘→感知→定位→规划→安全执行链贯通；缺失的回充节点不能用占位节点代替。"),
"09":("先启动01，用Foxglove方向键；另一个终端启动09，复用已有底盘/传感器，低速经过预定闭合路线。",
"地图连续增长、墙体形状和闭环前后；位姿/扫描与地图对齐；记录漂移、覆盖、误差。",
"按预定地图质量/误差容限通过真实建图和闭环；先停止09再停止01。不要同时启动AMCL/static map。"),
"10":("保持09 SLAM活跃；在09原生控制点击保存当前SLAM地图，服务自动生成新文件名。停止SLAM，再用10 -MapYaml <保存结果中的YAML绝对路径>离线加载。3D显示地图不等于Nav2地图已切换；重启复用需另核开机参数。",
"map图像/YAML/posegraph文件与保存日志，重新加载后的尺寸/分辨率/关键结构和启动路径。",
"保存、离线加载及断电重启自动复用全部实测；本次只加保存按钮，不自动改开机配置或覆盖生产地图。"),
"11":("停止SLAM并启动11；在3D使用发布位姿估计工具向/initialpose发初始位姿，核对扫描与地图重合；原网页自动定位入口已停用。",
"amcl_pose/协方差、map→odom→base_link和定位页面的核验结果；记录多位置/多朝向恢复。",
"达到约定重定位误差与时间，并覆盖场景变化；自动定位可能执行原地旋转，必须由操作者明确开始。"),
"12":("启动12并完成定位核验；3D发布位姿到/contract_demo/goal_pose暂存目标，再点击原生控制的执行暂存导航目标，途中停止，再换目标。",
"/contract_demo/navigation_status、/plan、实测里程计、到达结果、停止确认；检查控制门拒绝原因。",
"按预定目标容差/规划条件/失败处理通过多组路线；启动成功和画出路径不代表实车到达。"),
"13":("启动13并核验定位；由操作者给目标。分别做静态绕行、动态目标进入/离开、阻塞与清除测试。",
"融合扫描、代价地图、碰撞监视状态、安全速度、距离与停车/恢复过程视频。",
"填写最小安全距离、停止距离/响应时间和恢复策略；不得仅用激光点出现证明动态避障闭环。"),
"14":("启动14；3D发布位姿话题改为/patrol/add_pose添加多个点；原生控制保存/读回路线、巡航一圈、暂停/恢复和停止；停留时间需在路线YAML中设置，界面没有编辑器。",
"界面当前实际任务状态、路线与每站到达/停留结果；补测点位记忆和软件返航。",
"多点执行、路线保存再读、取消/失败处理、返航均需现场验证；界面运行状态优先，不用闲置后台节点状态推断成功。"),
"15":("启动15；定位后通过3D暂存目标和原生执行按钮发导航目标，包含起步、转弯、减速和停止；方向键不是Nav2平滑链测试。",
"raw/smoothed/guarded/safe速度曲线与实测轮速；记录加速度、转弯速度及停止过程。",
"填写平滑/限速指标，用实际运动对照；不直接给/nav_safe注入测试速度。"),
"16":("当前未实现。准备充电桩、识别信号接口和标定数据，补齐源码/运行链后再开始测试。",
"桩检测原始数据、桩坐标、误识别/丢失状态和标定误差。",
"缺充电桩识别/标定完整实现，当前阻塞。软件Home点不能替代充电桩。"),
"17":("启动17并核验定位；原生控制按钮设置当前点为软件Home，离开后点击软件返航；核对/home/status并测试取消。",
"Home配置/pose、返航执行状态、实测最终位置和取消停稳。",
"目前只支持软件Home；精准对位、自动停靠和充电检测未形成闭环，因此整项充电验收仍阻塞。"),
"18":("当前未实现。补齐电量接口、阈值触发、重试及回充路径后，使用受控电量输入做各边界场景。",
"真实/受控电量来源、阈值、触发任务、失败重试、遇障回充和停止结果。",
"当前缺低电量自动回充实现，阻塞；不能用人工点击Home冒充低电量触发。"),
"19":("当前未实现。补齐充电电流/状态、充满判定、基站脱离与待机链后按设备条件测试。",
"充电状态、充满判据、脱离过程及待机功耗/状态记录。",
"当前缺充电检测及自主脱离闭环，阻塞；未充电的静止状态不是充满待机。"),
"20":("启动20；原生控制→播报文字；实际唤醒用麦克风，分别从预定方向发声，查看识别文本和新鲜DOA；趋近动作仅由操作者明确执行。",
"语音文本、DOA来源时间/角度/校准、Agent反馈、任务执行及取消结果。",
"接口规范、实时声源检测、转向/趋近和整机适配全覆盖；历史DOA或文字命令不能证明声源导航。"),
"21":("当前未实现。补齐传感器/阈值/业务接口后，按设备认可的测试方法做正常、报警、断联和恢复。",
"烟雾原始读数、阈值、告警事件及返航/值守任务关联记录。",
"当前缺烟雾采集和联动实现，阻塞；不要用手工消息替代真实传感器验收。"),
"22":("启动22；查看face_image，首个合格脸是本次内存参考；同一/不同人再次出现，记录接受/拒绝和相似度。",
"参考相似度、误识别、遮挡/离场再出现结果；身份库/权限/迎宾需另查实际接口。",
"当前参考比对只是部分功能；身份认证、权限联动、持久脸库和迎宾导航缺少完整证据，不可整项通过。"),
"23":("执行23资料检查；阅读完整应用接口规范，选一条控制、传感、异常接口按规范与实际实现逐字段对照。",
"通信协议、帧格式、单位、指令、错误码、超时及对接例程，注明版本/修订。",
"源码/API列表不能替代正式完整接口规范；当前资料缺口需补齐。"),
"24":("启动24；明确下发一个任务，在原生控制测试暂停、恢复、取消，再做人工接管和传感器故障状态切换。",
"mission/status、安全/goal状态、实际停稳与恢复行为；重启前后任务状态记录。",
"待机、手动、建图、导航、巡航、回充、故障和联动逐态覆盖；回充及部分联动缺项仍阻止整项通过。"),
"25":("启动25；Foxglove原始消息核对设备状态，终端保存诊断日志。无运动任务时对一个可恢复传感器做断联/恢复，记录全过程。",
"实际健康状态变化、故障原因、时间戳、日志/快照和恢复结果；保存原始日志。",
"约定检测/上报时限，验证真实异常及恢复；软件健康页全绿不表示未安装传感器也已验收。"),
"26":("核对源码、固件、配置、模型/地图必要资产、构建方法及技术文档交付清单。",
"版本号/提交、文件清单/校验、依赖许可、可恢复与复现记录。",
"当前缺STM32固件和完整接口规范；源码目录或备份不是完整交付验收。"),
"27":("核对培训记录、使用材料、质保起止和维护受理/交付记录。",
"培训签到/录像/材料、质保和维护履约资料。",
"这是服务履约，不能通过ROS launch或Foxglove按钮证明完成。"),
}

def generate(manifest,out):
    items=json.loads(manifest.read_text(encoding="utf-8"))["items"]
    assert len(items)==27 and all(i["number"] in CASES for i in items)
    out.mkdir(parents=True,exist_ok=True)
    md=["# 合同功能操作与验收手册","",
        "主册为01–25共25项功能；01/02共享场景，26/27为交付与服务附录。目录编号保持原样。",
        "**本手册是验收操作计划，不是已经通过的验收报告。界面按钮不补齐缺失的固件、传感器或业务闭环。**",
        "", "## 通用启动与停止","",
        '先在Windows PowerShell设置：', "",
        '    $demoScript=\"D:\\Workspace\\foxglove-studio-cn\\integrations\\luka-contract-demo\\start_demo.ps1\"',
        "", '然后：powershell.exe -NoProfile -ExecutionPolicy Bypass -File $demoScript -Item NN -Run。',
        "无-Run只连接/选布局。01/02默认使用Foxglove原生方向键，终端键盘可在远端显式keyboard:=true启用。",
        "完成一项后Ctrl+C，另一个窗口可运行对应stop.sh；不要仅关闭Foxglove当作停止。",
        "01与09/04组合时先启动01，再启动算法；停止时先算法再01。SLAM与AMCL互斥。",
        "", "## 记录规则","",
        "每项填写操作者、日期、软件版本、测试条件、目标指标、实测值、原始日志/视频、异常/恢复、结论和未覆盖项。",
        "合同未给定的精度/时长/响应门槛由双方先填写；下面示例数值不替代约定。",
        "只测到已实现部分时记录“部分通过”，不能把整项勾成通过。缺失项标阻塞，服务项用履约资料。",
        ""]
    parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Luka合同验收指南</title><style>body{font:16px/1.6 system-ui;margin:18px;background:#101923;color:#dfe8f3}a{color:#71d7c5}article{border:1px solid #39516a;border-radius:10px;padding:16px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1c2a39;padding:10px}button,input{font:inherit;padding:8px;margin:4px}button{cursor:pointer}.block{color:#ffcb76}.note{color:#a7bdcf}</style><h1>25项功能操作与验收</h1><p>01–25为主册；26/27为交付与服务附录。01/02共享运行场景。本文不是已通过的验收报告。</p><p class="block">缺固件/CAN、车型差异、充电/烟雾/权限联动和完整规范等缺口不能靠插件补齐。按实测分别记录通过、部分通过、失败或阻塞。</p><p>启动仍由本机PowerShell；Foxglove原生按钮经过现有机器人门控。启动不自动发目标。结束用Ctrl+C/stop.sh。先确认停稳再切换互斥案例。</p><p>'+ " · ".join(f'<a href="#case-{i["number"]}">{i["number"]}</a>' for i in items)+"</p>"]
    for i in items:
        n=i["number"]; action,obs,criterion=CASES[n]
        group=i.get("launch_group","drive_odom" if i["profile"]=="drive_odom" else "imu_axes")
        command=f'powershell.exe -NoProfile -ExecutionPolicy Bypass -File $demoScript -Item {n} -Run'
        md += [f'## {n} {i["clause"]} {i["title"]}',"",f'当前：{i["folder_status_suffix"]}',"",f'启动：{command}',"",f'操作：{action}',"",f'观察与证据：{obs}',"",f'通过条件／阻塞：{criterion}',"",f'代码限制：{i["limitation"]}',""]
        if n=="03":md += ["融合启动加参数 -WithEkf；需要有效轮里程计。",""]
        if "launch" in i:
            md += [f'独立停止：ssh sunrise@192.168.3.150 "python3 /home/sunrise/luka_ws/src/examples/contract_demo/_shared/stop_launch.py {group}"',""]
        parts.append(f'<article id="case-{n}"><h2>{n} {html.escape(i["clause"]+" "+i["title"])}</h2><p class="block">当前：{html.escape(i["folder_status_suffix"])}</p><pre>{html.escape(command)}</pre><h3>操作</h3><p>{html.escape(action)}</p><h3>观察与证据</h3><p>{html.escape(obs)}</p><h3>整项验收条件／缺口</h3><p>{html.escape(criterion)}</p><p class="note">{html.escape(i["limitation"])}</p>')
        parts.append('</article>')
    parts.append('</html>')
    native=[dict(number=i['number'],title=i['title'],status=i['folder_status_suffix'],
                 action=CASES[i['number']][0],observation=CASES[i['number']][1],
                 criterion=CASES[i['number']][2],limitation=i['limitation']) for i in items]
    panel=Path(__file__).resolve().parents[2]/'packages/studio-base/src/panels/LukaConsole/guide.json'
    panel.write_text(json.dumps(native,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    (out/"ACCEPTANCE_GUIDE.md").write_text("\n".join(md).rstrip()+"\n",encoding="utf-8",newline="\n")
    (out/"ACCEPTANCE_GUIDE.html").write_text("\n".join(parts),encoding="utf-8",newline="\n")
    with (out/"acceptance_record_template.csv").open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f,lineterminator="\n")
        w.writerow(["编号","合同条款","功能","当前代码状态","操作者","日期","测试条件","约定指标","实测值","证据路径","结果","未覆盖项"])
        for i in items:w.writerow([i["number"],i["clause"],i["title"],i["folder_status_suffix"],"","","","","","","未验收",i["limitation"]])
    print("Generated guide for 25 functional cases and 2 delivery/service appendices")

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--manifest",type=Path,required=True);p.add_argument("--out",type=Path,default=Path(__file__).parent/"acceptance")
    a=p.parse_args();generate(a.manifest,a.out)