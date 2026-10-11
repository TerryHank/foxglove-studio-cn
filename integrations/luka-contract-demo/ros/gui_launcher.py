#!/usr/bin/env python3
"""Native Foxglove case launch services; startup alone starts no hardware.

Only manifest-listed entrypoints can run. Own child processes are stopped;
existing hardware and production services are never killed to resolve conflicts.
"""
import fcntl
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

import rclpy
from rclpy.node import Node
from rcl_interfaces.msg import SetParametersResult
from nav_msgs.msg import Odometry, OccupancyGrid
from std_msgs.msg import String, Bool
from std_srvs.srv import Empty, SetBool, Trigger

HERE = Path(__file__).resolve().parent
DATA = Path.home() / "luka_data"


class CaseEngine:
    def __init__(self, items, data=DATA, here=HERE):
        self.items, self.data, self.here = items, data, here
        self.children = []
        self.logs = []
        self.cancel_start = threading.Event()
        self.phase, self.case, self.message = "idle", "", "选择案例，点击开始；启动不发送运动目标"
        self.navigation_stack = 'rtabmap'
        self.managed_stack = True
        self.visual_database = ''
        self.visual_mode = 'mapping'
        self.laser_database = ''
        self.laser_pose = [0.,0.,0.]
        self.stack_file=self.data/'runtime/visual_slam/navigation_stack_state.json'
        if self.stack_file.is_file():
            state=json.loads(self.stack_file.read_text())
            self.visual_database=state.get('visual_database','')
            self.laser_database=state.get('laser_database','')
            self.laser_pose=state.get('laser_pose',[0.,0.,0.])

    def persist_stack(self):
        self.stack_file.parent.mkdir(parents=True,exist_ok=True)
        self.stack_file.write_text(json.dumps({'visual_database':self.visual_database,
            'laser_database':self.laser_database,'laser_pose':self.laser_pose},ensure_ascii=False))

    def map_choices(self):
        return sorted(str(p) for p in (self.data / "maps").rglob("*.db") if p.is_file())

    def validate_map(self, value):
        path = Path(value).resolve()
        if not path.is_relative_to((self.data / "maps").resolve()) or not path.is_file() or path.suffix != ".db":
            raise ValueError("地图必须是 luka_data/maps 内已有的 RTAB-Map .db 文件")
        return path

    def start_process(self, number, options=()):
        if self.cancel_start.is_set():
            raise InterruptedError("操作者请求停止")
        item = self.items[number]
        if item["profile"] in {"missing", "service"}:
            raise ValueError(item["limitation"])
        log_dir = self.data / "recordings/contract_demo/gui_logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log = log_dir / (number + "_" + str(time.time_ns()) + ".log")
        with log.open("w") as output:
            command=[sys.executable, str(self.here / "runner.py"), "--item", number, *options]
            if number=='09' and self.managed_stack:
                command=['ros2','launch',str(self.here/'navigation_stack.launch.py'),
                         'backend:='+self.navigation_stack,'mode:='+self.visual_mode]
                database=self.visual_database if self.navigation_stack=='rtabmap' else self.laser_database
                if database:command.append('database_path:='+database)
                command += [key+':='+str(value) for key,value in zip(('start_x','start_y','start_yaw'),self.laser_pose)]
            proc = subprocess.Popen(command,
                stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
                env={**os.environ, "PYTHONUNBUFFERED": "1", "FOXGLOVE_GUI_LAUNCH": "1"})
        self.children.append((number, proc, log))
        self.logs.append(str(log))
        return proc

    def log_tail(self):
        parts = []
        for _, _, path in self.children:
            if path.exists():
                with path.open("rb") as log:
                    offset = max(0, path.stat().st_size-2000)
                    log.seek(offset)
                    text = log.read()
                    if offset:
                        # Drop the partial first line, including any split UTF-8 character.
                        text = text.partition(b"\n")[2]
                    parts.append(text.decode("utf-8", errors="replace"))
        return "\n".join(parts)[-4000:]

    def existing_base(self):
        p = subprocess.run(["ros2", "node", "list"], text=True, capture_output=True, timeout=10)
        return {"/nx_imu", "/nx_upper_lidar", "/nx_lower_lidar", "/zdt_mecanum_rs485_bridge"} <= set(p.stdout.splitlines())

    def start(self, number, with_ekf=False, database_path=""):
        if number not in self.items or self.items[number]["profile"] in {"missing", "service"}:
            raise ValueError("本项目尚无可运行实现／属于服务履约，请查看本案例缺口")
        if self.children:
            raise RuntimeError("先点击停止案例，确认停止后再切换")
        options = []
        if with_ekf:
            if number != "03":
                raise ValueError("融合仅适用于03")
            options += ["--with-ekf"]
        if database_path and self.items[number]['profile'] in {'map','localization','navigation','avoidance','business','smoothing','home','state_machine','voice','layers'}:
            options += ["--database-path", str(self.validate_map(database_path))]
        self.phase, self.case, self.message = "starting", number, "正在启动，等待节点及数据；没有运动目标"
        self.logs = []
        # Mapping and fused IMU can be demonstrated without a separate CLI base session.
        if (number in {"04", "09"} or with_ekf) and not self.existing_base():
            base = self.start_process("01", ["--with-sensors"])
            deadline = time.monotonic() + 25
            while not self.existing_base():
                if self.cancel_start.is_set():
                    raise InterruptedError("操作者请求停止")
                if base.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("底盘/传感器未就绪；停止案例后查看界面日志")
                time.sleep(.2)
        if self.items[number]["profile"] in {'slam','map','localization','layers','navigation','avoidance','business','smoothing','home','state_machine','voice'}:
            subprocess.run(['sudo','-n','systemctl','start','luka-ws-orbbec-camera.service'],check=True,timeout=15)
        self.start_process(number, options)
        # Wait for the existing launch ownership record, not a fixed startup delay.
        item = self.items[number]
        if number=='09' and self.managed_stack:
            deadline=time.monotonic()+45
            proc=self.children[-1][1]
            while True:
                if self.cancel_start.is_set():raise InterruptedError('操作者请求停止')
                graph=subprocess.run(['ros2','node','list'],capture_output=True,text=True,timeout=10).stdout.splitlines()
                mapper='/rtabmap_rgbd/rtabmap' if self.navigation_stack=='rtabmap' else '/slam_toolbox'
                if mapper in graph and '/bt_navigator' in graph and '/controller_server' in graph:break
                if proc.poll() is not None or time.monotonic()>deadline:raise RuntimeError('技术栈启动失败；查看日志并停止清理')
                time.sleep(.2)
        elif "launch" in item:
            group = item.get("launch_group", "drive_odom" if number in {"01", "02"} else "imu_axes")
            deadline = time.monotonic() + 15
            proc = self.children[-1][1]
            record = self.data / "recordings/contract_demo" / (group + ".pid.json")
            while True:
                if self.cancel_start.is_set():
                    raise InterruptedError("操作者请求停止")
                if proc.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("ROS launch 未就绪；查看界面日志，点击停止清理")
                if record.exists():
                    try:
                        owner = json.loads(record.read_text())
                    except json.JSONDecodeError:
                        owner = {}
                    if owner.get("pid") == proc.pid:
                        break
                    if owner.get("pid") and Path("/proc/%s" % owner["pid"]).exists():
                        raise RuntimeError("已有其他启动所有者；拒绝接管")
                time.sleep(.1)
        self.phase, self.message = "running", (('激光 SLAM＋Nav2' if self.navigation_stack=='lidar' else 'RTAB-Map RGB-D＋轮速＋Nav2')+' 已启动；以实际消息和反馈验收') if self.managed_stack else "入口已启动；以实际消息、反馈和实测结果验收"

    def stop(self):
        self.phase = "stopping"
        # Reap child launches in reverse dependency order, never signal an external PID.
        while self.children:
            _, proc, _ = self.children[-1]
            if proc.poll() is None:
                proc.send_signal(signal.SIGINT)
                proc.wait(timeout=25)
            self.children.pop()
        self.phase, self.case, self.message = "idle", "", "本管理器启动的案例已停止；借用的生产服务保留"


