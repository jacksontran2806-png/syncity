// Pins the lyrics-mode colour system.
//
// The rule this replaces was "spin the background hue 150° and clamp for
// contrast", and its tests pinned exactly that — a fixed hue relationship.
// The system now picks FROM the album's palette by scoring candidates, so
// what's worth pinning is different: the colour must belong to the artwork
// (analogous, never complementary), must never be neon, must land on the
// right side of light/dark for its background, must actually differ between
// albums, and must still clear WCAG AA every time.

import {
  albumBlendCss,
  contrastRatio,
  hslToRgb,
  moodyTintRgb,
  relativeLuminance,
  rgbToHsl,
} from '../src/renderer/src/lib/colorUtils';
import { blurredBackdropRgb, paletteLyricColor } from '../src/renderer/src/lib/lyricColor';
import { check, done } from './assert';
import type { AlbumPalette, RGB } from '../src/shared/types';

function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** A plausible extracted palette: a base colour plus two relatives, the way
 *  node-vibrant hands back a dominant and its neighbours. */
function palette(base: RGB): AlbumPalette {
  const { h, s, l } = rgbToHsl(base);
  const shift = (dh: number, dl: number): RGB =>
    hslToRgb(h + dh, s, Math.max(0.08, Math.min(0.92, l + dl)));
  return { primary: base, secondary: shift(24, 0.1), tertiary: shift(-32, -0.08) };
}

const albums: { name: string; base: RGB }[] = [
  { name: 'purple', base: { r: 124, g: 92, b: 255 } },
  { name: 'red', base: { r: 220, g: 60, b: 40 } },
  { name: 'green', base: { r: 40, g: 180, b: 90 } },
  { name: 'blue', base: { r: 30, g: 90, b: 200 } },
  { name: 'yellow', base: { r: 240, g: 210, b: 40 } },
  { name: 'near-grey', base: { r: 128, g: 128, b: 130 } },
  { name: 'bright cream', base: { r: 245, g: 232, b: 205 } },
  { name: 'near-black', base: { r: 22, g: 20, b: 28 } },
];

const chosen: Record<string, RGB> = {};

for (const { name, base } of albums) {
  const pal = palette(base);

  for (const mode of ['albumBlend', 'albumCover'] as const) {
    const bg = mode === 'albumBlend' ? moodyTintRgb(pal.primary) : blurredBackdropRgb(pal);
    const pick = paletteLyricColor(pal, bg, mode);
    const ratio = contrastRatio(pick.color, bg);
    const { h, s, l } = rgbToHsl(pick.color);

    // The readability contract: AA, or — on a mid-luminance cover where the
    // only thing that clears AA is pure black or pure white — no worse than
    // 3.4:1 AND carrying a shadow to make up the difference on the real
    // pixels. What is NOT allowed is trading readability for looks silently.
    check(
      `${name}/${mode}: readable — AA, or the relaxed floor with a shadow`,
      ratio >= 4.5 || (ratio >= 3.4 && pick.shadow !== null),
      `ratio=${ratio.toFixed(2)} shadow=${pick.shadow ?? 'none'}`
    );

    check(
      `${name}/${mode}: never neon`,
      s <= 0.6,
      `saturation=${s.toFixed(2)}`
    );

    // Light background -> deep text, dark background -> light text, measured
    // in WCAG luminance rather than HSL lightness. The two disagree badly on
    // saturated hues: a vivid purple sits at 0.54 HSL lightness but 0.17
    // luminance, i.e. it is a DARK background and wants light text. Judging it
    // by HSL would assert the opposite of what the eye sees. The middle band
    // is skipped — there, either direction is a defensible answer.
    const bgLum = relativeLuminance(bg);
    const textLum = relativeLuminance(pick.color);
    if (bgLum < 0.22 || bgLum > 0.45) {
      check(
        `${name}/${mode}: sits on the readable side of the background`,
        bgLum < 0.22 ? textLum > bgLum : textLum < bgLum,
        `bg lum=${bgLum.toFixed(2)} text lum=${textLum.toFixed(2)} (text l=${l.toFixed(2)})`
      );
    }

    // The whole point of the rewrite: harmony, not opposition. Only
    // meaningful when the album itself has a hue to be harmonious with, and
    // only when the chosen colour is chromatic enough to have one.
    const paletteSat = rgbToHsl(pal.primary).s;
    if (paletteSat > 0.2 && s > 0.08) {
      const delta = hueDelta(h, rgbToHsl(pal.primary).h);
      check(
        `${name}/${mode}: hue belongs to the artwork, not its opposite`,
        delta <= 60,
        `delta=${delta.toFixed(0)}° from the album's dominant hue`
      );
      check(
        `${name}/${mode}: specifically NOT the complementary hue`,
        Math.abs(delta - 180) > 60,
        `delta=${delta.toFixed(0)}°`
      );
    }

    if (mode === 'albumBlend') chosen[name] = pick.color;
  }
}

