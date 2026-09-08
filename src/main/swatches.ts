// Pulls representative colours out of raw pixels.
//
// This replaces node-vibrant, which cost ~3.5 MB of shipped node_modules
// (@jimp, image-q, pngjs, pako, readable-stream, a slice of @babel) to answer
// one question: which three colours does this album cover look like. Nearly all
// of that weight was image DECODING — and Electron already decodes JPEG and PNG
// in Chromium, via nativeImage, so main/color.ts hands the decoded pixels in
// here and this file only has to do the colour part.
//
// The method is node-vibrant's, kept deliberately: a population histogram, then
// a score per named swatch that trades off saturation, lightness and how much
// of the image that colour actually covers. The tuning constants below are its
// published defaults, so palettes stay recognisably the same as before rather
// than becoming a new look nobody asked for.

import type { RGB } from '../shared/types';

/** 5 bits per channel. 32³ = 32,768 buckets: fine enough that two genuinely
 *  different colours rarely collide, coarse enough that near-identical pixels
 *  (JPEG noise, a gradient) pile into one bucket and vote together. */
const BITS = 5;
const SHIFT = 8 - BITS;
const LEVELS = 1 << BITS;

/** Pixels this bright are treated as paper, not colour — a white sleeve or a
 *  blown-out highlight otherwise wins on population alone. */
const WHITE_CUTOFF = 250;
/** Below this the channel ratios are mostly quantisation noise, and every dark
 *  album turns the same muddy near-black. */
const BLACK_CUTOFF = 12;
/** Under half-transparent, the pixel is mostly whatever is behind it. */
const MIN_ALPHA = 128;

const TARGET_DARK_LUMA = 0.26;
const MAX_DARK_LUMA = 0.45;
const MIN_LIGHT_LUMA = 0.55;
const TARGET_LIGHT_LUMA = 0.74;
const MIN_NORMAL_LUMA = 0.3;
const TARGET_NORMAL_LUMA = 0.5;
const MAX_NORMAL_LUMA = 0.7;
const TARGET_MUTED_SATURATION = 0.3;
const MAX_MUTED_SATURATION = 0.4;
const TARGET_VIBRANT_SATURATION = 1.0;
const MIN_VIBRANT_SATURATION = 0.35;

const WEIGHT_SATURATION = 3;
const WEIGHT_LUMA = 6.5;
const WEIGHT_POPULATION = 0.5;

export type SwatchName =
  | 'Vibrant'
  | 'LightVibrant'
  | 'DarkVibrant'
  | 'Muted'
  | 'LightMuted'
  | 'DarkMuted';

export type Swatches = Partial<Record<SwatchName, RGB>>;

interface Target {
  name: SwatchName;
  minSaturation: number;
  targetSaturation: number;
  maxSaturation: number;
  minLuma: number;
  targetLuma: number;
  maxLuma: number;
}

const TARGETS: Target[] = [
  {
    name: 'Vibrant',
    minSaturation: MIN_VIBRANT_SATURATION,
    targetSaturation: TARGET_VIBRANT_SATURATION,
    maxSaturation: 1,
    minLuma: MIN_NORMAL_LUMA,
    targetLuma: TARGET_NORMAL_LUMA,
    maxLuma: MAX_NORMAL_LUMA,
  },
  {
    name: 'LightVibrant',
    minSaturation: MIN_VIBRANT_SATURATION,
    targetSaturation: TARGET_VIBRANT_SATURATION,
    maxSaturation: 1,
    minLuma: MIN_LIGHT_LUMA,
    targetLuma: TARGET_LIGHT_LUMA,
    maxLuma: 1,
  },
  {
    name: 'DarkVibrant',
    minSaturation: MIN_VIBRANT_SATURATION,
    targetSaturation: TARGET_VIBRANT_SATURATION,
    maxSaturation: 1,
    minLuma: 0,
    targetLuma: TARGET_DARK_LUMA,
    maxLuma: MAX_DARK_LUMA,
  },
  {
    name: 'Muted',
    minSaturation: 0,
    targetSaturation: TARGET_MUTED_SATURATION,
    maxSaturation: MAX_MUTED_SATURATION,
    minLuma: MIN_NORMAL_LUMA,
    targetLuma: TARGET_NORMAL_LUMA,
    maxLuma: MAX_NORMAL_LUMA,
  },
  {
    name: 'LightMuted',
    minSaturation: 0,
    targetSaturation: TARGET_MUTED_SATURATION,
    maxSaturation: MAX_MUTED_SATURATION,
    minLuma: MIN_LIGHT_LUMA,
    targetLuma: TARGET_LIGHT_LUMA,
    maxLuma: 1,
  },
  {
    name: 'DarkMuted',
    minSaturation: 0,
    targetSaturation: TARGET_MUTED_SATURATION,
    maxSaturation: MAX_MUTED_SATURATION,
    minLuma: 0,
    targetLuma: TARGET_DARK_LUMA,
    maxLuma: MAX_DARK_LUMA,
  },
];

