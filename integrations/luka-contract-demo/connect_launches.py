from pathlib import Path
import json,shutil
base=Path("/home/sunrise/luka_ws/src/examples/contract_demo")
p=base/"_shared/interactive_support.py"
before=p.read_text()
backup=Path("/home/sunrise/luka_migration_backups/interactive-demo-20261008-120900")
shutil.copy2(p,backup/"interactive_support-before-cn.py")
needle="    return clear\n"
assert before.count(needle)==1
p.write_text(before.replace(needle,'''    # Visualization is optional; a disconnected desktop never weakens ROS gates.
    try:
        from foxglove_client import show_layout
        show_layout(group)
    except (OSError, ValueError, KeyError) as error:
        print("[Foxglove] visualization unavailable: " + str(error), flush=True)
    return clear
'''))
manifest=json.loads((base/"manifest.json").read_text())
for item in manifest["items"]:
    if "launch" in item:
        group=item.get("launch_group","drive_odom" if item["profile"]=="drive_odom" else "imu_axes")
        item["foxglove_layout"]="_shared/foxglove_layouts/"+group+".json"
(base/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
old=base/"FOXGLOVE_OFFICIAL.md"
if old.exists():
    shutil.copy2(old,backup/"FOXGLOVE_OFFICIAL.md")
    old.unlink()
print("Attached CN layout selection to all real launch profiles; ROS domain188 skips visualization")