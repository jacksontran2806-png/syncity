// Visibility and resilience for the crash class the disable-features switch
// in index.ts targets (native window-occlusion bugs with transparent/
// always-on-top windows — see the comment there for the full story).
//
// uncaughtException/unhandledRejection in index.ts only ever catch JS errors
// in the main process. A renderer crash, a GPU-process crash, or the native
// occlusion bug are invisible to those — which is exactly why "the app just
// vanished" had nothing in the console to explain it. These handlers exist so
// the NEXT occurrence (if the switch doesn't fully eliminate it) leaves
// evidence, and so a partial crash doesn't take the whole app down with it.

import fs from 'node:fs';
import path from 'node:path';
import { app, type BrowserWindow } from 'electron';

function logPath(): string {
  return path.join(app.getPath('userData'), 'crash.log');
}

function record(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.error(stamped);
  try {
    fs.appendFileSync(logPath(), stamped + '\n');
  } catch {
    // If even the log write fails, there's nothing further to do — the
    // console.error above is the last line of defense.
  }
}

/**
 * Registers process-level crash visibility, and rebuilds the overlay window
 * if ITS renderer or GPU pipeline goes down. `getWindow`/`recreate` are
 * injected rather than imported directly so this module doesn't need to know
 * windows.ts's construction arguments — it just needs "the current window"
 * and "make a new one."
 */
export function registerCrashDiagnostics(getWindow: () => BrowserWindow | null, recreate: () => void): void {
  // A renderer-side crash (JS, or the native occlusion bug hitting this
  // window's own render process). `details.reason` is one of Electron's
  // named reasons ('crashed', 'oom', 'killed', 'launch-failed', ...).
  app.on('render-process-gone', (_event, webContents, details) => {
    const win = getWindow();
    const wasOverlay = win && !win.isDestroyed() && win.webContents === webContents;
    record(
      `render-process-gone: reason=${details.reason} exitCode=${details.exitCode} ` +
        `overlayWindow=${wasOverlay}`
    );
    if (wasOverlay) {
      record('overlay window lost its renderer — recreating rather than leaving it dark');
      recreate();
    }
  });

  // Covers GPU-process and other child-process crashes on newer Electron —
  // the occlusion bug specifically tends to manifest here, since it's a
  // compositor-level interaction.
  app.on('child-process-gone', (_event, details) => {
    record(`child-process-gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
  });

  // Best-effort: fires on a clean process.exit() too, but if something
  // catastrophic is about to take the whole process down, this is the last
  // chance to leave a trace of where it was.
  process.on('exit', (code) => {
    if (code !== 0) record(`process exiting with non-zero code=${code}`);
  });
}
