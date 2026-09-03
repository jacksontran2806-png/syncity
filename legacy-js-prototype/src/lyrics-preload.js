const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lyricsApi', {
  onNowPlaying: (cb) => ipcRenderer.on('now-playing:update', (_e, np) => cb(np)),
  onLyrics: (cb) => ipcRenderer.on('lyrics:update', (_e, lines) => cb(lines)),
  onColor: (cb) => ipcRenderer.on('glow:color', (_e, colors) => cb(colors)),
  skipNext: () => ipcRenderer.invoke('playback:next'),
  skipPrevious: () => ipcRenderer.invoke('playback:previous'),
  toggleRepeat: () => ipcRenderer.invoke('playback:toggleRepeat'),
});
