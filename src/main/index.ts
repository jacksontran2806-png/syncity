import 'dotenv/config';
import { app, session, desktopCapturer } from 'electron';

// Last-resort net: this app runs quietly in the tray with nothing watching it,
// so a crash is invisible until the user notices the overlay vanished. Anything
// that reaches here should log and keep running, never take down the process.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception (main process kept running):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection (main process kept running):', reason);
});

import type { AppSettings } from '../shared/types';
import type { NowPlayingProvider } from './providers/types';
import { createSpotifyProvider } from './providers/spotifyProvider';
import { createAppleMusicProvider } from './providers/appleMusic';
import { loadSettings, saveSettings } from './settingsStore';
import { createNowPlayingLoop } from './nowPlayingLoop';
import { registerIpc } from './ipc';
import { registerHotkeys, setEscapeCapture, unregisterHotkeys } from './hotkeys';
import { applyWindowMode, createOverlayWindow, getOverlayWindow, watchDisplayChanges, moveOverlayToDisplay } from './windows';
import { createTray } from './tray';
import { registerCrashDiagnostics } from './crashDiagnostics';
import { migrateLegacyUserData } from './legacyUserData';

// Must be set before app.ready. Electron already ships a Per-Monitor-V2 DPI
// manifest, so this is belt-and-braces rather than the fix for the fullscreen
// margin — that was setBounds() being clamped by resizable:false (windows.ts).
// Left in because it costs nothing and rules the DPI path out entirely.
app.commandLine.appendSwitch('high-dpi-support', '1');

// THE WHOLE-APP-VANISHES FIX. Windows' native window-occlusion tracking
// (Chromium's CalculateNativeWinOcclusion) recalculates on every focus change,
// alt-tab, and hide/show — and has long-documented crash/hang bugs specifically
// with transparent, frameless, always-on-top windows (chromium issue 1442867
// and its Electron duplicates). That's this window exactly: transparent,
// frame:false, alwaysOnTop(true,'screen-saver'), and hidden/shown via
// win.hide()/showInactive() from BOTH Escape and auto-hide. A crash there can
// take the whole renderer/GPU pipeline down with it — with only one window and
// no explicit render-process-gone handling (added below as a backstop), that
// reads exactly as "the app vanished from Task Manager" with nothing in our
// own JS-level uncaughtException/unhandledRejection logs, because it never
// was a JS-level error. This switch turns the feature off outright; it costs
// nothing visible (occlusion tracking is a background-throttling hint, not a
// rendering feature) and is the standard fix for this exact symptom.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';

// Must precede the first userData read below: the LyriGlow -> Syncity rename
// moved the profile directory, and this carries the old settings and Spotify
// session forward so an existing install doesn't come back up logged out.
migrateLegacyUserData();

let settings: AppSettings = loadSettings();
let spotifyProvider: NowPlayingProvider;
let appleMusicProvider: NowPlayingProvider;

/** Everything talks to whichever source is selected, never to Spotify
 *  directly — see src/main/providers/types.ts. */
function provider(): NowPlayingProvider {
  return settings.musicSource === 'appleMusic' ? appleMusicProvider : spotifyProvider;
}

function send(channel: string, payload?: unknown): void {
  const win = getOverlayWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const loop = createNowPlayingLoop({
  provider,
  colorOverrideEnabled: () => settings.colorOverrideEnabled,
  send,
});

/**
 * The single write path for settings: merge, persist, then apply whatever the
 * changed keys imply. Both IPC and the hotkeys go through here, so a setting
 * can never be saved without its side effect running (or vice versa).
 */
function patchSettings(partial: Partial<AppSettings>): AppSettings {
  settings = { ...settings, ...partial };
  saveSettings(settings);

  if ('colorOverrideEnabled' in partial || 'overridePrimary' in partial || 'overrideSecondary' in partial) {
    if (settings.colorOverrideEnabled) {
      send('palette:update', {
        primary: settings.overridePrimary,
        secondary: settings.overrideSecondary,
        tertiary: settings.overrideSecondary,
      });
    } else {
      // Drop back to the album's own colours: forget the track so the next
      // tick re-extracts them.
      loop.forgetTrack();
      void loop.tick();
    }
  }

  if ('launchOnStartup' in partial) app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup });
  if ('windowMode' in partial) applyWindowMode(settings.windowMode, settings.displayId);

  return settings;
}

/** Loopback audio capture for the pill's spectrum visualizer, without a screen-picker
 *  dialog. Windows only — see audio.ts. */
function enableSystemAudioCapture(): void {
  try {
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer
          .getSources({ types: ['screen'] })
          .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
          .catch(() => callback({}));
      },
      { useSystemPicker: false }
    );
  } catch (err) {
    console.error('[audio] setDisplayMediaRequestHandler unavailable:', err);
  }
}

app.whenReady().then(() => {
  spotifyProvider = createSpotifyProvider(CLIENT_ID, REDIRECT_URI);
  appleMusicProvider = createAppleMusicProvider(process.env.APPLE_MUSIC_DEVELOPER_TOKEN);

  enableSystemAudioCapture();
  createOverlayWindow(settings.displayId, settings.windowMode);
  createTray(() => send('ui:openSettings'));

  // Backstop for the crash class the disable-features switch above targets —
  // logs it if it still happens, and rebuilds the window instead of leaving
  // the whole app gone.
  registerCrashDiagnostics(getOverlayWindow, () => createOverlayWindow(settings.displayId, settings.windowMode));

  registerIpc({
    getSettings: () => settings,
    patchSettings,
    provider,
    loop,
    clientIdConfigured: !!CLIENT_ID,
    setFullscreenView: (active) => setEscapeCapture(active, () => send('ui:escape')),
  });
  registerHotkeys({ getSettings: () => settings, patchSettings, send });
  loop.start();

  watchDisplayChanges(() => moveOverlayToDisplay(settings.displayId, settings.windowMode));

  // Sync the persisted setting with the OS on launch, in case it was changed
  // from outside the app (or this is first run).
  app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup });
});

app.on('will-quit', unregisterHotkeys);

// No dock/taskbar presence and a tray icon — closing the window must not quit
// the app; only the tray's Quit action (or app:quit from settings) should.
app.on('window-all-closed', () => {
  // intentionally a no-op: Syncity lives in the tray
});
