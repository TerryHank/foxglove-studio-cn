"""Select the CN desktop layout through an authenticated SSH reverse tunnel."""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request,urlopen

HERE=Path(__file__).resolve().parent
BASE=HERE.parent
DATA=Path.home()/"luka_data/recordings/contract_demo"
ALIASES={"drive_odom":"drive_odom","imu_launch":"imu_axes"}
PROFILES={p.stem for p in (HERE/"foxglove_layouts").glob("*.json")}


def show_layout(group):
    if os.environ.get("ROS_DOMAIN_ID","87") != "87":
        return False
    profile=ALIASES.get(group,group)
    if profile not in PROFILES:
        return False
    config_path=DATA/"foxglove_client.json"
    if not config_path.exists():
        print("[Foxglove] Start the Windows CN companion for automatic layout selection.",flush=True)
        return False
    config=json.loads(config_path.read_text(encoding="utf-8-sig"))
    if config.get("bridge_url"):
        reconnect=Request(config["url"]+"/connect",data=json.dumps({"url":config["bridge_url"]}).encode(),
                          headers={"Authorization":"Bearer "+config["token"],"Content-Type":"application/json"},method="POST")
        with urlopen(reconnect,timeout=4) as response:
            response.read()
    items=json.loads((BASE/"manifest.json").read_text())["items"]
    matching=[i for i in items if ALIASES.get(i["profile"],i["profile"])==profile]
    name="/".join(i["number"] for i in matching)+" "+matching[0]["title"]+" · "+matching[0]["folder_status_suffix"]
    data=json.loads((HERE/"foxglove_layouts"/(profile+".json")).read_text())
    request=Request(config["url"]+"/layout",data=json.dumps({"name":name,"data":data},ensure_ascii=False).encode(),
                    headers={"Authorization":"Bearer "+config["token"],"Content-Type":"application/json"},method="POST")
    with urlopen(request,timeout=4) as response:
        result=json.load(response)
    print("[Foxglove] "+result["name"],flush=True)
    return True


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--item",required=True)
    args=p.parse_args()
    item=next(i for i in json.loads((BASE/"manifest.json").read_text())["items"]
              if i["number"]==args.item.zfill(2))
    profile=ALIASES.get(item["profile"],item["profile"])
    if profile not in PROFILES:
        print("Inspection/missing/service item: no live visualization demo.")
        return
    if not show_layout(profile):raise SystemExit(1)

if __name__=="__main__":main()