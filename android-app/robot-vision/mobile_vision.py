#!/usr/bin/env python3
"""Detection and target selection; existing NanoTrack and depth controller execute follow."""
import json
import threading
import time
from collections import OrderedDict
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from cv_bridge import CvBridge
from sensor_msgs.msg import Image, RegionOfInterest
from std_msgs.msg import String
from detection import LABELS, detect, select_detection


class MobileVision(Node):
    def __init__(self):
        super().__init__('mobile_vision_detection')
        self.mode = 'off'
        self.labels = ()
        self.latest = None
        self.lock = threading.Lock()
        self.frames = OrderedDict()
        self.serial = 0
        self.bridge = CvBridge()
        self.status = self.create_publisher(String, '/vision/mobile/detections', 1)
        self.roi = self.create_publisher(RegionOfInterest, '/omnifleet_vision/kcf/roi', 1)
        self.create_subscription(Image, '/camera/color/image_raw', self.image, qos_profile_sensor_data)
        self.create_subscription(String, '/vision/mobile/control', self.control, 10)
        self.create_timer(.2, self.process)

    def image(self, message):
        if self.mode != 'off':
            with self.lock:
                self.latest = message

    def control(self, message):
        try:
            request = json.loads(message.data)
            if request.get('op') == 'mode' and request.get('mode') in LABELS:
                mode = request['mode']
                labels = request.get('labels', LABELS[mode])
                if not isinstance(labels, (list, tuple)) or any(label not in LABELS[mode] for label in labels):
                    raise ValueError('识别项与当前模式不匹配')
                self.mode, self.labels = mode, tuple(labels)
                self.frames.clear()
            elif request.get('op') == 'select':
                frame = self.frames.get(request.get('frame_id'))
                if frame is None or time.monotonic() - frame['received'] > 1.5:
                    raise ValueError('检测结果已更新，请再次点击目标')
                target = select_detection(self.frames, request.get('frame_id'), request.get('index'))
                x, y, w, h = target['bbox']
                self.roi.publish(RegionOfInterest(x_offset=x, y_offset=y, width=w, height=h, do_rectify=False))
                self.status.publish(String(data=json.dumps({'selection': target, 'request_id': request.get('id')})))
        except (ValueError, TypeError, KeyError) as error:
            self.status.publish(String(data=json.dumps({'error': str(error)})))

    def process(self):
        with self.lock:
            message, self.latest = self.latest, None
        if message is None or self.mode == 'off':
            return
        try:
            image = self.bridge.imgmsg_to_cv2(message, desired_encoding='bgr8')
            self.serial += 1
            result = {'frame_id': self.serial, 'mode': self.mode, 'width': message.width, 'height': message.height,
                      'stamp': [message.header.stamp.sec, message.header.stamp.nanosec],
                      'detections': detect(image, self.mode, self.labels)}
            self.frames[self.serial] = {**result, 'received': time.monotonic()}
            while len(self.frames) > 8:
                self.frames.popitem(last=False)
            self.status.publish(String(data=json.dumps(result)))
        except Exception as error:
            self.get_logger().error(str(error))
            self.status.publish(String(data=json.dumps({'error': '识别失败：' + str(error)})))


def main():
    rclpy.init()
    node = MobileVision()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