interface Candidate {
  rgb: RGB;
  population: number;
  saturation: number;
  luma: number;
}

/** Saturation and lightness only — HSL's hue is never scored here, because
 *  "which hue" is exactly the thing the artwork gets to decide. */
function saturationAndLuma(r: number, g: number, b: number): { saturation: number; luma: number } {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const luma = (max + min) / 2;
  if (max === min) return { saturation: 0, luma };
  const d = max - min;
  const saturation = luma > 0.5 ? d / (2 - max - min) : d / (max + min);
  return { saturation, luma };
}

/** 1 for an exact match, 0 for the far end of the range. */
function invertDiff(value: number, target: number): number {
  return 1 - Math.abs(value - target);
}

function score(candidate: Candidate, target: Target, maxPopulation: number): number {
  const saturationScore = invertDiff(candidate.saturation, target.targetSaturation) * WEIGHT_SATURATION;
  const lumaScore = invertDiff(candidate.luma, target.targetLuma) * WEIGHT_LUMA;
  // Population is the tiebreak, not the driver — at full weight the largest
  // flat area always wins and every cover reads as its own background.
  const populationScore = (candidate.population / maxPopulation) * WEIGHT_POPULATION;
  return (
    (saturationScore + lumaScore + populationScore) /
    (WEIGHT_SATURATION + WEIGHT_LUMA + WEIGHT_POPULATION)
  );
}

/**
 * Named swatches for one image.
 *
 * `pixels` is raw 8-bit interleaved samples with alpha last — the layout
 * Electron's nativeImage.getBitmap() returns, which is BGRA, hence
 * `blueFirst` defaulting to true. Any name that finds no colour inside its
 * saturation/lightness window is simply absent, exactly as node-vibrant left
 * them undefined; the caller owns the fallback chain.
 */
export function extractSwatches(pixels: ArrayLike<number>, blueFirst = true): Swatches {
  const counts = new Uint32Array(LEVELS * LEVELS * LEVELS);
  const sums = new Uint32Array(LEVELS * LEVELS * LEVELS * 3);
  const bi = blueFirst ? 0 : 2;
  const ri = blueFirst ? 2 : 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    if (a < MIN_ALPHA) continue;
    const r = pixels[i + ri]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + bi]!;
    if (r > WHITE_CUTOFF && g > WHITE_CUTOFF && b > WHITE_CUTOFF) continue;
    if (r < BLACK_CUTOFF && g < BLACK_CUTOFF && b < BLACK_CUTOFF) continue;

    const key = ((r >> SHIFT) << (BITS * 2)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);
    counts[key]!++;
    sums[key * 3]! += r;
    sums[key * 3 + 1]! += g;
    sums[key * 3 + 2]! += b;
  }

  const candidates: Candidate[] = [];
  let maxPopulation = 0;
  for (let key = 0; key < counts.length; key++) {
    const population = counts[key]!;
    if (!population) continue;
    // The bucket's mean colour, not its centre: a bucket spans 8 values per
    // channel, and the centre would visibly quantise the result.
    const r = Math.round(sums[key * 3]! / population);
    const g = Math.round(sums[key * 3 + 1]! / population);
    const b = Math.round(sums[key * 3 + 2]! / population);
    const { saturation, luma } = saturationAndLuma(r, g, b);
    candidates.push({ rgb: { r, g, b }, population, saturation, luma });
    if (population > maxPopulation) maxPopulation = population;
  }
  if (!candidates.length) return {};

  const swatches: Swatches = {};
  const used = new Set<Candidate>();
  for (const target of TARGETS) {
    let best: Candidate | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      if (used.has(candidate)) continue; // one colour can't stand in for two swatches
      if (candidate.saturation < target.minSaturation || candidate.saturation > target.maxSaturation) continue;
      if (candidate.luma < target.minLuma || candidate.luma > target.maxLuma) continue;
      const value = score(candidate, target, maxPopulation);
      if (!best || value > bestScore) {
        best = candidate;
        bestScore = value;
      }
    }
    if (best) {
      swatches[target.name] = best.rgb;
      used.add(best);
    }
  }
  return swatches;
}
