import unittest
from link_joystick import FRAME, G20_ADDRESS, Receiver

class TestChannelReceiver(unittest.TestCase):
    def setUp(self):
        self.samples = []
        self.receiver = Receiver(lambda stamp, channels: self.samples.append((stamp, channels)))
        self.channels = [1500] * 16
        self.peer = (G20_ADDRESS, 45000)

    def receive(self, tick, now, peer=None):
        packet = FRAME.pack(b"G20J", tick, *self.channels)
        return self.receiver.receive(packet, peer or self.peer, now)

    def test_source_time_and_channels(self):
        self.channels[0:5] = [1050, 1450, 1950, 1550, 1250]
        self.assertTrue(self.receive(1000, 10.0))
        self.assertTrue(self.receive(1100, 10.2))
        self.assertEqual(self.samples[-1][1], self.channels)
        self.assertAlmostEqual(self.samples[-1][0]/1e9, 10.1)

    def test_delayed_duplicate_and_invalid(self):
        self.assertTrue(self.receive(1000, 10.0))
        self.assertFalse(self.receive(1100, 10.6))
        self.assertFalse(self.receive(1000, 10.61))
        self.assertFalse(self.receive(1610, 10.61, ("192.168.3.5", 45000)))
        self.channels[4] = 0
        self.assertFalse(self.receive(1620, 10.62))
        self.assertEqual(len(self.samples), 1)

    def test_peer_change_after_timeout(self):
        self.assertTrue(self.receive(5000, 10))
        other = (G20_ADDRESS, 45001)
        self.assertFalse(self.receive(100, 10.1, other))
        self.assertTrue(self.receive(200, 11, other))

if __name__ == "__main__":
    unittest.main()
