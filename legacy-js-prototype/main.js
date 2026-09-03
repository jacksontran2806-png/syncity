require('dotenv').config();
const { app, BrowserWindow, screen, ipcMain, session, desktopCapturer } = require('electron');
const path = require('path');
const { SpotifyClient } = require('./src/spotify');
const { extractGlowColors } = require('./src/color');
const { fetchSyncedLyrics } = require('./src/lyrics');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';

let controlWin = null;
let lyricsWin = null;
const overlayWins = new Map(); // displayId -> BrowserWindow

let spotify = null;
let pollTimer = null;
let lastTrackId = null;
let lastLyrics = null;
let selectedDisplayId = null;
let isQuitting = false;
let lastRepeatState = 'off';
let lastColors = null;

const settings = {
  thickness: 28,
  intensity: 0.8,
  animation: 'breathe', // breathe | pulse | static
  colorOverride: null, // {r,g,b} or null
};

function createOverlayWindows() {
  for (const win of overlayWins.values()) win.destroy();
  overlayWins.clear();

  const displays = screen.getAllDisplays();
  for (const display of displays) {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      fullscreenable: false,
      hasShadow: false,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, 'src', 'overlay-preload.js'),
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadFile(path.join(__dirname, 'src', 'overlay.html'));
    overlayWins.set(display.id, win);
  }

  if (!selectedDisplayId || !displays.some((d) => d.id === selectedDisplayId)) {
    selectedDisplayId = screen.getPrimaryDisplay().id;
  }
}

function createControlWindow() {
  controlWin = new BrowserWindow({
    width: 420,
    height: 620,
    title: 'Glow prototype — control panel',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'control-preload.js'),
    },
  });
  controlWin.loadFile(path.join(__dirname, 'src', 'control.html'));
  // Prototype has no tray yet — the control panel IS the app. Closing it
  // must kill the overlay windows too, or the glow is stuck on with no way
  // to turn it off.
  controlWin.on('closed', () => {
    isQuitting = true;
    app.quit();
  });
}

function createLyricsWindow() {
  const display = screen.getAllDisplays().find((d) => d.id === selectedDisplayId) || screen.getPrimaryDisplay();
  lyricsWin = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'lyrics-preload.js'),
    },
  });
  lyricsWin.loadFile(path.join(__dirname, 'src', 'lyrics.html'));
  lyricsWin.webContents.once('did-finish-load', () => {
    if (lastColors) lyricsWin.webContents.send('glow:color', lastColors);
  });
  lyricsWin.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    lyricsWin.hide();
  });
}

function broadcastToOverlays(channel, payload) {
  for (const win of overlayWins.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
  if (channel === 'glow:color') {
    lastColors = payload;
    if (lyricsWin && !lyricsWin.isDestroyed()) lyricsWin.webContents.send(channel, payload); // tints the transport bar to match
  }
}

function sendNowPlaying(np) {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('now-playing:update', np);
  if (lyricsWin && !lyricsWin.isDestroyed()) lyricsWin.webContents.send('now-playing:update', np);
}

function sendLyrics(lines) {
  if (lyricsWin && !lyricsWin.isDestroyed()) lyricsWin.webContents.send('lyrics:update', lines);
}

async function pollTick() {
  if (!spotify || !spotify.isAuthed()) {
    sendNowPlaying({ connected: false });
    return;
  }

  let np;
  try {
    np = await spotify.getCurrentlyPlaying();
  } catch (err) {
    console.error('[poll] spotify error:', err.message);
    if (err.message === 'unauthorized' || err.message === 'not_authed') {
      sendNowPlaying({ connected: false, error: 'unauthorized' });
    } else {
      // transient network / API hiccup — stay quiet, try again next tick
      sendNowPlaying({ connected: true, playing: false, transientError: true });
    }
    return;
  }

  if (!np || !np.isPlaying) {
    lastTrackId = null;
    sendNowPlaying({ connected: true, playing: false });
    return;
  }

  if (np.repeatState) lastRepeatState = np.repeatState;
  sendNowPlaying({ connected: true, playing: true, ...np });

  if (np.trackId !== lastTrackId) {
    lastTrackId = np.trackId;
    lastLyrics = null;
    sendLyrics(null);

    if (np.artUrl && !settings.colorOverride) {
      try {
        const colors = await extractGlowColors(np.artUrl);
        broadcastToOverlays('glow:color', colors);
      } catch (err) {
        console.error('[color] extraction failed:', err.message);
      }
    }

    fetchSyncedLyrics({ title: np.title, artist: np.artist, primaryArtist: np.primaryArtist, album: np.album, durationMs: np.durationMs })
      .then((lines) => {
        if (np.trackId !== lastTrackId) return; // track changed again before this resolved
        lastLyrics = lines;
        sendLyrics(lines);
      })
      .catch((err) => console.error('[lyrics] fetch failed:', err.message));
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollTick, 2500);
  pollTick();
}

app.whenReady().then(() => {
  spotify = new SpotifyClient(CLIENT_ID, REDIRECT_URI);
  createOverlayWindows();
  createControlWindow();
  createLyricsWindow();
  startPolling();
  broadcastToOverlays('glow:settings', settings);

  // Lets the control window grab system-audio loopback (Windows only) without
  // a screen-picker dialog, so the glow can react to actual playback loudness.
  // 'loopback' audio capture is Windows-specific in Electron/Chromium — if
  // this ever runs elsewhere it'll just fail closed and the overlay falls
  // back to its non-audio idle animation (never crashes either way).
  try {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        callback({ video: sources[0], audio: 'loopback' });
      }).catch(() => callback({}));
    }, { useSystemPicker: false });
  } catch (err) {
    console.error('[audio] setDisplayMediaRequestHandler unavailable:', err.message);
  }

  screen.on('display-added', createOverlayWindows);
  screen.on('display-removed', createOverlayWindows);
  screen.on('display-metrics-changed', createOverlayWindows);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC ----

