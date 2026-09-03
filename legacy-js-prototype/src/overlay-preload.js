const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('glow', {
  onColor: (cb) => ipcRenderer.on('glow:color', (_e, color) => cb(color)),
  onSettings: (cb) => ipcRenderer.on('glow:settings', (_e, settings) => cb(settings)),
  onAudio: (cb) => ipcRenderer.on('glow:audio', (_e, level) => cb(level)),
});
