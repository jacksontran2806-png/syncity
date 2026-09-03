import type { RGB } from '@shared/types';

function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60) % 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp < 1) [rp, gp, bp] = [c, x, 0];
  else if (hp < 2) [rp, gp, bp] = [x, c, 0];
  else if (hp < 3) [rp, gp, bp] = [0, c, x];
  else if (hp < 4) [rp, gp, bp] = [0, x, c];
  else if (hp < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

/** Album color pushed down to a moody dark tint: keep the hue, ease off the
 *  saturation, and drop lightness to near-black so it reads as atmosphere
 *  rather than a bright color slapped behind the lyrics. */
export function moodyTintRgb(color: RGB, lightness = 0.15, satScale = 0.7): RGB {
  const { h, s } = rgbToHsl(color);
  return hslToRgb(h, s * satScale, lightness);
}

export function moodyTint(color: RGB, lightness = 0.15, satScale = 0.7): string {
  const { r, g, b } = moodyTintRgb(color, lightness, satScale);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------- contrast ----------

/** Standard WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function rotateHue(color: RGB, degrees: number): RGB {
  const { h, s, l } = rgbToHsl(color);
  return hslToRgb(h + degrees, s, l);
}

/** Walks the color's lightness away from the background until it clears
 *  minRatio. Keeps the hue — that's the whole point, a color that pops rather
 *  than falling back to flat white. */
export function clampForContrast(color: RGB, bg: RGB, minRatio = 4.5): RGB {
  const { h, s } = rgbToHsl(color);
  const bgLum = relativeLuminance(bg);
  // push away from the background: lighter on a dark bg, darker on a light one
  const dir = bgLum < 0.5 ? 1 : -1;
  let best = color;
  for (let step = 0; step <= 20; step++) {
    const l = Math.max(0, Math.min(1, rgbToHsl(color).l + dir * step * 0.045));
    const candidate = hslToRgb(h, s, l);
    best = candidate;
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;
  }
  // ran out of headroom — fall back to whichever extreme actually contrasts
  return dir > 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
}

/** Lyric text color computed live from whatever background is actually behind
 *  it. Never hardcoded, never static-white. */
export function contrastingLyricColor(bg: RGB, mode: 'transparent' | 'albumBlend' | 'solid', paletteMain: RGB): RGB {
  if (mode === 'solid') {
    // plain, guaranteed max contrast — this mode exists to get out of the way
    return relativeLuminance(bg) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  }
  // Album Blend, and Transparent contrasted against the blurred art behind it:
  // pull the complementary hue off the palette so the text pops, then clamp
  // its lightness until it clears WCAG AA.
  return clampForContrast(rotateHue(paletteMain, 180), bg, 4.5);
}
