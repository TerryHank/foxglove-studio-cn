"""Independent manual mode and protected mode regression, using a mocked bus."""
import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock, patch
from types import SimpleNamespace
import pytest
from geometry_msgs.msg import Twist


def module():
    path=Path.home()/"luka_ws/src/visualization/console/nx_manual_base.py"
    spec=importlib.util.spec_from_file_location("direct_manual_under_test",path)
    m=importlib.util.module_from_spec(spec)
    with patch.object(sys,"path",[str(path.parent),*sys.path]):spec.loader.exec_module(m)
    return m


@pytest.mark.parametrize("direct,paused,stale,scans,expected",[
    (True,False,False,False,"行驶中"),
    (False,False,False,False,"雷达数据过期"),
    (False,False,False,True,"近距离障碍"),
    (True,True,False,False,"底盘暂停"),
    (True,False,True,False,"编码器数据过期"),
])
def test_only_direct_mode_ignores_absent_lidar(direct,paused,stale,scans,expected):
    m=module();n=m.ManualBase.__new__(m.ManualBase);now=m.time.monotonic()
    n.manual_acceptance_mode=direct;n.motion_paused=paused;n.armed=False;n.held=False
    n.joy_at=n.cmd_at=0;n.feedback_at=now-1 if stale else now
    n.latest_manual_cmd=n.latest_nav_cmd=None;n.scan_times={topic:now for topic in m.SENSORS} if scans else {}
    msg=Twist();msg.angular.z=.2
    n.web_state=(msg,("turn_left",),now);n.web_status_at=now
    n.nav_allowed=n.follow_allowed=False;n.web_motion_blocked=Mock(return_value=True)
    n.get_clock=Mock(return_value=Mock())
    with patch.object(m.ZDTMecanumRS485Bridge,"on_command_timer"):
        n.on_command_timer()
    assert expected in n.web_status
    assert (n.latest_manual_cmd is msg)==(expected=="行驶中")
    if direct:n.web_motion_blocked.assert_not_called()


def test_direct_mode_rejects_enabling_autonomous_motion():
    m=module();n=m.ManualBase.__new__(m.ManualBase);n.manual_acceptance_mode=True
    assert not n.enable_navigation(SimpleNamespace(data=True),SimpleNamespace()).success
    assert not n.enable_follow(SimpleNamespace(data=True),SimpleNamespace()).success


def test_direct_demo_launch_has_no_sensor_processes():
    from launch import LaunchContext
    from launch.actions import ExecuteProcess
    from launch.utilities import perform_substitutions
    root=Path.home()/"luka_ws/src/examples/contract_demo/_shared"
    spec=importlib.util.spec_from_file_location("direct_launch_test",root/"drive_odom.launch.py")
    d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
    context=LaunchContext();context.launch_configurations.update(start_hardware="true",keyboard="false",with_sensors="false")
    with patch.object(d,"claim",return_value=lambda *a:None),patch.object(d,"nodes",return_value=set()),patch.object(d,"active",return_value=False),patch.object(d,"reserve_device"),patch("subprocess.run",return_value=SimpleNamespace(returncode=1)):
        actions=d.setup(context)
    commands=[" ".join(perform_substitutions(context,token) for token in a.cmd) for a in actions if isinstance(a,ExecuteProcess)]
    assert len(commands)==2
    assert any("manual_acceptance_mode:=true" in c for c in commands)
    assert not any("nx_sensors" in c for c in commands)
