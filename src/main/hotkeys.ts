// Global hotkeys.
//
// Registration can fail if another app already owns the combo. That is not
// fatal — it only means the shortcut is unavailable — so it is logged rather
// than thrown, and the rest of the app comes up normally.

import { globalShortcut } from 'electron';
import type { AppSettings } from '../shared/types';
import { setOverlayVisible } from './windows';

export interface HotkeyContext {
  getSettings: () => AppSettings;
  patchSettings: (partial: Partial<AppSettings>) => AppSettings;
  send: (channel: string, payload?: unknown) => void;
}

function bind(accelerator: string, fn: () => void): void {
  try {
    if (!globalShortcut.register(accelerator, fn)) {
      console.warn(`[hotkey] ${accelerator} is already taken by another app`);
    }
  } catch (err) {
    console.warn(`[hotkey] could not register ${accelerator}:`, err);
  }
}

/** Binds the app-lifetime global shortcuts. A combo already owned by another
 *  app is logged and skipped, never thrown — see bind(). */
export function registerHotkeys({ getSettings, patchSettings, send }: HotkeyContext): void {
  bind('Control+Alt+F', () => {
    const windowMode = getSettings().windowMode === 'fullscreen' ? 'windowed' : 'fullscreen';
    // The renderer can't see a main-process settings change, so it's pushed.
    send('settings:changed', patchSettings({ windowMode }));
  });

  // Summons the widget back when Auto-hide has collapsed it to a pill, and
  // brings the overlay back if Escape dismissed it.
  bind('Control+Alt+L', () => {
    setOverlayVisible(true);
    send('ui:expandWidget');
  });
}

/**
 * Escape, bound globally but ONLY while a fullscreen view (Album/Lyrics) is on
 * screen.
 *
 * WHY IT HAS TO BE A GLOBAL ACCELERATOR: the overlay is click-through
 * (setIgnoreMouseEvents(true, {forward:true})) and is only ever shown with
 * showInactive(), so it never takes focus — and an unfocused window receives no
 * key events at all. The renderer's own window keydown listener therefore never
 * fired, which is exactly why Escape "did nothing" in Lyrics mode.
 *
 * WHY IT'S SCOPED RATHER THAN ALWAYS ON: a global Escape swallows the key for
 * every other app on the machine. That's only defensible while this overlay is
 * covering the whole screen and Escape means "back out of it". In island mode
 * the key belongs to whatever the user is actually working in, so the binding
 * is released the moment the fullscreen view closes.
 */
export function setEscapeCapture(enabled: boolean, onEscape: () => void): void {
  const bound = globalShortcut.isRegistered('Escape');
  if (enabled === bound) return;
  if (enabled) bind('Escape', onEscape);
  else globalShortcut.unregister('Escape');
}

/** Releases every global shortcut, including a live Escape capture. Bound to
 *  app will-quit so nothing outlives the process. */
export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