// A coloured cover must not land on flat black or flat white: that is the
// "readable but unrelated" answer the whole system exists to avoid.
for (const { name, base } of albums) {
  const pal = palette(base);
  if (rgbToHsl(pal.primary).s <= 0.2) continue; // greyscale cover, neutral is honest
  for (const mode of ['albumBlend', 'albumCover'] as const) {
    const bg = mode === 'albumBlend' ? moodyTintRgb(pal.primary) : blurredBackdropRgb(pal);
    const { color } = paletteLyricColor(pal, bg, mode);
    const neutral = rgbToHsl(color).s < 0.04;
    check(
      `${name}/${mode}: a coloured cover does not fall back to flat black or white`,
      !neutral,
      `rgb(${color.r}, ${color.g}, ${color.b})`
    );
  }
}

// Different artwork has to produce different colours — a system that always
// lands on the same near-white would pass every check above and defeat the
// entire point.
const distinct = new Set(Object.values(chosen).map((c) => `${c.r},${c.g},${c.b}`));
check(
  'different albums produce noticeably different lyric colours',
  distinct.size >= albums.length - 1,
  `${distinct.size} distinct colours across ${albums.length} albums`
);

// Album cover leans on a shadow because the blurred cover under the text is an
// average, not a flat fill. Clear leans on one because there is no background
// of ours at all — the text is over whatever the user has on screen.
const red = palette({ r: 220, g: 60, b: 40 });
const coverPick = paletteLyricColor(red, blurredBackdropRgb(red), 'albumCover');
check('album cover mode always carries a shadow', coverPick.shadow !== null, String(coverPick.shadow));
const clearPick = paletteLyricColor(red, { r: 128, g: 128, b: 132 }, 'clear');
check('clear mode always carries a shadow', clearPick.shadow !== null, String(clearPick.shadow));
check(
  'clear mode still picks a colour from the artwork rather than plain white',
  rgbToHsl(clearPick.color).s >= 0.04,
  `rgb(${clearPick.color.r}, ${clearPick.color.g}, ${clearPick.color.b})`
);

// The estimated blurred backdrop must track the artwork's actual brightness —
// the old code measured everything against a near-black stand-in, which is
// how a bright cover passed a contrast check it visibly failed on screen.
const brightBackdrop = blurredBackdropRgb(palette({ r: 245, g: 232, b: 205 }));
const darkBackdrop = blurredBackdropRgb(palette({ r: 22, g: 20, b: 28 }));
check(
  'a bright cover estimates a bright blurred backdrop',
  rgbToHsl(brightBackdrop).l > 0.5,
  `l=${rgbToHsl(brightBackdrop).l.toFixed(2)}`
);
check(
  'a dark cover estimates a dark one',
  rgbToHsl(darkBackdrop).l < 0.2,
  `l=${rgbToHsl(darkBackdrop).l.toFixed(2)}`
);

// Custom background: an arbitrary user pick still has to be readable, with the
// colour still drawn from the album palette.
for (const { name, base } of albums) {
  for (const custom of [{ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }, { r: 120, g: 130, b: 90 }]) {
    const pick = paletteLyricColor(palette(base), custom, 'custom');
    const ratio = contrastRatio(pick.color, custom);
    check(
      `${name} on custom bg rgb(${custom.r},${custom.g},${custom.b}): readable`,
      ratio >= 4.5 || (ratio >= 3.4 && pick.shadow !== null),
      `ratio=${ratio.toFixed(2)} shadow=${pick.shadow ?? 'none'}`
    );
  }
}

// albumBlendCss: 1 color is a flat rgb(), never a gradient; 2-3 colors
// produce a gradient with exactly that many stops.
const palette3: RGB[] = [{ r: 220, g: 60, b: 40 }, { r: 40, g: 180, b: 90 }, { r: 30, g: 90, b: 200 }];
const flat = albumBlendCss(palette3, 1);
check('1 blend color is a flat rgb(), not a gradient', /^rgb\(/.test(flat), flat);
const two = albumBlendCss(palette3, 2);
check('2 blend colors produce a linear-gradient with 2 stops', two.startsWith('linear-gradient') && two.split('rgb(').length - 1 === 2, two);
const three = albumBlendCss(palette3, 3);
check('3 blend colors produce a linear-gradient with 3 stops', three.startsWith('linear-gradient') && three.split('rgb(').length - 1 === 3, three);

done();
