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
    send('ui:expand-widget');
  });
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
