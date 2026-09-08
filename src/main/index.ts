import dotenv from 'dotenv';
import path from 'node:path';
import { app, session, desktopCapturer } from 'electron';

// Development convenience only: the repo's .env, then one the user may have
// put in their own userData folder. Neither is how a normal install is
// configured — that happens in Settings, and is stored with the settings.
// dotenv never overwrites a variable that is already set, so this order is
// the precedence.
dotenv.config();
dotenv.config({ path: path.join(app.getPath('userData'), '.env') });

/** Injected at build time — empty string when the build machine had none. */
declare const __SPOTIFY_REDIRECT_URI__: string;

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
import { clearTokens } from './spotify/tokens';
import { createNowPlayingLoop } from './nowPlayingLoop';
import { registerIpc } from './ipc';
import { registerHotkeys, setEscapeCapture, unregisterHotkeys } from './hotkeys';
import { applyWindowMode, createOverlayWindow, getOverlayWindow, watchDisplayChanges, moveOverlayToDisplay } from './windows';
import { createTray } from './tray';
import { createUpdater } from './updater';
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

// Windows identity. Without it the taskbar, Alt-Tab and any notification we
// ever raise attribute the app to "electron.app.Electron" and show Electron's
// own icon. Must match the appId in electron-builder.yml, or a packaged build
// and its shortcuts are treated as two different applications.
app.setAppUserModelId('com.syncity.app');

// One copy at a time. Two instances share a userData folder — the same
// settings.json, the same Spotify token file, the same Chromium cache — and
// register the same global hotkeys, so the second one comes up with its
// shortcuts already taken and both write over each other. There is also no
// window to look at: the app lives in the tray, so a user who clicks the
// shortcut twice has no way to tell it is already running. Launching again
// just shows the overlay of the copy that is already there.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getOverlayWindow();
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.showInactive();
  });
}

const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI || __SPOTIFY_REDIRECT_URI__ || 'http://127.0.0.1:8888/callback';

/**
 * Which Spotify application this install talks to.
 *
 * There is no fallback, on purpose. Builds used to carry a client ID, and it
 * could not work: an app that hasn't passed Spotify's quota review runs in
 * Development Mode, which admits ONLY the users its owner has typed into the
 * dashboard by name and email, up to 25. A stranger who downloaded Syncity was
 * never on that list, so the bundled ID failed on their first press while
 * implying the app was broken. It also pooled every user onto one
 * application's rate limit, so the few who WERE on the list throttled each
 * other.
 *
 * Every install now authenticates through an application its own user
 * registered: their own allowance, their own quota, and their listening never
 * passing through anybody else's app. The environment variable stays for
 * development.
 */
function clientId(): string | undefined {
  return settings.spotifyClientId.trim() || process.env.SPOTIFY_CLIENT_ID || undefined;
}

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

const updater = createUpdater({
  autoCheckEnabled: () => settings.autoUpdateCheckEnabled,
  send: (status) => send('update:status', status),
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

  // A different Spotify application means the stored tokens belong to an app
  // we are no longer using — they cannot be refreshed, so keeping them would
  // leave the UI claiming to be connected while every request failed. Drop
  // them, rebuild the provider around the new ID, and tell the renderer, which
  // is what flips the widget back to "Connect Spotify".
  if ('spotifyClientId' in partial) {
    clearTokens();
    rebuildSpotifyProvider();
    loop.forgetTrack();
    void loop.tick();
    sendSpotifyStatus();
  }

  return settings;
}

/** Rebuilds the Spotify provider around the current client ID. The provider
 *  captures its ID at construction, so changing the setting means building a
 *  new one rather than mutating the old. */
function rebuildSpotifyProvider(): void {
  spotifyProvider = createSpotifyProvider(clientId(), REDIRECT_URI);
}

/** Pushes connection state to the renderer. Sent on change rather than only
 *  answered on request, so the widget stops showing "Connect Spotify" the
 *  moment a login finishes instead of on the next thing that happens to ask. */
function sendSpotifyStatus(): void {
  send('spotify:status', {
    authed: spotifyProvider.isAuthed(),
    clientIdConfigured: !!clientId(),
    clientId: settings.spotifyClientId,
    redirectUri: REDIRECT_URI,
  });
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
  // quit() before ready is asynchronous, so a losing second instance still
  // gets its ready event — and without this it would spend that moment
  // grabbing global hotkeys and the Chromium cache directory out from under
  // the copy that is actually running.
  if (!isPrimaryInstance) return;

  rebuildSpotifyProvider();
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
    clientId,
    redirectUri: REDIRECT_URI,
    sendSpotifyStatus,
    setFullscreenView: (active) => setEscapeCapture(active, () => send('ui:escape')),
    updater,
  });
  registerHotkeys({ getSettings: () => settings, patchSettings, send });
  loop.start();
  updater.start();

  watchDisplayChanges(() => moveOverlayToDisplay(settings.displayId, settings.windowMode));

  // Sync the persisted setting with the OS on launch, in case it was changed
  // from outside the app (or this is first run).
  app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup });
});

app.on('will-quit', () => {
  unregisterHotkeys();
  updater.stop();
});

// No dock/taskbar presence and a tray icon — closing the window must not quit
// the app; only the tray's Quit action (or app:quit from settings) should.
app.on('window-all-closed', () => {
  // intentionally a no-op: Syncity lives in the tray
});
