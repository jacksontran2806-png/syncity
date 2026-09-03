// Palette helpers shared by every glow mode.
//
// Extraction itself lives in the main process (src/main/color.ts, node-vibrant
// against the album-art bytes) and arrives over IPC — the renderer never
// re-decodes the artwork. What lives here is the crossfade: a JS lerp on a
// single glow layer, NOT two stacked canvases fading over each other, so a
// track change shifts color live with no ghost of the old trail behind it.

import type { GlowPalette, RGB } from '@shared/types';

export const PALETTE_CROSSFADE_MS = 400;

export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function rgbStr(c: RGB): string {
  return `rgb(${c.r | 0}, ${c.g | 0}, ${c.b | 0})`;
}

export function rgbaStr(c: RGB, alpha: number): string {
  return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${alpha})`;
}

/** Exponential step toward `to`, framerate-independent via dtMs. */
export function crossfadePalette(
  from: GlowPalette,
  to: GlowPalette,
  dtMs: number,
  ms: number = PALETTE_CROSSFADE_MS
): GlowPalette {
  const k = 1 - Math.exp(-dtMs / Math.max(1, ms));
  return {
    primary: lerpRgb(from.primary, to.primary, k),
    secondary: lerpRgb(from.secondary, to.secondary, k),
    tertiary: lerpRgb(from.tertiary, to.tertiary, k),
  };
}
