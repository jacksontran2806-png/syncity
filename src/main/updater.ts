// Updating in place, from the app's own GitHub releases.
//
// WHAT THIS IS CAREFUL ABOUT:
//
// Nothing installs itself out from under the user. The download happens
// quietly, but the restart that applies it never does — this app sits on
// screen during whatever else someone is doing, and a self-restart mid-song is
// the kind of "helpful" that people uninstall over. The update waits until
// they say so, or until the next time they quit.
//
// A portable build cannot update itself. electron-updater applies updates by
// running the NSIS installer, and the portable exe has none — it is a file
// someone put wherever they liked, possibly read-only, possibly on a stick.
// Rather than fail with a stack trace, that case is detected up front and
// reported as what it is.
//
// None of this runs unpackaged. In development the "current version" is the
// dev app's, the feed is the real one, and every check would offer to
// downgrade the thing you are working on.

import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/types';

/** electron-builder sets this only in the portable build, and it is the one
 *  reliable way to tell the two Windows targets apart at runtime. */
function isPortableBuild(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}

/** Six hours. Long enough to be invisible, short enough that someone who
 *  leaves the app open for a week still lands on a current build. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Not immediately at launch: the first seconds after start belong to getting
 *  the overlay up and the first poll away. */
const FIRST_CHECK_DELAY_MS = 25_000;

export interface UpdaterDeps {
  /** Whether the user wants background checks. Read per call — they can turn
   *  it off at any time, and that must take effect without a restart. */
  autoCheckEnabled: () => boolean;
  send: (status: UpdateStatus) => void;
}

export interface Updater {
  /** Checks now, because the user pressed a button. Downloads whatever it
   *  finds regardless of the auto-check setting — the setting governs
   *  BACKGROUND checks, and an explicit press is not one. */
  checkNow: () => Promise<void>;
  /** Restarts into the downloaded update. Only meaningful in 'ready'. */
  installNow: () => void;
  /** Starts the background schedule. */
  start: () => void;
  stop: () => void;
  status: () => UpdateStatus;
}

export function createUpdater({ autoCheckEnabled, send }: UpdaterDeps): Updater {
  const currentVersion = app.getVersion();
  let status: UpdateStatus = { state: 'idle', currentVersion };
  let timer: ReturnType<typeof setInterval> | null = null;
  let firstCheck: ReturnType<typeof setTimeout> | null = null;

  const set = (next: Partial<UpdateStatus>): void => {
    status = { ...status, ...next, currentVersion };
    send(status);
  };

  const unsupportedReason = (): string | null => {
    if (!app.isPackaged) return 'Updates are disabled while running from source.';
    if (isPortableBuild()) {
      return 'The portable build cannot update itself. Download the latest version to replace it.';
    }
    return null;
  };

  // The download is explicit, so the app decides when it starts rather than
  // having one begin the moment a check finds something.
  autoUpdater.autoDownload = false;
  // Nothing is applied on quit unless an update is actually sitting ready —
  // electron-updater's own default, restated here because the whole design
  // depends on it.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));

  autoUpdater.on('update-available', (info) => {
    set({ state: 'available', version: info.version });
    autoUpdater.downloadUpdate().catch((err: Error) => {
      set({ state: 'error', message: err.message });
    });
  });

  autoUpdater.on('update-not-available', () => set({ state: 'none' }));

  autoUpdater.on('download-progress', (p) => {
    set({ state: 'downloading', percent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version, percent: 100 });
  });

  autoUpdater.on('error', (err: Error) => {
    // A failed check is not worth alarming anyone about — it usually means no
    // network, or a release without a latest.yml beside its installer. Said
    // plainly and left alone; the next check will try again.
    set({ state: 'error', message: err.message });
  });

  const check = async (): Promise<void> => {
    const blocked = unsupportedReason();
    if (blocked) {
      set({ state: 'unsupported', message: blocked });
      return;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      set({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return {
    checkNow: check,
    installNow: () => {
      if (status.state !== 'ready') return;
      // isSilent false so the installer's own progress is visible, isForceRunAfter
      // true so the app comes back up rather than leaving the user staring at a
      // desktop where the overlay used to be.
      autoUpdater.quitAndInstall(false, true);
    },
    start() {
      if (unsupportedReason()) return;
      const maybeCheck = () => {
        if (autoCheckEnabled()) void check();
      };
      firstCheck = setTimeout(maybeCheck, FIRST_CHECK_DELAY_MS);
      timer = setInterval(maybeCheck, CHECK_INTERVAL_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      if (firstCheck) clearTimeout(firstCheck);
      timer = null;
      firstCheck = null;
    },
    status: () => status,
  };
}
