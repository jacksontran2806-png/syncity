import type { RGB } from '@shared/types';

/** `rgb(r, g, b)` for a style value. */
export function rgbCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** `rgba(r, g, b, a)` for a style value. Use this rather than appending hex
 *  alpha to rgbCss()'s output — `rgb(1, 2, 3)44` is not a colour, and the
 *  whole declaration it appears in is silently dropped. */
export function rgbaCss({ r, g, b }: RGB, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `#rrggbb`, for display next to the color wheel. */
export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** RGB (0-255) to HSL with h in degrees and s/l as 0..1 fractions. */
export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
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

/** Inverse of rgbToHsl. `h` in degrees (wrapped), `s`/`l` as 0..1. */
export function hslToRgb(h: number, s: number, l: number): RGB {
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

/** moodyTintRgb as a ready-to-use CSS colour. */
export function moodyTint(color: RGB, lightness = 0.15, satScale = 0.7): string {
  const { r, g, b } = moodyTintRgb(color, lightness, satScale);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Album Blend background, built from 1-3 of the palette's colors. 1 is a
 *  flat moody tint of just the primary (the old, "not enough color" look);
 *  2-3 spread a moody-tinted gradient across that many palette colors so the
 *  backdrop actually reads as pulled from the album instead of near-black. */
export function albumBlendCss(colors: RGB[], count: 1 | 2 | 3, lightness = 0.15, satScale = 0.7): string {
  const picked = colors.slice(0, count);
  const tints = picked.map((c) => moodyTintRgb(c, lightness, satScale));
  if (tints.length <= 1) return moodyTint(picked[0]!, lightness, satScale);
  const stops = tints.map((c, i) => `rgb(${c.r}, ${c.g}, ${c.b}) ${Math.round((i / (tints.length - 1)) * 100)}%`);
  return `linear-gradient(135deg, ${stops.join(', ')})`;
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

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). AA body text
 *  needs 4.5 or better. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Spins the hue around the wheel, keeping saturation and lightness. */
export function rotateHue(color: RGB, degrees: number): RGB {
  const { h, s, l } = rgbToHsl(color);
  return hslToRgb(h + degrees, s, l);
}

/** Walks the color's lightness away from the background until it clears
 *  minRatio. Keeps the hue — that's the whole point, a color that pops rather
 *  than falling back to flat white. */
export function clampForContrast(color: RGB, bg: RGB, minRatio = 4.5): RGB {
  const { h, s } = rgbToHsl(color);
  // Which direction actually wins has to be decided by the real contrast math,
  // not a flat 0.5 luminance split: WCAG relative luminance weights green far
  // more than HSL lightness does, so plenty of real colors (saturated greens
  // and yellows especially) sit above 0.5 in HSL lightness but still contrast
  // better against BLACK than white, and vice versa near the low end. Getting
  // this wrong means the loop walks toward the losing extreme and can top out
  // under minRatio even at pure white/black — the one guaranteed floor of
  // ~4.6:1 the whole approach depends on.
  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };
  const dir = contrastRatio(white, bg) >= contrastRatio(black, bg) ? 1 : -1;
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

// Split-complementary offset: the background keeps the album's own hue, the
// lyric color sits 150° around the wheel — one step short of the straight
// opposite (180°). That's far enough to read as a distinct, deliberate color
// pair (not just a darker/lighter version of the same hue) while staying
// closer to harmonious than a full complementary clash.
const SPLIT_COMPLEMENT_DEGREES = 150;

/** Lyric text color computed live from whatever background is actually behind
 *  it. Never hardcoded, never static-white. Related to the background by a
 *  split-complementary HSL hue shift, then clamped in lightness until it
 *  clears WCAG AA (4.5:1) against that exact background — color theory picks
 *  the hue, contrast math guarantees it's actually readable. */
export function contrastingLyricColor(bg: RGB, mode: 'transparent' | 'albumBlend' | 'custom', paletteMain: RGB): RGB {
  // Custom: there's no album palette to relate the text to — the user's own
  // pick IS the base hue, so split off of the background color itself.
  const baseHue = mode === 'custom' ? bg : paletteMain;
  // Album Blend, and Transparent contrasted against the blurred art behind it:
  // split-complementary hue off the base so the text pops without fighting
  // the background, then clamp its lightness until it clears WCAG AA.
  return clampForContrast(rotateHue(baseHue, SPLIT_COMPLEMENT_DEGREES), bg, 4.5);
}
