// Logging for the "fullscreen leaves a margin" class of bug.
//
// Kept out of windows.ts so the bounds logic there stays short. The point of
// these logs is to separate three different failures that look identical on
// screen: the window is smaller than the display, the page is smaller than the
// window, or both are "correct" but against the wrong display.

import type { BrowserWindow } from 'electron';

export interface RendererMetrics {
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
}

/** Main-process side: display vs. actual window bounds. */
export function logWindowBounds(label: string, win: BrowserWindow, display: Electron.Display): void {
  const b = win.getBounds();
  const d = display.bounds;
  const native = `${Math.round(d.width * display.scaleFactor)}×${Math.round(d.height * display.scaleFactor)}`;
  const verdict = b.width === d.width && b.height === d.height ? '[matches display]' : '[MISMATCH — window is undersized]';

  console.log(
    `[window] ${label} main-side:\n` +
      `  display.bounds (DIP) : ${d.width}×${d.height} @(${d.x},${d.y})\n` +
      `  scaleFactor          : ${display.scaleFactor}\n` +
      `  implied native px    : ${native}  <- compare THIS to Windows Display Settings\n` +
      `  window.getBounds()   : ${b.width}×${b.height} @(${b.x},${b.y})  ${verdict}`
  );
}

/** Renderer-process side. If the window matches the display but these are
 *  smaller, the gap is inside the page (CSS/canvas), not in the window. */
export function logRendererMetrics(m: RendererMetrics, win: BrowserWindow | null): void {
  const b = win && !win.isDestroyed() ? win.getBounds() : null;
  const verdict = !b
    ? ''
    : `\n  vs window bounds         : ${b.width}×${b.height}  ` +
      (m.innerWidth === b.width && m.innerHeight === b.height
        ? '[page fills the window]'
        : '[page is smaller than the window]');

  console.log(
    `[window] renderer-side:\n` +
      `  window.innerWidth/Height : ${m.innerWidth}×${m.innerHeight}\n` +
      `  screen.width/height      : ${m.screenWidth}×${m.screenHeight}\n` +
      `  devicePixelRatio         : ${m.devicePixelRatio}` +
      verdict
  );
}

/** Reports a setBounds() that didn't take, with both attempts' results. */
export function logClampedBounds(
  label: string,
  target: Electron.Rectangle,
  got: Electron.Rectangle,
  retry: Electron.Rectangle
): void {
  console.warn(
    `[window] ${label}: setBounds was clamped. ` +
      `wanted ${target.width}×${target.height} @(${target.x},${target.y}), ` +
      `got ${got.width}×${got.height} @(${got.x},${got.y}), ` +
      `after retry ${retry.width}×${retry.height} @(${retry.x},${retry.y})`
  );
}
