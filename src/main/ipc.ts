// Every ipcMain handler in one place.
//
// Handlers take an explicit context rather than reaching for module-level
// state in index.ts. That keeps the "what can IPC touch?" answer readable:
// it's this interface, and nothing else.

import { app, ipcMain, screen, shell } from 'electron';
import type { AppSettings } from '../shared/types';
import { RELEASE_NOTES_URL } from '../shared/releaseNotes';
import type { NowPlayingProvider } from './providers/types';
import type { NowPlayingLoop } from './nowPlayingLoop';
import type { Updater } from './updater';
import { clearTokens } from './spotify/tokens';
import {
  moveOverlayToDisplay,
  registerClickThroughIpc,
  reportRendererMetrics,
  setOverlayVisible,
} from './windows';

export interface IpcContext {
  getSettings: () => AppSettings;
  /** Merges, persists, and runs any side effects the changed keys imply. */
  patchSettings: (partial: Partial<AppSettings>) => AppSettings;
  provider: () => NowPlayingProvider;
  loop: NowPlayingLoop;
  /** The Spotify application in force right now — the user's own if they have
   *  set one, otherwise the build's. Resolved per call, never captured: the
   *  user can change it from Settings at any time. */
  clientId: () => string | undefined;
  /** Shown in Settings so the user can copy it into their Spotify app's
   *  allowed redirect URIs, which is the step everyone gets wrong. */
  redirectUri: string;
  /** Pushes connection state to the renderer after something changes it. */
  sendSpotifyStatus: () => void;
  updater: Updater;
  /** Binds/releases the global Escape accelerator as fullscreen views open
   *  and close — see hotkeys.ts setEscapeCapture for why it's scoped. */
  setFullscreenView: (active: boolean) => void;
}

/** Registers every ipcMain handler. Call once, after the window exists. */
export function registerIpc(ctx: IpcContext): void {
  const { getSettings, patchSettings, provider, loop } = ctx;
  // Asks the loop to look again soon and stay alert for a few polls — it owns
  // the timing now, so a command can never leave two schedules running.
  const repoll = () => loop.bump();

  registerClickThroughIpc();

  // --- auth ---
  const spotifyStatus = () => ({
    authed: provider().isAuthed(),
    clientIdConfigured: !!ctx.clientId(),
    clientId: getSettings().spotifyClientId,
    redirectUri: ctx.redirectUri,
  });

  ipcMain.handle('spotify:status', spotifyStatus);

  ipcMain.handle('spotify:connect', async () => {
    await provider().login();
    loop.forgetTrack();
    void loop.tick();
    ctx.sendSpotifyStatus();
    return { authed: true };
  });

  // Sign out. Separate from clearing the client ID: someone switching Spotify
  // accounts wants to keep the application they registered.
  ipcMain.handle('spotify:disconnect', () => {
    clearTokens();
    loop.forgetTrack();
    ctx.sendSpotifyStatus();
    void loop.tick();
    return spotifyStatus();
  });

  // Opens the Spotify dashboard in the real browser. A link inside a
  // click-through always-on-top overlay is not something to make the user
  // hunt for, and shell.openExternal is the only way out of it.
  ipcMain.handle('spotify:openDashboard', () => shell.openExternal('https://developer.spotify.com/dashboard'));

  // A fixed URL, not one passed in from the renderer. shell.openExternal hands
  // whatever it is given to the OS, so the renderer never gets to choose the
  // destination — same reason the dashboard link above is written out here.
  ipcMain.handle('app:openReleaseNotes', () => shell.openExternal(RELEASE_NOTES_URL));

  // --- settings ---
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:update', (_evt, partial: Partial<AppSettings>) => patchSettings(partial));

  // --- window ---
  ipcMain.handle('window:setMode', (_evt, windowMode: AppSettings['windowMode']) => patchSettings({ windowMode }));
  ipcMain.handle('overlay:hide', () => setOverlayVisible(false));
  ipcMain.on('overlay:setFullscreenView', (_evt, active: boolean) => ctx.setFullscreenView(!!active));
  ipcMain.handle('window:reportMetrics', (_evt, m: Parameters<typeof reportRendererMetrics>[0]) =>
    reportRendererMetrics(m)
  );

  // Label shows BOTH the DIP size the app works in and the native pixel size
  // Windows Display Settings reports, because seeing only "1536×960" on a
  // 1920×1200 panel reads as a bug when it is just DPI scaling.
  ipcMain.handle('monitor:list', () => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => {
      const native = `${Math.round(d.bounds.width * d.scaleFactor)}×${Math.round(d.bounds.height * d.scaleFactor)}`;
      const suffix = d.scaleFactor !== 1 ? ` (${native} @ ${Math.round(d.scaleFactor * 100)}%)` : '';
      return { id: d.id, label: `${d.bounds.width}×${d.bounds.height}${suffix}`, primary: d.id === primaryId };
    });
  });

  ipcMain.handle('monitor:select', (_evt, displayId: number) => {
    const next = patchSettings({ displayId });
    moveOverlayToDisplay(displayId, next.windowMode);
    return next;
  });

  // --- playback ---
  ipcMain.handle('playback:next', async () => {
    await provider().skipNext();
    repoll();
  });

  ipcMain.handle('playback:previous', async () => {
    await provider().skipPrevious();
    repoll();
  });

  ipcMain.handle('playback:playPause', async (_evt, play: boolean) => {
    await provider().playPause(play);
    repoll();
  });

  // Immediate re-read of the playback position. The renderer extrapolates
  // lyric time from the last poll's progressMs plus a wall-clock delta, which
  // drifts across the 2.5s poll gap and breaks outright after a seek. This is
  // what the lyrics view's Resync button calls.
  // force: a Resync that lands while a routine poll is in flight must not be
  // answered with that poll's position — it was read before the user asked.
  ipcMain.handle('playback:sync', () => loop.tick({ force: true }));

  // --- updates ---
  ipcMain.handle('update:status', () => ctx.updater.status());
  ipcMain.handle('update:check', () => ctx.updater.checkNow());
  // Restarts into the new version. Deliberately a separate call from the
  // download: the app is on screen over whatever the user is doing, so the
  // moment it disappears and comes back is theirs to pick.
  ipcMain.handle('update:install', () => ctx.updater.installNow());

  // --- app ---
  ipcMain.handle('app:quit', () => app.quit());
}
