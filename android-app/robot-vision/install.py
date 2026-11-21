#!/usr/bin/env python3
"""Deploy the receiver-LAN detector and the explicit human click binding adapter."""
from pathlib import Path
import shutil
import subprocess
import time
import yaml

source = Path(__file__).resolve().parent
stamp = time.strftime('%Y%m%d-%H%M%S')
destination = Path('/opt/omnifleet-mobile-vision')
destination.mkdir(exist_ok=True)
for name in ('detection.py', 'mobile_vision.py'):
    shutil.copy2(source / name, destination / name)
adapter = Path('/home/iecme/omnifleet_ws/src/perception/omnifleet_person_follow/omnifleet_person_follow/body_adapter.py')
if 'def on_click(self, message)' not in adapter.read_text():
    shutil.copy2(adapter, str(adapter) + '.before-mobile-click-' + stamp)
    adapter.write_text(adapter.read_text())
    subprocess.run(['patch', '-p1', '-d', str(adapter.parent)],
                   input=(source / 'person-click.patch').read_text(), text=True, check=True)
shutil.copy2(source / 'omnifleet-mobile-vision.service', '/etc/systemd/system/omnifleet-mobile-vision.service')
config = Path('/etc/omnifleet_t2/foxglove.yaml')
values = yaml.safe_load(config.read_text())
parameters = values['/**']['omnifleet_t2_foxglove_bridge']['ros__parameters']
topic = '^/vision/mobile/control$'
if topic not in parameters['client_topic_whitelist']:
    shutil.copy2(config, str(config) + '.before-mobile-vision-' + stamp)
    parameters['client_topic_whitelist'].append(topic)
    config.write_text(yaml.safe_dump(values, allow_unicode=True, sort_keys=False))
    subprocess.run(['systemctl', 'restart', 'omnifleet-t2-foxglove.service'], check=True)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'omnifleet-mobile-vision.service'], check=True)
