"""Exercise the real stdio MCP and local desktop, preserving its current layout."""
import asyncio
import base64
import json
import os
from pathlib import Path
import sys

from mcp import Client, StdioServerParameters


async def main():
    parameters = StdioServerParameters(command=sys.executable,
                                      args=["-X", "utf8", str(Path(__file__).with_name("server.py"))])
    async with Client(parameters) as client:
        tools = await client.list_tools()
        names = {tool.name for tool in tools.tools}
        expected = {"get_status", "get_layout", "list_demo_layouts", "select_demo_layout",
                    "set_layout", "connect", "capture_screenshot", "open_desktop"}
        assert names == expected, names
        status = await client.call_tool("get_status")
        assert not status.is_error, status
        before = await client.call_tool("get_layout")
        assert not before.is_error, before
        original = before.structured_content
        # Return annotations/JSON/text are verified through the real MCP serialization.
        profiles = await client.call_tool("list_demo_layouts")
        assert not profiles.is_error
        assert len(profiles.structured_content["profiles"]) == 18
        screenshot = None
        try:
            selected = await client.call_tool("select_demo_layout", {"profile": "imu_axes", "name": "MCP verification"})
            assert not selected.is_error, selected
            after = await client.call_tool("get_layout")
            assert after.structured_content["name"] == "MCP verification", after
            screenshot = await client.call_tool("capture_screenshot")
            assert not screenshot.is_error, screenshot
            image = next(c for c in screenshot.content if c.type == "image")
            png = base64.b64decode(image.data)
            assert png.startswith(b"\x89PNG\r\n\x1a\n")
            output = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "luka-contract-demo"
            output.mkdir(parents=True, exist_ok=True)
            (output / "foxglove-mcp-verification.png").write_bytes(png)
        finally:
            if original and original.get("data"):
                restored = await client.call_tool("set_layout", {
                    "name": original.get("name") or "Restored layout", "data": original["data"]})
                assert not restored.is_error, restored
        print(json.dumps({"stdio_mcp": "PASS", "tool_count": len(names), "profiles": 18,
                          "layout_readback": "PASS", "png_image_result": "PASS",
                          "original_layout_restored": True, "robot_commands_sent": False}))


if __name__ == "__main__":
    asyncio.run(main())