class GuiLauncher(Node):
    def __init__(self, engine=None):
        super().__init__("contract_demo_launcher")
        items = json.loads((HERE.parent / "manifest.json").read_text())["items"] if engine is None else []
        self.engine = engine or CaseEngine({i["number"]: i for i in items})
        state_dir = self.engine.data / "recordings/contract_demo"
        state_dir.mkdir(parents=True, exist_ok=True)
        self.lock = (state_dir / "gui_launcher.lock").open("a")
        fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.busy = False
        self.worker = None
        self.odom = None
        self.odom_at = 0.
        self.map_at=0.;self.map_cells=0;self.operator_verified=False;self.ready_pub=None
        self.visual_at=0.
        from rtabmap_msgs.msg import Info
        self.create_subscription(Info,'/rtabmap_rgbd/info',lambda m:setattr(self,'visual_at',time.monotonic()),10)
        self.create_subscription(OccupancyGrid,'/map',self.on_runtime_map,10)
        self.create_subscription(Odometry, "/wheel/odom", self.on_odom, 10)
        self.pause = self.create_client(Empty, "/base_control/pause_now")
        self.disable = self.create_client(SetBool, "/nx/navigation_enable")
        self.cancel_navigation = self.create_client(Trigger, '/contract_demo/cancel_goal')
        self.export_laser = self.create_client(Trigger, '/contract_demo/save_map')
        self.map_export_state={}
        self.create_subscription(String,'/contract_demo/map_status',lambda m:setattr(self,'map_export_state',json.loads(m.data)),10)
        from tf2_ros import Buffer,TransformListener
        self.transforms=Buffer();self.transform_listener=TransformListener(self.transforms,self)
        self.status = self.create_publisher(String, "/contract_demo/gui/status", 10)
        self.declare_parameter("database_path", self.engine.visual_database)
        self.add_on_set_parameters_callback(self.parameters)
        self.create_service(Trigger, "/contract_demo/gui/stop", self.stop)
        # Contract acceptance has one RTAB-Map backend; no legacy AMCL/SLAM selector.
        self.create_service(Trigger,'/contract_demo/gui/stack/rtabmap',lambda q,r:self.switch_stack('rtabmap',r))
        self.create_service(Trigger,'/contract_demo/gui/stack/save',lambda q,r:self.save_stack(r))
        self.create_service(Trigger,'/contract_demo/gui/stack/verify',self.verify_stack)
        self.create_service(Trigger,'/contract_demo/gui/stack/visual_localization',lambda q,r:self.switch_stack('rtabmap',r,True))
        for number in self.engine.items:
            self.create_service(Trigger, "/contract_demo/gui/start/case_" + number,
                lambda request, response, n=number: self.start(n, False, response))
        self.create_service(Trigger, "/contract_demo/gui/start/case_03_ekf",
            lambda request, response: self.start("03", True, response))
        self.maps = self.engine.map_choices()
        self.create_timer(.5, self.tick)
        self.localization_verified=False;self.localization_at=0.
        self.create_subscription(Bool,'/localization/ready',self.on_localization_verified,10)

    def on_runtime_map(self,message):
        self.map_at=time.monotonic();self.map_cells=message.info.width*message.info.height

    def runtime_ready(self):
        if self.busy or self.engine.phase!='running' or not self.engine.managed_stack:return False
        mapper_at=self.visual_at if self.engine.navigation_stack=='rtabmap' else self.map_at
        if self.odom is None or time.monotonic()-self.odom_at>.6 or self.map_cells==0 or time.monotonic()-mapper_at>3.:return False
        try:
            transform=self.transforms.lookup_transform('map','base_link',rclpy.time.Time())
            stamp=transform.header.stamp.sec+transform.header.stamp.nanosec/1e9
            return -.05 <= self.get_clock().now().nanoseconds/1e9-stamp <= .6
        except Exception:return False

    def on_localization_verified(self,message):
        self.localization_verified,self.localization_at=message.data,time.monotonic()

    def verify_stack(self,_request,response):
        response.success=self.localization_verified and time.monotonic()-self.localization_at<.6
        response.message='RTAB-Map自动定位核验已通过' if response.success else 'RTAB-Map自动定位核验尚未通过；人工确认不能开放导航许可'
        return response

    def parameters(self, values):
        try:
            for value in values:
                if value.name != "database_path":
                    raise ValueError("不支持的参数")
                self.engine.validate_map(value.value)
            return SetParametersResult(successful=True)
        except (ValueError, TypeError) as error:
            return SetParametersResult(successful=False, reason=str(error))

    def on_odom(self, message):
        self.odom, self.odom_at = message.twist.twist, time.monotonic()

    def submit(self, action, response):
        if self.busy:
            response.success, response.message = False, "启动／停止正在进行；查看状态后重试"
            return response
        self.busy = True
        def work():
            try:
                action()
            except Exception as error:
                self.engine.phase, self.engine.message = "error", str(error)
            finally:
                if self.engine.cancel_start.is_set():
                    try:
                        self.stop_owned()
                    except Exception as error:
                        self.engine.phase, self.engine.message = "error", str(error)
                self.busy = False
        self.worker = threading.Thread(target=work)
        self.worker.start()
        response.success, response.message = True, "请求已接受；等待 GUI 状态和真实数据"
        return response

    def start(self, number, with_ekf, response):
        if number=='10' and self.engine.navigation_stack=='rtabmap':
            return self.switch_stack('rtabmap',response,True)
        if number not in self.engine.items or self.engine.items[number]["profile"] in {"missing", "service"}:
            response.success, response.message = False, "缺少实现／服务履约项；只能核对缺口和资料"
            return response
        if not self.busy:
            self.engine.cancel_start.clear()
        return self.submit(lambda: self.engine.start(number, with_ekf, self.get_parameter("database_path").value), response)

    def stop(self, _request, response):
        if self.busy:
            self.engine.cancel_start.set()
            response.success, response.message = True, "停止已请求；等待启动中止与停稳确认"
            return response
        return self.submit(self.stop_owned, response)

    def wait_response(self,future,seconds=5):
        end=time.monotonic()+seconds
        while not future.done():
            if time.monotonic()>end:raise RuntimeError('服务确认超时；禁止继续切换')
            time.sleep(.05)
        return future.result()

    def snapshot_stack(self):
        if self.engine.case!='09' or not any(n=='09' and p.poll() is None for n,p,_ in self.engine.children):return
        if self.engine.navigation_stack=='rtabmap' and self.engine.managed_stack:
            p=self.engine.data/'runtime/visual_slam/navigation_active.json'
            data=json.loads(p.read_text())
            owned=[proc.pid for number,proc,_ in self.engine.children if number=='09']
            if data.get('launch_pid') not in owned:raise RuntimeError('视觉地图记录不属于当前启动实例')
            self.engine.visual_database=data['database_path']
            self.engine.persist_stack()
            return
        if not self.export_laser.service_is_ready():raise RuntimeError('激光地图保存服务不可用；保留当前建图')
        self.map_export_state={}
        response=self.wait_response(self.export_laser.call_async(Trigger.Request()))
        if not response.success:raise RuntimeError(response.message)
        end=time.monotonic()+85
        while self.map_export_state.get('state') not in ('saved','failed'):
            if time.monotonic()>end:raise RuntimeError('激光地图保存未确认，未切换')
            time.sleep(.1)
        if self.map_export_state['state']!='saved':raise RuntimeError(self.map_export_state.get('message','地图保存失败'))
        choices=sorted((self.engine.data/'maps/contract_demo').glob('*/session.posegraph'),key=lambda p:p.stat().st_mtime)
        if not choices:raise RuntimeError('没有找到保存的激光会话')
        self.engine.laser_database=str(choices[-1]).removesuffix('.posegraph')
        t=self.transforms.lookup_transform('map','base_link',rclpy.time.Time()).transform
        q=t.rotation
        self.engine.laser_pose=[t.translation.x,t.translation.y,math.atan2(2*(q.w*q.z+q.x*q.y),1-2*(q.y*q.y+q.z*q.z))]
        self.engine.persist_stack()

    def switch_stack(self,backend,response,localization=False):
        if backend!='rtabmap':
            response.success,response.message=False,'验收技术栈已统一为RTAB-Map'
            return response
        if localization and not self.engine.visual_database and self.engine.navigation_stack!='rtabmap':
            response.success,response.message=False,'先完成视觉建图并保存地图，再进入视觉定位'
            return response
        def change():
            self.operator_verified=False
            self.engine.phase='switching'
            if self.cancel_navigation.service_is_ready():self.wait_response(self.cancel_navigation.call_async(Trigger.Request()))
            self.confirm_stopped(strict=True)
            self.snapshot_stack()
            previous=self.engine.navigation_stack
            self.engine.stop()
            if previous=='rtabmap':self.clear_visual_cloud()
            self.map_cells=0;self.map_at=0.;self.visual_at=0.
            self.engine.navigation_stack=backend;self.engine.managed_stack=True
            if backend=='rtabmap':
                import sqlite3
                if self.engine.visual_database:
                    with sqlite3.connect('file:'+self.engine.visual_database+'?mode=ro',uri=True) as db:
                        if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('视觉地图数据库损坏')
                if localization and not self.engine.visual_database:raise RuntimeError('先进行视觉建图并保存数据库，再进入定位')
                self.engine.visual_mode='localization' if localization else 'resume_mapping' if self.engine.visual_database else 'mapping'
                subprocess.run(['sudo','-n','systemctl','start','luka-ws-orbbec-camera.service'],check=True,timeout=15)
            self.engine.cancel_start.clear()
            self.engine.start('09')
        return self.submit(change,response)

    def clear_visual_cloud(self):
        from sensor_msgs.msg import PointCloud2,PointField
        if self.count_publishers('/rtabmap_rgbd/cloud_map'):return
        publisher=self.create_publisher(PointCloud2,'/rtabmap_rgbd/cloud_map',1)
        message=PointCloud2();message.header.frame_id='map';message.header.stamp=self.get_clock().now().to_msg()
        message.height=1;message.width=0;message.point_step=16;message.row_step=0;message.is_dense=True
        message.fields=[PointField(name=name,offset=offset,datatype=PointField.FLOAT32,count=1) for name,offset in [('x',0),('y',4),('z',8),('rgb',12)]]
        time.sleep(.3);publisher.publish(message);time.sleep(.2);self.destroy_publisher(publisher)

    def save_stack(self,response):
        return self.switch_stack(self.engine.navigation_stack,response)

    def confirm_stopped(self,strict=False):
        motion_cases = {"01", "02", "08", "09", "12", "13", "14", "15", "17", "20", "24"}
        if any(number in motion_cases and proc.poll() is None for number, proc, _ in self.engine.children) or (strict and self.odom is not None):
            if strict and (not self.disable.service_is_ready() or not self.pause.service_is_ready()):
                raise RuntimeError('停止／运动许可服务未就绪，禁止切换技术栈')
            futures = []
            if self.disable.service_is_ready():
                futures.append(self.disable.call_async(SetBool.Request(data=False)))
            if self.pause.service_is_ready():
                futures.append(self.pause.call_async(Empty.Request()))
            deadline = time.monotonic()+3
            while futures and not all(f.done() for f in futures):
                if time.monotonic() > deadline:
                    raise RuntimeError("停止服务未确认；保留当前进程以便重试")
                time.sleep(.05)
            if futures:
                for future in futures:
                    result=future.result()
                    if strict and hasattr(result,'success') and not result.success:
                        raise RuntimeError('运动许可关闭未获确认，禁止切换')
                # Consecutive fresh measured samples confirm stopping, never inferred from commands.
                stable, last_sample = 0, 0.
                deadline = time.monotonic()+3
                while stable < 3:
                    if self.odom_at != last_sample:
                        last_sample = self.odom_at
                        v = self.odom
                        stable = stable+1 if v and time.monotonic()-self.odom_at < .6 and \
                            abs(v.linear.x)<.02 and abs(v.linear.y)<.02 and abs(v.angular.z)<.03 else 0
                    if time.monotonic() > deadline:
                        raise RuntimeError("新鲜轮速未确认停稳；点击停止重试，禁止切换")
                    time.sleep(.05)
    def stop_owned(self):
        self.confirm_stopped()
        self.snapshot_stack()
        if self.engine.case=='09' and self.engine.children and self.engine.children[-1][1].poll() is None:
            self.snapshot_stack()
        self.engine.stop()
        self.maps = self.engine.map_choices()

    def tick(self):
        if not self.busy and self.engine.phase == "running":
            ended = [(n, p.poll()) for n, p, _ in self.engine.children if p.poll() is not None]
            if ended:
                expected = all("launch" not in self.engine.items[n] and code == 0 for n, code in ended)
                self.engine.phase = "reviewed" if expected else "error"
                self.engine.message = "资料检查已结束，请核对输出" if expected else "案例进程已退出，请停止清理并查看日志"
        self.status.publish(String(data=json.dumps(dict(
            phase=self.engine.phase, case=self.engine.case, busy=self.busy, message=self.engine.message,
            log=self.engine.log_tail(), log_files=self.engine.logs, maps=self.maps,
            navigation_stack=self.engine.navigation_stack,
            navigation_ready=self.runtime_ready(),operator_verified=self.operator_verified,
            visual_database=self.engine.visual_database,laser_database=self.engine.laser_database,
            manual_input_topic="/cmd_vel" if self.engine.case in {"01","02"} else "/nx/web_teleop_cmd_vel"), ensure_ascii=False)))


def main():
    from rclpy.signals import SignalHandlerOptions
    rclpy.init(signal_handler_options=SignalHandlerOptions.NO)
    node = GuiLauncher()
    def interrupt(_signal, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.engine.cancel_start.set()
        while node.worker and node.worker.is_alive():
            rclpy.spin_once(node, timeout_sec=.05)
        cleanup = threading.Thread(target=node.stop_owned)
        cleanup.start()
        while cleanup.is_alive():
            rclpy.spin_once(node, timeout_sec=.05)
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
