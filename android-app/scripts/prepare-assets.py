#!/usr/bin/env python3
"""Copy the actual Web build, retain notices, and add a mobile viewport."""
from pathlib import Path
import json
import shutil
import subprocess

repo = Path(__file__).resolve().parents[2]
source = repo / "web/.webpack"
if not (source / "index.html").is_file():
    raise SystemExit("Missing Web build. Run corepack yarn web:build:prod first.")
dest = repo / "android-app/src/main/assets/www"
if dest.exists():
    shutil.rmtree(dest)
shutil.copytree(source, dest)
index = dest / "index.html"
html = index.read_text()
layout = json.loads((repo / "android-app/default-layout.json").read_text(encoding="utf-8"))
bootstrap = json.dumps(layout, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
html = html.replace("/*FOXGLOVE_STUDIO_DEFAULT_LAYOUT_PLACEHOLDER*/", bootstrap, 1)
html = html.replace(
    "<head>",
    '<head><style>html:not([data-android-toolbar-visible]) [data-tourid="app-bar"]'
    '{display:none!important}</style>',
    1,
)
if 'name="viewport"' not in html and "name='viewport'" not in html:
    html = html.replace("<head>", '<head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', 1)
index.write_text(html)
for name in ("LICENSE", "NOTICE"):
    shutil.copy2(repo / name, dest / name)
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
(dest / "NOTICE.android.txt").write_text(
    "Foxglove Studio 中文 Android 测试封装\n"
    "Not an official Foxglove Android application.\n"
    "Source: https://github.com/TerryHank/foxglove-studio-cn\n"
    f"Build commit: {sha}\n"
    "Web application: MPL-2.0. See LICENSE and NOTICE in this directory.\n"
    "Android wrapper: MPL-2.0. Source in android-app/ at the build commit.\n\n"
    + (repo / "NOTICE").read_text() + "\n" + (repo / "LICENSE").read_text()
)
print(f"Prepared {sum(1 for p in dest.rglob('*') if p.is_file())} assets from {sha}")
