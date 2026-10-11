"""Real ROS services on isolated domain 188, using a fake case engine."""
import importlib.util
import os
from pathlib import Path
import time
import rclpy
from rclpy.node import Node
from rclpy.executors import SingleThreadedExecutor
from std_srvs.srv import Trigger


def test_gui_start_stop_without_hardware(tmp_path):
    assert os.environ.get("ROS_DOMAIN_ID")=="188"
    spec=importlib.util.spec_from_file_location("gui_launcher",Path(__file__).with_name("gui_launcher.py"))
    gui=importlib.util.module_from_spec(spec);spec.loader.exec_module(gui)
    class FakeEngine(gui.CaseEngine):
        def start(self,number,with_ekf=False,map_yaml=""):
            self.phase,self.case="running",number
        def stop(self):self.phase,self.case="idle",""
    engine=FakeEngine({"03":{"profile":"imu_launch"}},data=tmp_path)
    rclpy.init();node=gui.GuiLauncher(engine);client=Node("fake_gui_client")
    executor=SingleThreadedExecutor();executor.add_node(node);executor.add_node(client)
    start=client.create_client(Trigger,"/contract_demo/gui/start/case_03")
    stop=client.create_client(Trigger,"/contract_demo/gui/stop")
    def until(check):
        deadline=time.monotonic()+5
        while not check() and time.monotonic()<deadline:executor.spin_once(timeout_sec=.05)
        assert check()
    try:
        until(lambda:start.service_is_ready() and stop.service_is_ready())
        f=start.call_async(Trigger.Request());until(f.done);assert f.result().success
        until(lambda:engine.phase=="running" and not node.busy)
        f=stop.call_async(Trigger.Request());until(f.done);assert f.result().success
        until(lambda:engine.phase=="idle" and not node.busy)
    finally:
        if node.worker:node.worker.join()
        executor.shutdown();node.destroy_node();client.destroy_node();rclpy.shutdown()


def test_case01_service_starts_and_stops_an_owned_process(tmp_path):
    """Use a simulated launch entrypoint while exercising the actual process engine."""
    assert os.environ.get("ROS_DOMAIN_ID")=="188"
    spec=importlib.util.spec_from_file_location("gui_launcher",Path(__file__).with_name("gui_launcher.py"))
    gui=importlib.util.module_from_spec(spec);spec.loader.exec_module(gui)
    data=tmp_path/"data"
    runner=tmp_path/"runner.py"
    runner.write_text('''import json,os,signal,time
from pathlib import Path
state=Path(__file__).parent/'data/recordings/contract_demo'
state.mkdir(parents=True,exist_ok=True)
record=state/'drive_odom.pid.json'
record.write_text(json.dumps({'pid':os.getpid()}))
print('SIMULATED case01 launch/node running',flush=True)
def stop(*args):
    record.unlink(missing_ok=True)
    raise SystemExit(0)
signal.signal(signal.SIGINT,stop)
while True:time.sleep(.05)
''')
    engine=gui.CaseEngine({"01":{"profile":"drive_odom","launch":True}},data=data,here=tmp_path)
    rclpy.init();node=gui.GuiLauncher(engine);client=Node("case01_process_gui_client")
    executor=SingleThreadedExecutor();executor.add_node(node);executor.add_node(client)
    start=client.create_client(Trigger,"/contract_demo/gui/start/case_01")
    stop=client.create_client(Trigger,"/contract_demo/gui/stop")
    def until(check):
        deadline=time.monotonic()+8
        while not check() and time.monotonic()<deadline:executor.spin_once(timeout_sec=.05)
        assert check()
    try:
        until(lambda:start.service_is_ready() and stop.service_is_ready())
        future=start.call_async(Trigger.Request());until(future.done)
        assert future.result().success
        until(lambda:engine.phase=="running" and not node.busy)
        assert engine.children[0][1].poll() is None
        assert "SIMULATED case01" in engine.log_tail()
        future=stop.call_async(Trigger.Request());until(future.done)
        assert future.result().success
        until(lambda:engine.phase=="idle" and not node.busy)
        assert not engine.children
    finally:
        if node.worker:node.worker.join()
        engine.stop()
        executor.shutdown();node.destroy_node();client.destroy_node();rclpy.shutdown()
