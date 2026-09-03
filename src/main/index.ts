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
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { applyWindowMode, createOverlayWindow, getOverlayWindow, watchDisplayChanges, moveOverlayToDisplay } from './windows';
import { createTray } from './tray';

// Must be set before app.ready. Electron already ships a Per-Monitor-V2 DPI
// manifest, so this is belt-and-braces rather than the fix for the fullscreen
// margin — that was setBounds() being clamped by resizable:false (windows.ts).
// Left in because it costs nothing and rules the DPI path out entirely.
app.commandLine.appendSwitch('high-dpi-support', '1');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';

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
      send('glow:palette', {
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

/** Loopback audio capture for the reactive glow modes, without a screen-picker
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
  createTray(() => send('ui:open-settings'));

  registerIpc({ getSettings: () => settings, patchSettings, provider, loop, clientIdConfigured: !!CLIENT_ID });
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
  // intentionally a no-op: LyriGlow lives in the tray
});
