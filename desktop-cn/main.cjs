const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const APP_NAME = "Foxglove Studio 中文版";
const BRIDGE_URL = process.platform === "win32"
  ? "ws://192.168.3.150:8765"
  : "ws://localhost:8765";
let DEMO_CONTROL = process.argv.includes("--demo-control");
let mainWindow;
let demoControlStarted = false;

app.setName(APP_NAME);
// Keep every runtime path ASCII-only. Some Electron/Chromium helpers and
// third-party native libraries still behave inconsistently with non-ASCII paths.
app.setPath("userData", path.join(app.getPath("appData"), "foxglove-studio-cn"));
app.commandLine.appendSwitch("lang", "zh-CN");

const primaryInstance = app.requestSingleInstanceLock();

function enableDemoControl() {
  if (demoControlStarted) {
    return;
  }
  const needsReload = !DEMO_CONTROL;
  DEMO_CONTROL = true;
  demoControlStarted = true;
  require("./demo-control.cjs").startDemoControl({ app, getWindow: () => mainWindow });
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
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !DEMO_CONTROL,
    },
  });
  mainWindow = window;

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
      "ds.url": BRIDGE_URL,
      ...(DEMO_CONTROL ? { demoControl: "true" } : {}),
    },
  });
}

if (!primaryInstance) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    void app.whenReady().then(() => {
      if (argv.includes("--demo-control")) {
        enableDemoControl();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.whenReady().then(() => {
    installChineseMenu();
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
