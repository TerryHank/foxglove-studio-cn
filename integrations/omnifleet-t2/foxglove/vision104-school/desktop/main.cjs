const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const APP_NAME = "Foxglove 104 视觉案例";
const APP_ID = "dev.foxglove.studio.opensource.cn";
const BRIDGE_URL = "ws://192.168.3.104:8765";
const selectedRobot = "104";
const centralFleet = false;
let singleBridgeUrl = BRIDGE_URL;
let DEMO_CONTROL = process.argv.includes("--demo-control");
let mainWindow;
const { dialog } = require("electron");
const { openVisionLayout } = require("./vision-entry.cjs");
let demoControlStarted = false;
let demoControlServer;

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}
// Keep every runtime path ASCII-only. Some Electron/Chromium helpers and
// third-party native libraries still behave inconsistently with non-ASCII paths.
const instanceProfile = process.argv.find(arg => /^--instance-profile=window-\d+$/.test(arg))?.split("=")[1];
app.setPath("userData", path.join(app.getPath("appData"), "foxglove-studio-cn-vision104"));
app.commandLine.appendSwitch("lang", "zh-CN");

const primaryInstance = app.requestSingleInstanceLock();

async function discoveredRobotBridge(robot) { return BRIDGE_URL; }

function enableDemoControl() {
  if (demoControlStarted) {
    demoControlServer.refreshCredentials();
    return;
  }
  const needsReload = !DEMO_CONTROL;
  DEMO_CONTROL = true;
  demoControlStarted = true;
  demoControlServer = require("./demo-control.cjs").startDemoControl({ app, getWindow: () => mainWindow, port: 7335 });
  if (needsReload && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setBackgroundThrottling(false);
    const reloadWithControl = () => {
      const url = new URL(mainWindow.webContents.getURL());
      url.searchParams.set("demoControl", "true");
      void mainWindow.loadURL(url.href);
    };
    if (mainWindow.webContents.getURL()) {
      reloadWithControl();
    } else {
      mainWindow.webContents.once("did-finish-load", reloadWithControl);
    }
  }
}

function installChineseMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        { label: "新建窗口", accelerator: "CmdOrCtrl+N", click: () => createWindow() },
        { type: "separator" },
        { label: "退出", role: "quit" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "全选", role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { type: "separator" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { label: "恢复默认缩放", role: "resetZoom" },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "开源项目主页",
          click: () => void shell.openExternal("https://github.com/AD-EYE/foxglove-opensource"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const window = new BrowserWindow({
    title: APP_NAME,
    icon: path.join(__dirname, "build", "icon.png"),
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#111418",
    skipTaskbar: false,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !DEMO_CONTROL,
    },
  });
  if (process.platform === "win32") {
    window.setAppDetails({
      appId: APP_ID,
      appIconPath: path.join(process.resourcesPath, "app-web", "favicon.ico"),
      appIconIndex: 0,
      relaunchCommand: `"${process.execPath}" --demo-control`,
      relaunchDisplayName: "Foxglove-Studio-CN",
    });
  }
  mainWindow = window;
  window.webContents.once("did-finish-load", () => {
    if (process.argv.includes("--vision-demo")) {
      void openVisionLayout(app, window).catch(error => dialog.showErrorBox("104 视觉布局启动失败", error.message));
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const indexPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-web", "index.html")
    : path.join(__dirname, "../web/.webpack/index.html");
  void window.loadFile(indexPath, {
    query: {
      ds: "foxglove-websocket",
      "ds.url": centralFleet ? "ws://127.0.0.1:8767" : selectedRobot ? singleBridgeUrl : fs.existsSync(path.join(app.getPath("userData"), "joint-control-installed.json"))
        ? "ws://127.0.0.1:8766" : BRIDGE_URL,
      omnifleetProfile: centralFleet ? "fleet" : selectedRobot ? "robot_"+selectedRobot : "",
      ...(DEMO_CONTROL ? { demoControl: "true" } : {}),
    },
  });
}

if (!primaryInstance) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    void app.whenReady().then(async () => {
      if (argv.includes("--demo-control")) {
        enableDemoControl();
      }
      if (argv.includes("--vision-demo")) {
        try { await openVisionLayout(app, mainWindow); }
        catch (error) { dialog.showErrorBox("104 视觉布局启动失败", error.message); }
        return;
      }
      if (argv.includes("--refresh-demo-control")) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        return;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        const robot = argv.find(arg => /^--robot=([A-Za-z0-9_][A-Za-z0-9_-]{0,39})$/.test(arg))?.split("=")[1];
        const fleet = argv.includes("--fleet") || (process.platform === "win32" && !robot);
        if (robot || fleet) {
          const url = new URL(mainWindow.webContents.getURL());
          const target = fleet ? "ws://127.0.0.1:8767" : await discoveredRobotBridge(robot);
          const profile = fleet ? "fleet" : "robot_"+robot;
          if (url.searchParams.get("ds.url") !== target || url.searchParams.get("omnifleetProfile") !== profile) {
            url.searchParams.set("ds.url", target);
            url.searchParams.set("omnifleetProfile", profile);
            void mainWindow.loadURL(url.href);
          }
        }
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.whenReady().then(async () => {
    installChineseMenu();
    if (selectedRobot && !centralFleet) singleBridgeUrl = await discoveredRobotBridge(selectedRobot);
    createWindow();
    if (DEMO_CONTROL) {
      enableDemoControl();
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => app.quit());
}

