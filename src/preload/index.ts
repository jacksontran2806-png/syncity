import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, DisplayInfo, AlbumPalette, LyricLine, NowPlaying } from '../shared/types';

const api = {
  spotifyStatus: (): Promise<{ authed: boolean; clientIdConfigured: boolean }> =>
    ipcRenderer.invoke('spotify:status'),
  spotifyConnect: (): Promise<{ authed: boolean }> => ipcRenderer.invoke('spotify:connect'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', partial),

  listMonitors: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('monitor:list'),
  selectMonitor: (id: number): Promise<AppSettings> => ipcRenderer.invoke('monitor:select', id),

  skipNext: (): Promise<void> => ipcRenderer.invoke('playback:next'),
  skipPrevious: (): Promise<void> => ipcRenderer.invoke('playback:previous'),
  playPause: (play: boolean): Promise<void> => ipcRenderer.invoke('playback:playPause', play),
  toggleShuffle: (enabled: boolean): Promise<void> => ipcRenderer.invoke('playback:toggleShuffle', enabled),
  /** Re-reads the playback position now instead of waiting for the next poll. */
  syncPlayback: (): Promise<void> => ipcRenderer.invoke('playback:sync'),

  setWindowMode: (mode: AppSettings['windowMode']): Promise<AppSettings> =>
    ipcRenderer.invoke('window:setMode', mode),
  hideOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:hide'),
  /** Tells main whether a fullscreen view (Album/Lyrics) is up. Main binds a
   *  global Escape accelerator only while one is — the overlay is
   *  click-through and never focused, so a plain window keydown listener
   *  never fires for it (see hotkeys.ts setEscapeCapture). */
  setFullscreenView: (active: boolean): void => {
    ipcRenderer.send('overlay:setFullscreenView', active);
  },
  /** Renderer's view of its own size, logged next to the main-process window
   *  bounds so an undersized WINDOW can be told apart from an undersized PAGE. */
  reportWindowMetrics: (metrics: {
    innerWidth: number;
    innerHeight: number;
    screenWidth: number;
    screenHeight: number;
    devicePixelRatio: number;
  }): Promise<void> => ipcRenderer.invoke('window:reportMetrics', metrics),

  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  setIgnoreMouseEvents: (ignore: boolean): void => {
    ipcRenderer.send('overlay:setIgnoreMouseEvents', ignore);
  },

  onNowPlaying: (cb: (np: NowPlaying) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, np: NowPlaying) => cb(np);
    ipcRenderer.on('nowPlaying:update', listener);
    return () => ipcRenderer.removeListener('nowPlaying:update', listener);
  },
  onLyrics: (cb: (lines: LyricLine[] | null) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, lines: LyricLine[] | null) => cb(lines);
    ipcRenderer.on('lyrics:update', listener);
    return () => ipcRenderer.removeListener('lyrics:update', listener);
  },
  onPalette: (cb: (palette: AlbumPalette) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, palette: AlbumPalette) => cb(palette);
    ipcRenderer.on('palette:update', listener);
    return () => ipcRenderer.removeListener('palette:update', listener);
  },
  onOpenSettings: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('ui:openSettings', listener);
    return () => ipcRenderer.removeListener('ui:openSettings', listener);
  },
  onExpandWidget: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('ui:expandWidget', listener);
    return () => ipcRenderer.removeListener('ui:expandWidget', listener);
  },
  onEscape: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('ui:escape', listener);
    return () => ipcRenderer.removeListener('ui:escape', listener);
  },
  onSettingsChanged: (cb: (settings: AppSettings) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, s: AppSettings) => cb(s);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },
};

export type LyriGlowApi = typeof api;

contextBridge.exposeInMainWorld('lyriglow', api);
