import importlib.util
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('robot_wifi', Path(__file__).with_name('service.py'))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class FakeManager(service.NetworkManager):
    def __init__(self, states, profiles=(), fail=False):
        self.manager = self
        self.device = '/device'
        self.states = list(states)
        self.saved_profiles = profiles
        self.active_path = '/old_active'
        self.checkpoint = self.destroyed = self.rolled_back = False
        self.saved = self.deleted = False
        self.fail = fail
        self.settings = None

    def status(self):
        if self.rolled_back:
            return {'ssid': 'old', 'connected': True, 'addresses': ['192.168.1.3'], 'state': 100}
        ssid, connected, state, self.active_path = self.states.pop(0)
        return {'ssid': ssid, 'connected': connected, 'addresses': ['192.168.1.3'] if connected else [], 'state': state}

    def properties(self, path, interface):
        if interface == service.DEVICE:
            return {'ActiveConnection': '/old_active' if self.rolled_back else self.active_path}
        return {'Connection': '/old_profile' if path == '/old_active' else '/candidate', 'State': 2}

    def profiles(self):
        return self.saved_profiles

    def connection(self, path):
        def save(): self.saved = True
        def delete(): self.deleted = True
        return SimpleNamespace(Save=save, Delete=delete)

    def CheckpointCreate(self, *args):
        self.checkpoint = True
        return '/checkpoint'

    def CheckpointDestroy(self, checkpoint):
        self.destroyed = True

    def CheckpointRollback(self, checkpoint):
        self.rolled_back = True

    def AddAndActivateConnection2(self, settings, *args):
        self.settings = settings
        if self.fail:
            raise RuntimeError('sensitive-error-payload')
        return '/candidate', '/new_active', {}

    def ActivateConnection(self, *args):
        return '/new_active'


class WifiTests(unittest.TestCase):
    def test_already_connected_reuses_connection(self):
        manager = FakeManager([('BIT', True, 100, '/old_active')])
        result = manager.connect({'ssid': 'BIT', 'security': 'wpa-psk'})
        self.assertTrue(result['status']['connected'])
        self.assertFalse(manager.checkpoint)

    def test_new_connection_is_saved_only_after_its_activation(self):
        manager = FakeManager([('old', True, 100, '/old_active'), ('中文:*\\ network', True, 100, '/new_active')])
        result = manager.connect({'ssid': '中文:*\\ network', 'security': 'wpa-psk', 'password': 'test-password'})
        self.assertEqual(bytes(manager.settings['802-11-wireless']['ssid']).decode(), '中文:*\\ network')
        self.assertTrue(result['status']['connected'])
        self.assertTrue(manager.saved)
        self.assertTrue(manager.destroyed)
        self.assertFalse(manager.rolled_back)

    def test_old_connection_with_same_ssid_is_not_false_success(self):
        manager = FakeManager([('BIT', True, 100, '/old_active'), ('BIT', True, 100, '/old_active'), ('BIT', False, 120, '/new_active')])
        with patch.object(service.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '已恢复原网络'):
                manager.connect({'ssid': 'BIT', 'security': 'wpa-psk', 'password': 'wrong-password'})
        self.assertTrue(manager.rolled_back)
        self.assertTrue(manager.deleted)
        self.assertFalse(manager.saved)

    def test_activation_errors_restore_without_leaking_request_details(self):
        manager = FakeManager([('old', True, 100, '/old_active')], fail=True)
        with self.assertRaises(RuntimeError) as error:
            manager.connect({'ssid': 'target', 'security': 'open'})
        self.assertNotIn('sensitive-error-payload', str(error.exception))
        self.assertTrue(manager.rolled_back)

    def test_saved_profile_can_reconnect_without_password(self):
        profile = ('/saved', {'connection': {'timestamp': 1}, '802-11-wireless': {'ssid': b'BIT'}, '802-11-wireless-security': {'key-mgmt': 'wpa-psk'}})
        manager = FakeManager([('old', True, 100, '/old_active'), ('BIT', True, 100, '/new_active')], profiles=[profile])
        self.assertTrue(manager.connect({'ssid': 'BIT', 'security': 'wpa-psk'})['status']['connected'])
        self.assertIsNone(manager.settings)

    def test_missing_password_and_enterprise_input_do_not_switch_networks(self):
        manager = FakeManager([('old', True, 100, '/old_active')])
        with self.assertRaisesRegex(ValueError, '密码'):
            manager.connect({'ssid': 'new', 'security': 'wpa-psk'})
        with self.assertRaises(ValueError):
            manager.connect({'ssid': 'enterprise', 'security': 'wpa-eap'})
        self.assertFalse(manager.checkpoint)

    def test_operations_are_serial_and_passwords_are_removed(self):
        entered = threading.Event()
        release = threading.Event()
        def connect(request):
            entered.set()
            release.wait(2)
            return {'message': 'done'}
        operations = service.Operations(lambda: SimpleNamespace(connect=connect))
        request = {'password': 'private-test-value'}
        try:
            job = operations.start('connect', request)
            self.assertTrue(entered.wait(1))
            with self.assertRaises(ValueError): operations.start('scan', {})
        finally:
            release.set()
            operations.executor.shutdown(wait=True)
        self.assertEqual(operations.get(job['id'])['state'], 'succeeded')
        self.assertEqual(request, {})
        self.assertNotIn('private-test-value', str(operations.jobs))


if __name__ == '__main__':
    unittest.main()
