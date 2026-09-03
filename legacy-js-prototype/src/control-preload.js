const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  spotifyStatus: () => ipcRenderer.invoke('spotify:status'),
  spotifyConnect: () => ipcRenderer.invoke('spotify:connect'),
  monitorList: () => ipcRenderer.invoke('monitor:list'),
  monitorSelect: (id) => ipcRenderer.invoke('monitor:select', id),
  settingsUpdate: (partial) => ipcRenderer.invoke('settings:update', partial),
  setColorOverride: (color) => ipcRenderer.invoke('settings:colorOverride', color),
  toggleLyrics: () => ipcRenderer.invoke('lyrics:toggle'),
  skipNext: () => ipcRenderer.invoke('playback:next'),
  skipPrevious: () => ipcRenderer.invoke('playback:previous'),
  toggleRepeat: () => ipcRenderer.invoke('playback:toggleRepeat'),
  sendAudioLevel: (level) => ipcRenderer.send('audio:level', level),
  onNowPlaying: (cb) => ipcRenderer.on('now-playing:update', (_e, np) => cb(np)),
});