ipcMain.handle('spotify:status', () => ({
  authed: !!(spotify && spotify.isAuthed()),
  clientIdConfigured: !!CLIENT_ID,
}));

ipcMain.handle('spotify:connect', async () => {
  if (!CLIENT_ID) throw new Error('SPOTIFY_CLIENT_ID not set — see .env.example');
  await spotify.login();
  lastTrackId = null;
  pollTick();
  return { authed: true };
});

ipcMain.handle('monitor:list', () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${d.bounds.width}x${d.bounds.height} @ (${d.bounds.x},${d.bounds.y})`,
    primary: d.id === screen.getPrimaryDisplay().id,
    selected: d.id === selectedDisplayId,
  }));
});

ipcMain.handle('monitor:select', (_evt, displayId) => {
  selectedDisplayId = displayId;
  const wasVisible = lyricsWin && lyricsWin.isVisible();
  if (lyricsWin) lyricsWin.destroy();
  createLyricsWindow();
  if (wasVisible) lyricsWin.show();
  return { ok: true };
});

ipcMain.handle('settings:update', (_evt, partial) => {
  Object.assign(settings, partial);
  broadcastToOverlays('glow:settings', settings);
  return settings;
});

ipcMain.handle('settings:colorOverride', (_evt, color) => {
  settings.colorOverride = color; // null clears override, back to album-art sync
  if (color) broadcastToOverlays('glow:color', { primary: color, secondary: color });
  else if (lastTrackId) pollTick(); // re-derive from current track art
  return settings;
});

ipcMain.handle('lyrics:toggle', () => {
  if (!lyricsWin) return { visible: false };
  if (lyricsWin.isVisible()) {
    lyricsWin.hide();
  } else {
    lyricsWin.show();
    sendLyrics(lastLyrics);
  }
  return { visible: lyricsWin.isVisible() };
});

ipcMain.handle('playback:next', async () => {
  await spotify.skipNext();
  setTimeout(pollTick, 400); // let Spotify's own state settle before we re-poll
  return { ok: true };
});

ipcMain.handle('playback:previous', async () => {
  await spotify.skipPrevious();
  setTimeout(pollTick, 400);
  return { ok: true };
});

const REPEAT_CYCLE = ['off', 'context', 'track'];
ipcMain.handle('playback:toggleRepeat', async () => {
  const current = lastRepeatState || 'off';
  const next = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(current) + 1) % REPEAT_CYCLE.length];
  await spotify.setRepeat(next);
  lastRepeatState = next;
  pollTick();
  return { repeatState: next };
});

ipcMain.on('audio:level', (_evt, level) => {
  broadcastToOverlays('glow:audio', level);
});
