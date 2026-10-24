const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("foxgloveParameterLinks", {
  openDocs: url => ipcRenderer.invoke("parameter-links:open-docs", url),
  openConfig: (target, source) => ipcRenderer.invoke("parameter-links:open-config", target, source),
});
