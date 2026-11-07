import unittest
import cv2
import numpy as np
from detection import detect, select_detection


class DetectionTests(unittest.TestCase):
    def test_four_colors_and_click_identity(self):
        image = np.full((300, 640, 3), 255, np.uint8)
        for x, color in zip((30, 180, 330, 480), ((0, 0, 255), (0, 255, 0), (255, 0, 0), (0, 255, 255))):
            cv2.rectangle(image, (x, 80), (x+90, 180), color, -1)
        found = detect(image, 'color')
        self.assertEqual({item['label'] for item in found}, {'red', 'green', 'blue', 'yellow'})
        self.assertEqual({item['label'] for item in detect(image, 'color', ['red', 'yellow'])},
                         {'red', 'yellow'})
        self.assertEqual(detect(image, 'color', []), [])
        frames = {9: {'detections': found}}
        self.assertIs(select_detection(frames, 9, 2), found[2])
        for frame, index in ((8, 0), (9, -1), (9, 99)):
            with self.assertRaises(ValueError): select_detection(frames, frame, index)

    def test_rectangle_circle_triangle(self):
        image = np.full((300, 640, 3), 255, np.uint8)
        cv2.rectangle(image, (20, 80), (140, 200), (0, 0, 0), -1)
        cv2.circle(image, (300, 140), 60, (0, 0, 0), -1)
        cv2.fillPoly(image, [np.array([[450, 210], [520, 60], [590, 210]])], (0, 0, 0))
        self.assertEqual({item['label'] for item in detect(image, 'shape')}, {'rectangle', 'circle', 'triangle'})
        self.assertEqual([item['label'] for item in detect(image, 'shape', ['circle'])], ['circle'])
        self.assertEqual({item['label'] for item in detect(image, 'shape', ['triangle', 'rectangle'])},
                         {'triangle', 'rectangle'})

    def test_qr_and_multiple_apriltags_in_same_frame(self):
        image = np.full((400, 900, 3), 255, np.uint8)
        qr = cv2.QRCodeEncoder_create().encode('robot104://demo')
        qr = cv2.cvtColor(cv2.resize(qr, (260, 260), interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR)
        image[60:320, 20:280] = qr
        dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)
        for x, identity in ((340, 0), (610, 7)):
            if hasattr(cv2.aruco, 'generateImageMarker'):
                marker = cv2.aruco.generateImageMarker(dictionary, identity, 200)
            else:
                marker = cv2.aruco.drawMarker(dictionary, identity, 200)
            image[90:290, x:x+200] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        result = detect(image, 'codes')
        self.assertIn(('QR', 'robot104://demo'), {(item['label'], item['text']) for item in result})
        self.assertEqual({item['text'] for item in result if item['label'] == 'AprilTag'}, {'0', '7'})
        self.assertEqual([item['label'] for item in detect(image, 'codes', ['QR'])], ['QR'])
        self.assertEqual([item['label'] for item in detect(image, 'codes', ['AprilTag'])], ['AprilTag'] * 2)
        cv2.imwrite('/tmp/robot104-qr-apriltag-proof.png', image)


if __name__ == '__main__':
    unittest.main()
