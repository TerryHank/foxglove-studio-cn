"""Local API boundary tests; no real data-source or hardware changes."""
import importlib.util
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("foxglove_cn", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ServerTests(unittest.TestCase):
    def test_redirect_cannot_forward_the_local_token(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", "http://example.invalid/collect")
                self.end_headers()

            def log_message(self, *args):
                pass

        http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(server, "control_config", return_value={
                    "url": "http://127.0.0.1:%s" % http.server_port, "token": "test-only"}):
                with self.assertRaisesRegex(RuntimeError, "HTTP 302"):
                    server.api_request("GET", "/status")
        finally:
            http.shutdown()
            http.server_close()
            thread.join()

    def test_control_token_is_read_again_after_restart(self):
        first = json.dumps({"url": "http://127.0.0.1:7334", "token": "first"})
        second = json.dumps({"url": "http://127.0.0.1:7334", "token": "second"})
        with patch.object(Path, "is_file", return_value=True), \
                patch.object(Path, "read_text", side_effect=[first, second]):
            self.assertEqual(server.control_config()["token"], "first")
            self.assertEqual(server.control_config()["token"], "second")

    def test_bearer_token_never_targets_a_remote_http_endpoint(self):
        for url in ("https://127.0.0.1:7334", "http://example.invalid", "http://u:p@127.0.0.1:7334"):
            with self.subTest(url=url), patch.object(Path, "is_file", return_value=True), \
                    patch.object(Path, "read_text", return_value=json.dumps({"url": url, "token": "x"})):
                with self.assertRaises(RuntimeError):
                    server.control_config()

    def test_live_connection_rejects_non_websocket(self):
        with patch.object(server, "api_request") as request:
            with self.assertRaises(ValueError):
                server.connect("file:///recording.mcap")
            request.assert_not_called()

    def test_profile_path_traversal_is_not_a_file_read(self):
        with patch.object(server, "api_request") as request:
            with self.assertRaises(ValueError):
                server.select_demo_layout("../../secret")
            request.assert_not_called()

    def test_demo_selection_only_writes_visual_layout(self):
        with patch.object(server, "api_request", return_value={"name": "IMU"}) as request:
            result = server.select_demo_layout("imu_axes", "IMU")
            self.assertEqual(result["name"], "IMU")
            method, route, body = request.call_args.args
            self.assertEqual((method, route), ("POST", "/layout"))
            self.assertEqual(body["data"]["userNodes"], {})

    def test_open_desktop_reuses_running_app(self):
        with patch.object(server, "get_status", return_value={"presence": "PRESENT"}), \
                patch.object(server.subprocess, "Popen") as process:
            self.assertTrue(server.open_desktop()["already_running"])
            process.assert_not_called()


if __name__ == "__main__":
    unittest.main()
