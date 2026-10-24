const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);

function codeExecutable() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft VS Code", "Code.exe"),
    ...(process.env.PATH || "").split(path.delimiter).map(dir => path.resolve(dir, "..", "Code.exe")),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

async function openConfig({ app, shell }, target, source) {
  const bridge = new URL(source);
  if (!["ws:", "wss:"].includes(bridge.protocol)) throw new Error("缺少当前机器人连接地址");
  const host = bridge.hostname.replace(/^\[|\]$/g, "");
  if (!/^[a-zA-Z0-9_.:-]+$/.test(host) || host.startsWith("-")) throw new Error("机器人地址无效");
  if (typeof target?.path !== "string" || !target.path.startsWith("/") ||
      !Number.isInteger(target.line) || target.line < 1 ||
      !Number.isInteger(target.column) || target.column < 1) throw new Error("配置位置无效");
  // Quote for the remote POSIX shell; execFile never invokes a local shell.
  const quoted = "'" + target.path.replace(/'/g, "'\\''") + "'";
  const { stdout } = await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
    host, "cat -- " + quoted], { encoding: "buffer", timeout: 20000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const directory = path.join(app.getPath("userData"), "remote-configs", host.replace(/:/g, "_"));
  fs.mkdirSync(directory, { recursive: true });
  const snapshot = fs.mkdtempSync(path.join(directory, "snapshot-"));
  const localPath = path.join(snapshot, path.posix.basename(target.path).replace(/[<>:"\\|?*]/g, "_"));
  fs.writeFileSync(localPath, stdout);
  fs.writeFileSync(localPath + ".source.json", JSON.stringify({ source, ...target, downloadedAt: new Date().toISOString() }, null, 2));
  const code = codeExecutable();
  if (code) {
    const env = { ...process.env };
    const launcher = path.join(path.dirname(code), "bin", "code.cmd");
    const match = fs.existsSync(launcher) && fs.readFileSync(launcher, "utf8").match(/"%~dp0\.\.\\([^"\r\n]+cli\.js)"/i);
    const cli = match ? path.resolve(path.dirname(code), match[1]) : path.join(path.dirname(code), "resources", "app", "out", "cli.js");
    const args = [];
    if (fs.existsSync(cli)) {
      env.ELECTRON_RUN_AS_NODE = "1";
      env.VSCODE_DEV = "";
      args.push(cli);
    } else {
      delete env.ELECTRON_RUN_AS_NODE;
    }
    // Editor descendants may keep CLI output pipes open after the CLI exits.
    await new Promise((resolve, reject) => {
      const child = spawn(code, [...args, "--reuse-window", "--goto", `${localPath}:${target.line}:${target.column}`],
        { env, windowsHide: true, detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => { child.unref(); resolve(); });
    });
  } else {
    const error = await shell.openPath(localPath);
    if (error) throw new Error(error);
  }
  return { localPath, line: target.line, column: target.column, editor: code ? "VS Code" : "默认编辑器" };
}

module.exports = { openConfig };
