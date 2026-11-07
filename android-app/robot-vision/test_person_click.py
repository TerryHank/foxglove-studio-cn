"""Verify explicit ID binding through the real adapter's native lock inputs."""
import json
import threading
import time
import unittest
from types import SimpleNamespace
from std_msgs.msg import Header, String
from omnifleet_person_follow.body_adapter import BodyTrackingAdapter


class PersonClickTests(unittest.TestCase):
    def adapter(self):
        adapter = BodyTrackingAdapter.__new__(BodyTrackingAdapter)
        adapter.node = SimpleNamespace(lock=threading.RLock(), operator_message='', perception=None)
        adapter.visible_ids = {7, 8}
        adapter.click_target, adapter.click_until, adapter.track_id = None, 0., None
        adapter.input_frames = 0
        adapter.messages = []
        adapter.input_pub = SimpleNamespace(publish=adapter.messages.append)
        return adapter

    def test_click_only_locks_the_selected_visible_person(self):
        adapter = self.adapter()
        adapter.on_click(String(data=json.dumps({'op': 'lock', 'track_id': 7})))
        tracks = [dict(id=i, bbox=[10, 10, 100, 200], confidence=.9) for i in (7, 8)]
        adapter.publish(tracks, Header(), None, None)
        hand = [item for item in adapter.messages[-1].targets if item.type == 'hand']
        self.assertEqual(len(hand), 1)
        self.assertEqual(hand[0].track_id, 7)
        self.assertEqual({item.type: item.value for item in hand[0].attributes}, {'gesture': 11., 'body_track_id': 7.})

    def test_unknown_person_is_not_bound(self):
        adapter = self.adapter()
        adapter.on_click(String(data=json.dumps({'op': 'lock', 'track_id': 99})))
        self.assertIsNone(adapter.click_target)

    def test_changing_person_releases_previous_native_lock_first(self):
        adapter = self.adapter()
        adapter.track_id = 8
        adapter.on_click(String(data=json.dumps({'op': 'lock', 'track_id': 7})))
        tracks = [dict(id=i, bbox=[10, 10, 100, 200], confidence=.9) for i in (7, 8)]
        adapter.publish(tracks, Header(), None, None)
        hand = next(item for item in adapter.messages[-1].targets if item.type == 'hand')
        self.assertEqual(hand.track_id, 8)
        self.assertEqual(hand.attributes[0].value, 5.)
        adapter.track_id = None
        adapter.publish(tracks, Header(), None, None)
        hand = next(item for item in adapter.messages[-1].targets if item.type == 'hand')
        self.assertEqual(hand.track_id, 7)
        self.assertEqual(hand.attributes[0].value, 11.)


if __name__ == '__main__':
    unittest.main()
