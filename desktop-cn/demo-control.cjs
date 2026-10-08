// Opt-in loopback visualization API. No shell execution, publishing or ROS services.
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PANEL_TYPES = new Set(["3D", "Plot", "Image", "RawMessages", "LukaConsole"]);

function validateLayout(body) {
  const data = body?.data;
  if (typeof body?.name !== "string" || !body.name || !data?.configById ||
      Object.keys(data.userNodes ?? {}).length || (data.version ?? 1) > 1) {
    throw new Error("Expected a named layout without user scripts");
  }
  const leaves = [];
  function visit(node) {
    if (typeof node === "string") { leaves.push(node); return; }
    if (!node || !["row", "column"].includes(node.direction)) {
      throw new Error("Invalid mosaic layout");
    }
    visit(node.first); visit(node.second);
  }
  visit(data.layout);
  if (leaves.length > 16 || new Set(leaves).size !== leaves.length) {
    throw new Error("Invalid panel count or duplicate panel IDs");
  }
  for (const id of Object.keys(data.configById)) {
    if (!PANEL_TYPES.has(id.split("!")[0]) || !leaves.includes(id)) {
      throw new Error("Only built-in demo panels and the fixed Luka operation console are supported");
    }
  }
  if (leaves.some((id) => !Object.hasOwn(data.configById, id))) {
    throw new Error("Panel configuration missing");
  }
}

function startDemoControl({ app, getWindow, port = 7334 }) {
  const token = crypto.randomBytes(32).toString("hex");
  const configPath = path.join(app.getPath("userData"), "demo-control.json");
  const backups = path.join(app.getPath("userData"), "demo-layout-backups");
  async function call(method, ...args) {
    const window = getWindow();
    if (!window || window.isDestroyed()) { throw new Error("Foxglove window unavailable"); }
    return await window.webContents.executeJavaScript(
      `(() => { const api = window.foxgloveDemoControl; if (!api) throw new Error("Renderer not ready"); return api[${JSON.stringify(method)}](...${JSON.stringify(args)}); })()`,
    );
  }
  const server = http.createServer(async (req, res) => {
    function json(code, value) {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    }
    if (req.headers.authorization !== `Bearer ${token}` || req.headers.origin) {
      json(401, { error: "Unauthorized" }); return;
    }
    try {
      if (req.method === "GET" && req.url === "/status") {
        json(200, await call("status"));
      } else if (req.method === "GET" && req.url === "/layout") {
        json(200, await call("layout"));
      } else if (req.method === "GET" && req.url === "/screenshot") {
        getWindow().webContents.setBackgroundThrottling(false);
        await getWindow().webContents.executeJavaScript(
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );
        const image = await getWindow().webContents.capturePage();
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        res.end(image.toPNG());
      } else if (req.method === "POST" && ["/layout", "/connect"].includes(req.url)) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 1024 * 1024) { throw new Error("Request too large"); }
        }
        const body = JSON.parse(raw);
        if (req.url === "/connect") {
          const url = new URL(body.url);
          if (!["ws:", "wss:"].includes(url.protocol)) { throw new Error("WebSocket URL required"); }
          json(200, await call("connect", url.href));
        } else {
          validateLayout(body);
          getWindow().show();
          const old = await call("layout");
          if (old?.data) {
            fs.mkdirSync(backups, { recursive: true });
            fs.writeFileSync(path.join(backups, `${Date.now()}-${crypto.randomUUID()}.json`), JSON.stringify(old, null, 2));
          }
          json(200, await call("setLayout", body.name, body.data));
        }
      } else { json(404, { error: "Unknown visualization operation" }); }
    } catch (error) { json(400, { error: error.message }); }
  });
  server.on("error", (error) => { console.error("Demo API:", error.message); app.quit(); });
  server.listen(port, "127.0.0.1", () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ url: `http://127.0.0.1:${port}`, token }, null, 2), { mode: 0o600 });
  });
  app.on("before-quit", () => {
    if (server.listening) { server.close(); }
    if (fs.existsSync(configPath) && JSON.parse(fs.readFileSync(configPath)).token === token) {
      fs.unlinkSync(configPath);
    }
  });
  return server;
}

module.exports = { startDemoControl, validateLayout };
