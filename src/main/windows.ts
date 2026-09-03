import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';
import { is } from './env';
import { WINDOWED_SIZE, type WindowMode } from '../shared/types';
import {
  logClampedBounds,
  logRendererMetrics,
  logWindowBounds,
  type RendererMetrics,
} from './windowDiagnostics';

let overlayWin: BrowserWindow | null = null;

/** Bounds for a mode. Fullscreen uses display.bounds, NOT workArea — an
 *  overlay wants to cover the taskbar strip too.
 *
 *  UNITS: display.bounds is in DIPs (device-independent pixels) and
 *  win.setBounds() takes DIPs. They are the same coordinate space by design, so
 *  a 1920×1200 panel at 125% scaling correctly reports 1536×960 and a window of
 *  1536×960 DIPs covers the whole physical screen. Do NOT multiply by
 *  scaleFactor to "get the real resolution" — that produces a window 25% larger
 *  than the monitor. */
function boundsFor(mode: WindowMode, display: Electron.Display): Electron.Rectangle {
  if (mode === 'fullscreen') return { ...display.bounds };
  return {
    x: display.bounds.x + Math.round((display.bounds.width - WINDOWED_SIZE.width) / 2),
    y: display.bounds.y + Math.round((display.bounds.height - WINDOWED_SIZE.height) / 2),
    width: WINDOWED_SIZE.width,
    height: WINDOWED_SIZE.height,
  };
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWin;
}

/** Always a live query — never a value cached at launch or read back from the
 *  Settings display dropdown, which can be stale after a scaling or
 *  resolution change. */
export function pickDisplay(preferredId: number | null): Electron.Display {
  const displays = screen.getAllDisplays();
  const found = preferredId != null ? displays.find((d) => d.id === preferredId) : undefined;
  return found ?? screen.getPrimaryDisplay();
}

/**
 * setBounds() that actually takes effect, and says so if it doesn't.
 *
 * THE FULLSCREEN MARGIN BUG: Chromium clamps setBounds() to the window's
 * min/max size, and a window created with `resizable: false` reports
 * min == max == its current size. Every setBounds() call on it silently
 * no-ops. Same for `movable: false` and the x/y half. So the window kept
 * whatever size it was created at and "fullscreen" never grew to the display —
 * a margin on all four sides, with no error anywhere.
 *
 * Constraints are therefore cleared before the call, and the result is read
 * back and compared. There is no user-facing resize affordance to lose: the
 * window is frameless and click-through, so nothing can drag its edges anyway.
 */
function setBoundsVerified(win: BrowserWindow, target: Electron.Rectangle, label: string): void {
  win.setResizable(true);
  win.setMovable(true);
  win.setMinimumSize(1, 1);
  // 0,0 means "no maximum" — a leftover max from the windowed box would clamp
  // the fullscreen resize just as hard as resizable:false did.
  win.setMaximumSize(0, 0);

  win.setBounds(target);

  const got = win.getBounds();
  const same =
    got.x === target.x && got.y === target.y && got.width === target.width && got.height === target.height;
  if (!same) {
    // Second attempt via the split setters: some Windows/Chromium combinations
    // honour these when the combined call is rejected.
    win.setPosition(target.x, target.y);
    win.setSize(target.width, target.height);
    logClampedBounds(label, target, got, win.getBounds());
  }
}

/** Logs the numbers needed to tell "the window is undersized" apart from "the
 *  glow doesn't reach the window's edge". */
export function logWindowDiagnostics(label: string, display: Electron.Display): void {
  if (overlayWin && !overlayWin.isDestroyed()) logWindowBounds(label, overlayWin, display);
}

export function reportRendererMetrics(m: RendererMetrics): void {
  logRendererMetrics(m, overlayWin);
}

export function createOverlayWindow(displayId: number | null, mode: WindowMode = 'fullscreen'): BrowserWindow {
  const display = pickDisplay(displayId);
  const bounds = boundsFor(mode, display);

  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    // resizable/movable MUST stay true even though nothing may drag this
    // window: Chromium clamps setBounds() to min/max size, and false pins
    // min == max == the creation size, which silently breaks every later
    // resize. The window is frameless and click-through, so there is no edge
    // to grab regardless. See setBoundsVerified().
    resizable: true,
    movable: true,
    // No min/max constraints anywhere — a max sized for the windowed box would
    // clamp the fullscreen resize.
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
    // Re-assert after the window is real. Creation-time bounds on a
    // transparent+frameless Windows window are not always honoured exactly.
    setBoundsVerified(win, boundsFor(mode, pickDisplay(displayId)), `create/${mode}`);
    logWindowDiagnostics(`create/${mode}`, pickDisplay(displayId));
  });

  overlayWin = win;
  return win;
}

export function moveOverlayToDisplay(displayId: number | null, mode: WindowMode = 'fullscreen'): void {
  if (!overlayWin) return;
  const display = pickDisplay(displayId);
  setBoundsVerified(overlayWin, boundsFor(mode, display), `move/${mode}`);
}

/** Fullscreen by explicit bounds, NOT win.setFullScreen().
 *
 *  setFullScreen() on a frameless+transparent window is unreliable on Windows:
 *  DWM composition and Fullscreen Optimizations fight the transparency and the
 *  window can silently stay bounded. Setting bounds to the display rect avoids
 *  the OS fullscreen path entirely.
 *
 *  Click-through and transparency are re-asserted afterwards — they are the
 *  parts most likely to silently regress when bounds change. */
export function applyWindowMode(mode: WindowMode, displayId: number | null): void {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return;

  // Queried fresh at the moment of the toggle, never cached from launch or
  // from whatever the Settings display dropdown last rendered.
  const display = pickDisplay(displayId);
  setBoundsVerified(win, boundsFor(mode, display), mode);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  logWindowDiagnostics(mode, display);
}

export function setOverlayVisible(visible: boolean): void {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return;
  if (visible) win.showInactive();
  else win.hide();
}

// Standard Electron click-through pattern: the window globally ignores mouse
// events (forward:true still delivers mousemove to the renderer for hit
// testing), and the renderer tells us via IPC when the cursor is over an
// interactive region (widget/settings/lyrics panel) so we can flip it off
// just long enough for that click.
export function registerClickThroughIpc(): void {
  ipcMain.on('overlay:set-ignore-mouse-events', (_evt, ignore: boolean) => {
    overlayWin?.setIgnoreMouseEvents(ignore, { forward: true });
  });
}

export function watchDisplayChanges(onChange: () => void): void {
  screen.on('display-added', onChange);
  screen.on('display-removed', onChange);
  screen.on('display-metrics-changed', onChange);
}
