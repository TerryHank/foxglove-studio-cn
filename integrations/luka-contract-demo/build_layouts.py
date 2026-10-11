"""Build measured-data layouts with native guarded ROS controls."""
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
COLORS=["#38bdf8","#fb923c","#4ade80","#f472b6"]
NAMES={
 "drive_odom":"01/02 底盘通信·编码器·方向控制",
 "imu_axes":"03 IMU三轴数据与滤波",
 "lidar":"04 双雷达滤波与去畸变","camera":"05 RGB-D相机",
 "interfaces":"07 实时消息接口","layers":"08 分层ROS节点",
 "slam":"09 二维激光SLAM","map":"10 地图加载与复用",
 "localization":"11 RTAB-Map定位","navigation":"12 路径规划",
 "avoidance":"13 障碍物与安全门","business":"14 航点巡航与软件返航",
 "smoothing":"15 速度平滑链","home":"17 软件Home状态",
 "voice":"20 声源方位与语音接口","face":"22 人脸参考相似度",
 "state_machine":"24 业务状态机","diagnostics":"25 故障自检",
}

def plot(title,paths):
    return ("Plot",{"foxglovePanelTitle":title,"paths":[
        {"value":p,"enabled":True,"timestampMethod":"receiveTime","label":label,"color":COLORS[i%4]}
        for i,(p,label) in enumerate(paths)],
        "showLegend":True,"legendDisplay":"top","showPlotValuesInLegend":True,
        "showXAxisLabels":True,"showYAxisLabels":True,"isSynced":True,
        "xAxisVal":"timestamp","followingViewWidth":30,"sidebarDimension":180})

def raw(topic,title):
    return ("RawMessages",{"foxglovePanelTitle":title,"topicPath":topic,"expansion":"all",
                           "diffEnabled":False,"diffMethod":"previous message","diffTopicPath":"",
                           "showFullMessageForDiff":False,"fontSize":14})

def image(topic,title):
    return ("Image",{"foxglovePanelTitle":title,"imageMode":{"imageTopic":topic, **({"colorMode":"colormap","colorMap":"turbo","minValue":0,"maxValue":8000} if "/depth/" in topic else {})},
                      "scene":{},"topics":{},"transforms":{},"layers":{},"version":1})

def scene(frame,topics):
    return ("3D",{"foxglovePanelTitle":"实时地图·扫描·路径（无目标时等待）",
        "followTf":frame,"followMode":"follow-pose",
        "cameraState":{"distance":6,"perspective":False,"phi":0,"thetaOffset":0,"targetOffset":[0,0,0]},
        "scene":{"transforms":{"showLabel":True,"axisScale":.3,"enablePreloading":True}},
        "transforms":{},"layers":{},"version":1,
        "publish":{"type":"pose","poseTopic":"/contract_demo/goal_pose","pointTopic":"/clicked_point","poseEstimateTopic":"/initialpose","poseEstimateXDeviation":.25,"poseEstimateYDeviation":.25,"poseEstimateThetaDeviation":.26},
        "topics":{t:{"visible":True,"color":COLORS[i%4],"pointSize":3,"decayTime":.5 if "scan" in t else 0}
                  for i,t in enumerate(topics)}})

