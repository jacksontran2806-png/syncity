// Is this window actually on screen?
//
// The overlay is hidden with win.hide() from the tray, from Escape, and from
// auto-hide, and a hidden BrowserWindow's page goes `visibilityState:
// 'hidden'`. Chromium stops firing requestAnimationFrame at that point, which
// sounds like it makes this redundant — it isn't, for two reasons. A loop that
// only ever re-arms itself from inside its own callback never gets a chance to
// restart once frames stop, so it needs to be told when the page comes back;
// and any future backgroundThrottling:false (a common fix for overlays that
// stall behind a fullscreen game) would leave every loop running at full rate
// against a window the user cannot see.

export function isPageActive(): boolean {
  return document.visibilityState !== 'hidden';
}

/** Calls `onChange` with the new value whenever the page is shown or hidden.
 *  Returns an unsubscribe. */
export function onPageActiveChange(onChange: (active: boolean) => void): () => void {
  const handler = (): void => onChange(isPageActive());
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
