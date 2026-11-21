#!/usr/bin/env python3
"""Repair the two legacy map-toolbar calls in the deployed CN.8 bundle."""
import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('bundle', type=Path)
p.add_argument('--robot', required=True, choices=['robot_113', 'robot_104'])
args = p.parse_args()
s = args.bundle.read_text()
before = hashlib.sha256(s.encode()).hexdigest()
for op, button in [('load', 'loadButton'), ('save', 'saveButton')]:
    old = f'callMapService("/map_{op}",path,{button})'
    new = f'callMapService("/{args.robot}/map_{op}",path,{button})'
    if s.count(old) == 1:
        s = s.replace(old, new)
    elif s.count(new) != 1:
        raise SystemExit(f'Expected exactly one map_{op} toolbar call; bundle not changed')
old = 'service==="/map_save"?"保存":"加载"'
new = 'service.endsWith("/map_save")?"保存":"加载"'
if s.count(old) == 1:
    s = s.replace(old, new)
elif s.count(new) != 1:
    raise SystemExit('Expected exactly one operation label; bundle not changed')
args.bundle.write_text(s)
print(json.dumps({'before': before, 'after': hashlib.sha256(s.encode()).hexdigest(), 'robot': args.robot}))
