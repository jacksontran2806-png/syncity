// Pins the lyrics-mode color relationship: background and active lyric color
// must be related by a split-complementary (or, if that ever changes,
// analogous) HSL hue shift off the same base — never an arbitrary/independent
// pick — and must always clear WCAG AA (4.5:1) against each other regardless
// of what hue the album art hands in.

import { albumBlendCss, contrastingLyricColor, contrastRatio, moodyTintRgb } from '../src/renderer/src/lib/colorUtils';
import { check, done } from './assert';
import type { RGB } from '../src/shared/types';

function rgbToHue({ r, g, b }: RGB): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// A spread of album-art base hues, including near-grey (low saturation, where
// hue is closest to meaningless) and the app's own default purple.
const baseColors: RGB[] = [
  { r: 124, g: 92, b: 255 }, // default palette purple
  { r: 220, g: 60, b: 40 }, // warm red
  { r: 40, g: 180, b: 90 }, // green
  { r: 30, g: 90, b: 200 }, // blue
  { r: 240, g: 210, b: 40 }, // yellow
  { r: 128, g: 128, b: 130 }, // near-grey
];

for (const base of baseColors) {
  for (const mode of ['albumBlend', 'transparent'] as const) {
    const bg = moodyTintRgb(base, mode === 'albumBlend' ? 0.15 : 0.12);
    const text = contrastingLyricColor(bg, mode, base);
    const ratio = contrastRatio(text, bg);
    check(
      `${mode} @ hue~${Math.round(rgbToHue(base))}: text clears WCAG AA against its own background`,
      ratio >= 4.5,
      `ratio=${ratio.toFixed(2)}`
    );
  }
}

// Hue-relationship check on a saturated, unambiguous base color.
const sat = { r: 220, g: 60, b: 40 };
const satBg = moodyTintRgb(sat, 0.15);
const satText = contrastingLyricColor(satBg, 'albumBlend', sat);
const baseHue = rgbToHue(sat);
const textHue = rgbToHue(satText);
const deltaFromBase = hueDelta(baseHue, textHue);
check(
  'lyric color is NOT the same hue as the background (not just a lightness flip)',
  deltaFromBase > 30,
  `base=${baseHue.toFixed(0)} text=${textHue.toFixed(0)} delta=${deltaFromBase.toFixed(0)}`
);
check(
  'lyric color is NOT a straight (180°) complementary of the background',
  Math.abs(deltaFromBase - 180) > 15,
  `delta=${deltaFromBase.toFixed(0)}`
);
check(
  'lyric color sits in a split-complementary or analogous band off the base hue',
  deltaFromBase <= 165,
  `delta=${deltaFromBase.toFixed(0)}`
);

// Custom background: any arbitrary user-picked color still clears AA, with
// the split-complementary relationship anchored to the custom color itself
// (there's no album palette to derive it from).
for (const custom of baseColors) {
  const text = contrastingLyricColor(custom, 'custom', sat /* palette is irrelevant in custom mode */);
  const ratio = contrastRatio(text, custom);
  check(
    `custom @ hue~${Math.round(rgbToHue(custom))}: text clears WCAG AA against the user's own pick`,
    ratio >= 4.5,
    `ratio=${ratio.toFixed(2)}`
  );
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