def layout(profile):
    odom=plot("编码器逆解位置 / m",[(f"/wheel/odom.pose.pose.position.{a}",a) for a in ("x","y")])
    gate=raw("/nx/web_teleop_status","现有底盘安全门")
    scan=scene("base_link",["/scan","/scan_low_filtered","/scan_obstacle_fused","/contract_demo/scan_deskewed"])
    scan[1]["foxglovePanelTitle"]="雷达三维扫描图"
    scan[1]["cameraState"].update(perspective=True,phi=.9,thetaOffset=.5,distance=9)
    world=scene("map",["/map","/scan","/scan_obstacle_fused","/plan","/patrol/route_path","/rtabmap_rgbd/localization_pose"])
    if profile in {"map","localization"}:world[1]["publish"]["type"]="pose_estimate"
    groups={
      "drive_odom":[odom,plot("实测车体速度",[(f"/wheel/odom.twist.twist.{v}",v) for v in ("linear.x","linear.y","angular.z")]),raw("/wheel/odom","编码器里程计原始消息"),gate],
      "imu_axes":[plot("线加速度 / m/s²",[(f"/imu/data.linear_acceleration.{a}",a) for a in "xyz"]),plot("角速度 / rad/s",[(f"/imu/data.angular_velocity.{a}",a) for a in "xyz"]),raw("/imu/data","六轴IMU与时间戳"),raw("/contract_demo/odometry/filtered","可选EKF（with_ekf:=true）")],
      "lidar":[scan,raw("/scan_obstacle_fused","融合扫描"),raw("/contract_demo/scan_deskewed","去畸变输出")],
      "camera":[image("/camera/color/image_raw","RGB实景"),image("/camera/depth/image_raw","深度图"),raw("/camera/depth/image_raw.header","深度帧时间戳")],
      "interfaces":[raw("/wheel/odom","标准Odometry"),raw("/imu/data","标准IMU"),raw("/hotel/mission/status","业务JSON消息")],
      "layers":[world,("TopicGraph",{"foxglovePanelTitle":"ROS节点与数据流"}),raw("/wheel/odom","底盘反馈"),image("/camera/color/image_raw","相机")],
      "slam":[scene("map",["/map","/scan","/wheel/odom"]),odom,raw("/map.info","建图尺寸与分辨率")],
      "map":[world,raw("/map.info","静态地图信息")],
      "localization":[world,raw("/rtabmap_rgbd/localization_pose","RTAB-Map位姿与协方差")],
      "navigation":[world,raw("/plan","规划路径"),raw("/contract_demo/navigation_status","原生导航请求与结果"),gate],
      "avoidance":[world,raw("/collision_monitor_state","碰撞监视器"),gate],
      "business":[world,raw("/patrol/status","巡航状态"),raw("/home/status","软件Home状态")],
      "smoothing":[plot("导航速度链 / m/s",[(f"{t}.linear.x",label) for t,label in [("/nx/nav_raw","raw"),("/nx/nav_smoothed","smoothed"),("/nx/nav_guarded","guarded"),("/nx/nav_safe","safe")]]),gate],
      "home":[world,raw("/home/status","仅软件返航，不等于充电")],
      "voice":[raw("/voice/doa","DOA事件：核对源时间戳"),raw("/voice/recognized_text","语音识别文本"),raw("/voice/status","语音状态"),raw("/llm_status","命令Agent反馈")],
      "face":[image("/contract_demo/face_image","YuNet/SFace：参考相似度，无权限联动"),raw("/contract_demo/face_image.header","图像时间戳")],
      "state_machine":[raw("/hotel/mission/status","任务状态"),raw("/hotel/mission/safety_status","安全状态"),raw("/hotel/mission/goal_status","目标状态")],
      "diagnostics":[gate,raw("/hotel/mission/safety_status","任务安全状态"),raw("/voice/status","语音设备状态")],
    }
    panels=groups[profile]
    if profile in {"slam","map"}:
        panels.append(raw("/contract_demo/map_status","地图导出结果（请求接受不等于保存完成）"))
    if profile in {"business","home","state_machine","smoothing","avoidance"}:
        panels.append(raw("/contract_demo/navigation_status","暂存目标与Nav2结果"))
    ids=[f"{kind}!luka{i}" for i,(kind,_) in enumerate(panels)]
    def tree(leaves,depth=0):
        if len(leaves)==1:return leaves[0]
        middle=(len(leaves)+1)//2
        return {"direction":"row" if depth%2==0 else "column","first":tree(leaves[:middle],depth+1),
                "second":tree(leaves[middle:],depth+1),"splitPercentage":55}
    number=NAMES[profile][:2]
    section="patrol" if profile in {"business","home","state_machine"} else "voice" if profile=="voice" else "system" if profile=="diagnostics" else "people" if profile=="face" else "navigation"
    configs=dict(zip(ids,[c for _,c in panels]))
    operations="LukaConsole!"+profile
    configs[operations]={"caseNumber":number,"section":section}
    views=tree(ids)
    if profile in {"lidar","layers","slam","map","localization","navigation","avoidance","business","home","face"}:
        views={"direction":"column","first":ids[0],"second":tree(ids[1:]),"splitPercentage":78}
    elif profile in {"camera","imu_axes","drive_odom"}:
        views={"direction":"column","first":tree(ids[:2]),"second":tree(ids[2:]),"splitPercentage":78}
    mosaic={"direction":"row","first":views,"second":operations,"splitPercentage":72}
    return {"name":NAMES[profile]+" · 待现场验收","data":{"configById":configs,
        "layout":mosaic,"globalVariables":{},"userNodes":{},"playbackConfig":{"speed":1},"version":1}}

if __name__=="__main__":
    target=HERE/"layouts"
    target.mkdir(exist_ok=True)
    for profile in NAMES:
        (target/(profile+".json")).write_text(json.dumps(layout(profile)["data"],ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    panel=HERE.parents[1]/"packages/studio-base/src/panels/LukaConsole"
    items=json.loads((panel/"guide.json").read_text(encoding="utf-8"))
    presets={}
    for item in items:
        profile={"imu_launch":"imu_axes"}.get(item["profile"],item["profile"])
        data=layout(profile)["data"] if profile in NAMES else {
            "configById":{"RawMessages!gui_status":raw("/contract_demo/gui/status","GUI启动与检查输出")[1],
                          "LukaConsole!guide":{"caseNumber":item["number"],"initialView":"guide"}},
            "layout":{"direction":"row","first":"RawMessages!gui_status","second":"LukaConsole!guide","splitPercentage":45},
            "globalVariables":{},"userNodes":{},"playbackConfig":{"speed":1},"version":1}
        if profile=="environment":
            data["configById"]["SourceInfo!environment"]={"foxglovePanelTitle":"ROS连接与数据源"}
            data["layout"]["first"]={"direction":"column","first":"SourceInfo!environment","second":"RawMessages!gui_status","splitPercentage":65}
        for key,value in data["configById"].items():
            if key.startswith("LukaConsole!"):value["caseNumber"]=item["number"]
        presets[item["number"]]=data
    (panel/"presets.json").write_text(json.dumps(presets,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    for name in ("Luka_合同验收_GUI.json","Luka_GUI.json"):
        (HERE/"acceptance"/name).write_text(json.dumps(presets["01"],ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    print("Built",len(NAMES),"native layouts")
