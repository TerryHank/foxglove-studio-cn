"""Pause acknowledgements must not wait on serial IO; no driver is instantiated."""
import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock
from unittest.mock import patch


def test_pause_closes_gate_without_synchronous_serial_write():
    path=Path.home()/"luka_ws/src/visualization/console/nx_manual_base.py"
    spec=importlib.util.spec_from_file_location("manual_pause_under_test",path)
    module=importlib.util.module_from_spec(spec)
    with patch.object(sys,"path",[str(path.parent),*sys.path]):spec.loader.exec_module(module)
    node=module.ManualBase.__new__(module.ManualBase)
    node.motion_paused=False;node.web_state=object()
    node.clear_velocity_inputs=Mock()
    node.send_zero_motor_command=Mock(side_effect=AssertionError("Service must not block on serial IO"))
    node.get_logger=Mock(return_value=Mock())
    response=object()
    assert node.on_base_pause(None,response) is response
    assert node.motion_paused and node.web_state is None
    node.clear_velocity_inputs.assert_called_once()
    node.send_zero_motor_command.assert_not_called()
