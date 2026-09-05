import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types';

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** Reads settings.json, migrates any keys left over from removed features,
 *  and fills every gap from DEFAULT_SETTINGS. Never throws: an unreadable or
 *  corrupt file falls back to defaults so the app still starts. */
export function loadSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    // The whole glow-animation system (ambience, lava, trail, and finally
    // 'aura'/"Wave") was deleted outright with nothing left to reproduce any
    // of their looks. animationMode and its per-mode settings are dropped so
    // they don't linger in settings.json forever.
    for (const key of [
      'animationMode',
      'thickness',
      'auraWaveCount',
      'auraWaveHeight',
      'auraWaveSpeed',
      'auraRippleDetail',
      'trailLengthPct',
      'trailSpeed',
      'trailSpeedReactivity',
      'trailMaxSpeedMultiplier',
      'trailTextureAmp1',
      'trailTextureAmp2',
      'edgeSharpness',
      'trailMotionMode',
    ]) {
      if (raw && key in raw) delete raw[key];
    }
    // gradientMode only ever configured the deleted ambience ring; drop it so
    // it doesn't linger as a dead key in settings.json forever.
    if (raw && 'gradientMode' in raw) delete raw.gradientMode;
    // lyrics background 'filled' split into 'albumBlend' vs 'solid' (the
    // latter now gone too, see below).
    if (raw?.lyricsBackground === 'filled') raw.lyricsBackground = 'albumBlend';
    // 'solid' (fixed flat black/white, no other color) was deleted outright —
    // 'custom' (any color, via the color wheel) fully replaces it, so land on
    // 'custom' with lyricsCustomColor set to whichever of black/white was
    // picked, preserving how the view actually looked rather than resetting
    // it to the transparent default.
    if (raw?.lyricsBackground === 'solid') {
      raw.lyricsBackground = 'custom';
      raw.lyricsCustomColor = raw.lyricsSolidColor === 'white' ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    }
    if (raw && 'lyricsSolidColor' in raw) delete raw.lyricsSolidColor;
    // Overlay mode 'default' was removed — it was Free without the dragging,
    // so Free is the closest landing spot and keeps the widget where the user
    // last had it rather than snapping it to the top edge.
    if (raw?.overlayMode === 'default') raw.overlayMode = 'free';
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

/** Writes the whole settings object to disk. Callers go through
 *  index.ts's patchSettings so a save can't skip its side effects. */
export function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}
