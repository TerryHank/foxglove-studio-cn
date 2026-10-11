"""Verify the GUI selects the primary native modality for each implemented case."""
import json
from pathlib import Path
import unittest

BASE=Path(__file__).resolve().parents[2]/"packages/studio-base/src/panels/LukaConsole"


class ModalLayouts(unittest.TestCase):
    def setUp(self):
        self.presets=json.loads((BASE/"presets.json").read_text(encoding="utf-8"))

    def kinds(self, number):
        return [key.split("!")[0] for key in self.presets[number]["configById"] if not key.startswith("LukaConsole!")]

    def test_primary_modality(self):
        expected={"01":"Plot","02":"Plot","03":"Plot","04":"3D","05":"Image",
                  "07":"RawMessages","08":"3D","09":"3D","10":"3D","11":"3D",
                  "12":"3D","13":"3D","14":"3D","15":"Plot","17":"3D",
                  "20":"RawMessages","22":"Image","24":"RawMessages","25":"RawMessages"}
        for number,kind in expected.items():
            with self.subTest(case=number):self.assertEqual(self.kinds(number)[0],kind)
        self.assertIn("SourceInfo",self.kinds("06"))
        self.assertIn("TopicGraph",self.kinds("08"))

    def test_lidar_is_prominent_perspective_3d(self):
        data=self.presets["04"]
        scene=next(value for key,value in data["configById"].items() if key.startswith("3D!"))
        self.assertTrue(scene["cameraState"]["perspective"])
        self.assertGreater(scene["cameraState"]["phi"],0)
        self.assertIn("/scan",scene["topics"])
        self.assertIn("/contract_demo/scan_deskewed",scene["topics"])
        self.assertGreaterEqual(data["layout"]["splitPercentage"],70)
        self.assertTrue(data["layout"]["first"]["first"].startswith("3D!"))
        self.assertGreaterEqual(data["layout"]["first"]["splitPercentage"],70)

    def test_camera_displays_both_rgb_and_depth(self):
        images=[value for key,value in self.presets["05"]["configById"].items() if key.startswith("Image!")]
        self.assertEqual({v["imageMode"]["imageTopic"] for v in images},
                         {"/camera/color/image_raw","/camera/depth/image_raw"})

    def test_existing_map_cases_publish_initial_pose_not_navigation_goal(self):
        for number in ('10','11'):
            scene=next(v for k,v in self.presets[number]['configById'].items() if k.startswith('3D!'))
            self.assertEqual(scene['publish']['type'],'pose_estimate')
            self.assertEqual(scene['publish']['poseEstimateTopic'],'/initialpose')

    def test_each_case_has_one_matching_controller(self):
        self.assertEqual(len(self.presets),27)
        for number,data in self.presets.items():
            controls=[v for k,v in data["configById"].items() if k.startswith("LukaConsole!")]
            self.assertEqual(len(controls),1)
            self.assertEqual(controls[0]["caseNumber"],number)

    def test_master_starts_at_case01(self):
        for name in ("Luka_合同验收_GUI.json","Luka_GUI.json"):
            data=json.loads((Path(__file__).parent/"acceptance"/name).read_text(encoding="utf-8"))
            controls=[v for k,v in data["configById"].items() if k.startswith("LukaConsole!")]
            self.assertEqual(controls[0]["caseNumber"],"01")


if __name__=="__main__":unittest.main()
