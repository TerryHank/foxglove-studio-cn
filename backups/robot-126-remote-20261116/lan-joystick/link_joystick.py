"""Forward timestamped G20 SDK channels to the tracked chassis joystick arbiter."""
import signal
import socket
import struct
import time

FRAME = struct.Struct("!4sQ16H")
LINK_ADDRESS = "192.168.144.108"
G20_ADDRESS = "192.168.144.11"
PORT = 29420
TIMEOUT = 0.35

class Receiver:
    def __init__(self, publish):
        self.publish = publish
        self.peer = None
        self.last_tick = -1
        self.last_rx = float("-inf")
        self.offset = None

    def receive(self, packet, peer, now):
        if peer[0] != G20_ADDRESS or len(packet) != FRAME.size:
            return False
        magic, tick, *ch = FRAME.unpack(packet)
        if magic != b"G20J" or not all(800 <= ch[i] <= 2200 for i in (0,2,4)):
            return False
        if peer != self.peer:
            if now - self.last_rx < TIMEOUT:
                return False
            self.peer = peer
            self.last_tick = -1
            self.offset = None
        if tick <= self.last_tick:
            return False
        offset = now - tick / 1000.0
        self.offset = offset if self.offset is None else min(offset, self.offset)
        if offset - self.offset > TIMEOUT:
            return False
        self.last_tick = tick
        self.last_rx = now
        self.publish(int((tick / 1000.0 + self.offset) * 1e9), ch)
        return True

def main():
    import rclpy
    from std_msgs.msg import UInt64MultiArray
    from rclpy.node import Node
    from rclpy.signals import SignalHandlerOptions
    rclpy.init(signal_handler_options=SignalHandlerOptions.NO)
    running = True
    def request_stop(signum, frame):
        nonlocal running
        running = False
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    node = Node("g20_lan_joystick")
    publisher = node.create_publisher(UInt64MultiArray, "/chassis/g20_lan_channels", 1)
    def publish(stamp_ns, channels):
        message = UInt64MultiArray()
        # Same-host monotonic origin, followed by 16 raw SDK channels.
        message.data = [stamp_ns, *channels]
        publisher.publish(message)
    receiver = Receiver(publish)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        udp.bind((LINK_ADDRESS, PORT))
        udp.settimeout(0.025)
        node.get_logger().info("GR01 LAN listening on %s:%d" % (LINK_ADDRESS,PORT))
        received = 0
        last_report = time.monotonic()
        try:
            while running and rclpy.ok():
                try:
                    packet, peer = udp.recvfrom(256)
                except socket.timeout:
                    packet = None
                now = time.monotonic()
                if packet is not None and receiver.receive(packet,peer,now):
                    received += 1
                    if now - last_report >= 10:
                        node.get_logger().info("GR01 LAN accepted %d frames in %.1fs; CH1/3/5=%s" %
                            (received,now-last_report,FRAME.unpack(packet)[2:7:2]))
                        received = 0
                        last_report = now
        finally:
            node.destroy_node()
            rclpy.try_shutdown()

if __name__ == "__main__":
    main()
