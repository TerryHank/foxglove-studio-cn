"""Image-space detections for the Android click-to-follow interface."""
import math
import cv2
import numpy as np

COLORS = {'red': ((0, 10), (170, 180)), 'green': ((35, 85),),
          'blue': ((90, 135),), 'yellow': ((18, 35),)}


def contours(mask, image_area, clean=True):
    if clean:
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    found, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [c for c in found if 180 <= cv2.contourArea(c) <= image_area * .75]


def detect(image, mode):
    height, width = image.shape[:2]
    result = []
    if mode == 'color':
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        for label, ranges in COLORS.items():
            mask = np.zeros((height, width), np.uint8)
            for low, high in ranges:
                mask |= cv2.inRange(hsv, (low, 85, 55), (high, 255, 255))
            for contour in contours(mask, width * height):
                result.append({'label': label, 'bbox': list(cv2.boundingRect(contour))})
    elif mode == 'shape':
        gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        edges = cv2.Canny(gray, 60, 150)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        for contour in contours(edges, width * height, clean=False):
            area, perimeter = cv2.contourArea(contour), cv2.arcLength(contour, True)
            poly = cv2.approxPolyDP(contour, .025 * perimeter, True)
            if not cv2.isContourConvex(poly):
                continue
            label = None
            if len(poly) == 3:
                label = 'triangle'
            elif len(poly) == 4:
                points = poly.reshape(-1, 2).astype(float)
                angles = []
                for i in range(4):
                    a, b = points[i-1] - points[i], points[(i+1) % 4] - points[i]
                    angles.append(abs(np.dot(a, b) / max(1., np.linalg.norm(a) * np.linalg.norm(b))))
                if max(angles) < .35:
                    label = 'rectangle'
            elif len(poly) >= 6 and 4 * math.pi * area / max(1., perimeter**2) > .8:
                x, y, w, h = cv2.boundingRect(contour)
                if .8 <= w / h <= 1.25:
                    label = 'circle'
            if label:
                result.append({'label': label, 'bbox': list(cv2.boundingRect(contour))})
    elif mode == 'codes':
        # Both decoders run on the SAME frame; no target-ID filtering for AprilTag.
        from pyzbar.pyzbar import decode, ZBarSymbol
        for code in decode(image, symbols=[ZBarSymbol.QRCODE]):
            rect = code.rect
            result.append({'label': 'QR', 'text': code.data.decode('utf-8', 'replace'),
                           'bbox': [rect.left, rect.top, rect.width, rect.height]})
        aruco = cv2.aruco
        dictionary = aruco.getPredefinedDictionary(aruco.DICT_APRILTAG_36h11)
        if hasattr(aruco, 'ArucoDetector'):
            corners, ids, _ = aruco.ArucoDetector(dictionary, aruco.DetectorParameters()).detectMarkers(image)
        else:
            corners, ids, _ = aruco.detectMarkers(image, dictionary, parameters=aruco.DetectorParameters_create())
        if ids is not None:
            for polygon, identity in zip(corners, ids.flatten()):
                result.append({'label': 'AprilTag', 'text': str(int(identity)),
                               'bbox': list(cv2.boundingRect(polygon.astype(np.float32)))})
    return sorted(result, key=lambda item: (item['label'], item['bbox'][0], item['bbox'][1]))[:40]


def select_detection(frames, frame_id, index):
    frame = frames.get(frame_id)
    if frame is None or not isinstance(index, int) or not 0 <= index < len(frame['detections']):
        raise ValueError('检测结果已更新，请再次点击目标')
    return frame['detections'][index]
