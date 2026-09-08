// Pins the album-palette extractor that replaced node-vibrant.
//
// There is no real artwork here — the suites run in plain Node with no
// Chromium to decode a JPEG — so each case is a synthetic bitmap in the exact
// layout nativeImage.getBitmap() hands over (BGRA, alpha last). What's worth
// pinning is what the palette is FOR: the chosen colour has to come from the
// image, a vivid colour has to beat the wall of background it sits on, dark
// and light swatches have to land on their own sides of the lightness range,
// and a cover with nothing usable in it has to say so rather than invent a
// colour.

import { extractSwatches } from '../src/main/swatches';
import { check, done } from './assert';
import type { RGB } from '../src/shared/types';

/** Builds a BGRA buffer from a list of [colour, pixel count] pairs. */
function bitmap(...blocks: [RGB, number][]): Uint8Array {
  const total = blocks.reduce((n, [, count]) => n + count, 0);
  const out = new Uint8Array(total * 4);
  let i = 0;
  for (const [rgb, count] of blocks) {
    for (let n = 0; n < count; n++) {
      out[i++] = rgb.b;
      out[i++] = rgb.g;
      out[i++] = rgb.r;
      out[i++] = 255;
    }
  }
  return out;
}

function near(a: RGB | undefined, b: RGB, tolerance = 8): boolean {
  if (!a) return false;
  return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;
}

function show(rgb: RGB | undefined): string {
  return rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : 'none';
}

// A vivid accent on a big flat grey field — the shape of most album art, and
// the case population-only picking gets wrong.
{
  const orange: RGB = { r: 232, g: 116, b: 34 };
  const grey: RGB = { r: 128, g: 128, b: 128 };
  const swatches = extractSwatches(bitmap([grey, 9000], [orange, 1000]));
  check('a vivid accent beats a flat background 9x its size', near(swatches.Vibrant, orange), show(swatches.Vibrant));
  check('the muted swatch is the background it sits on', near(swatches.Muted, grey), show(swatches.Muted));
}

// Light and dark variants of one hue have to sort themselves onto the right
// sides — this is what the fullscreen backdrop and the lyric colour read.
{
  const midBlue: RGB = { r: 40, g: 110, b: 220 };
  const darkBlue: RGB = { r: 16, g: 42, b: 86 };
  const lightBlue: RGB = { r: 150, g: 195, b: 245 };
  const swatches = extractSwatches(bitmap([midBlue, 400], [darkBlue, 400], [lightBlue, 400]));
  check('dark variant lands in DarkVibrant', near(swatches.DarkVibrant, darkBlue), show(swatches.DarkVibrant));
  check('light variant lands in LightVibrant', near(swatches.LightVibrant, lightBlue), show(swatches.LightVibrant));
  check('mid variant lands in Vibrant', near(swatches.Vibrant, midBlue), show(swatches.Vibrant));
  check(
    'no colour is handed back under two names',
    new Set(Object.values(swatches).map(show)).size === Object.values(swatches).length,
    Object.entries(swatches).map(([k, v]) => `${k}=${show(v)}`).join(' ')
  );
}

// Every returned colour must actually appear in the image. A quantiser that
// returns a bucket CENTRE instead of the bucket's mean drifts off the artwork,
// which is how a palette starts looking like it belongs to a different album.
{
  const teal: RGB = { r: 22, g: 160, b: 158 };
  const swatches = extractSwatches(bitmap([teal, 500], [{ r: 30, g: 30, b: 40 }, 500]));
  check('the extracted colour is the colour in the image', near(swatches.Vibrant, teal, 2), show(swatches.Vibrant));
}

// A pure white sleeve and a black one are both "no usable colour" — and the
// caller's fallback only runs if this says nothing rather than guessing.
{
  const white = extractSwatches(bitmap([{ r: 255, g: 255, b: 255 }, 1000]));
  check('an all-white image yields no swatches', Object.keys(white).length === 0, JSON.stringify(white));

  const black = extractSwatches(bitmap([{ r: 0, g: 0, b: 0 }, 1000]));
  check('an all-black image yields no swatches', Object.keys(black).length === 0, JSON.stringify(black));

  check('an empty buffer yields no swatches', Object.keys(extractSwatches(new Uint8Array(0))).length === 0);
}

// Transparent pixels are whatever is behind them, not part of the artwork.
{
  const red: RGB = { r: 200, g: 40, b: 40 };
  const pixels = bitmap([{ r: 20, g: 220, b: 40 }, 4000], [red, 200]);
  for (let i = 0; i < 4000 * 4; i += 4) pixels[i + 3] = 0; // green field fully transparent
  const swatches = extractSwatches(pixels);
  check('transparent pixels do not vote', near(swatches.Vibrant, red), show(swatches.Vibrant));
}

// The BGRA assumption is load-bearing: read as RGBA, every palette comes back
// with red and blue swapped, and nothing in the UI would look obviously broken
// — just wrong.
{
  const rgba = new Uint8Array([200, 40, 40, 255, 200, 40, 40, 255]);
  const asRgba = extractSwatches(rgba, false);
  check('channel order is selectable for RGBA input', near(asRgba.Vibrant, { r: 200, g: 40, b: 40 }), show(asRgba.Vibrant));
  const asBgra = extractSwatches(rgba, true);
  check('the same buffer read as BGRA gives the mirrored colour', near(asBgra.Vibrant, { r: 40, g: 40, b: 200 }), show(asBgra.Vibrant));
}

done();
