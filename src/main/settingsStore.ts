import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types';

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    // 'snake' was the old name for what is now 'trail'.
    if (raw?.animationMode === 'snake') raw.animationMode = 'trail';
    // 'ambience' mode was deleted outright (not replaced) — nothing left
    // reproduces its look, so the safest landing is no glow at all rather than
    // surprising the user with a different animation on next launch.
    if (raw?.animationMode === 'ambience') raw.animationMode = 'none';
    // 'lava' mode was deleted outright too, same reasoning: same landing spot.
    if (raw?.animationMode === 'lava') raw.animationMode = 'none';
    // gradientMode only ever configured the deleted ambience ring; drop it so
    // it doesn't linger as a dead key in settings.json forever.
    if (raw && 'gradientMode' in raw) delete raw.gradientMode;
    // lyrics background 'filled' split into 'albumBlend' vs 'solid'.
    if (raw?.lyricsBackground === 'filled') raw.lyricsBackground = 'albumBlend';
    // 'moveWidgetMode' is gone: the boxes are always draggable, so the toggle
    // has nothing to gate. Dropped rather than left as a dead key.
    if (raw && 'moveWidgetMode' in raw) delete raw.moveWidgetMode;
    // The transparent/opaque panel toggle became a continuous panelOpacity
    // slider. Map the two old values onto the ends of the new range.
    if (raw && 'settingsPanelBackground' in raw) {
      if (raw.panelOpacity == null) raw.panelOpacity = raw.settingsPanelBackground === 'opaque' ? 1 : 0.55;
      delete raw.settingsPanelBackground;
    }
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}
