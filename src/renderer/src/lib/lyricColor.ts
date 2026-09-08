// Lyric text colour, chosen FROM the album artwork rather than against it.
//
// WHAT THIS REPLACED, AND WHY: the old rule was one line of colour theory —
// take the background hue, spin it 150° (split-complementary), clamp the
// lightness until it cleared WCAG AA. It was defensible on paper and bad on
// screen. A rotation that large lands on a hue the artwork does not contain,
// so on a purple cover the lyrics came out acid green; the clamp then pushed
// that hue to whatever lightness contrast demanded, which is how a "colour
// theory" rule produces neon. Worse, it was the SAME transform every time:
// every album got the same relationship, so nothing ever looked chosen for
// the record it was sitting on.
//
// THE MODEL HERE: the artwork is the source of the colour language, not the
// adversary. Generate a spread of candidates that plausibly belong to this
// cover — its own hues, plus small analogous steps off them, across a range
// of saturations and lightnesses, plus album-tinted near-neutrals — then
// SCORE each one on the four things that actually matter and take the winner:
//
//   harmony     how close it sits to a hue the artwork actually contains
//   contrast    measured, against the real background behind the text
//   saturation  a premium band; neon is penalised outright
//   lightness   light text on a dark cover, deep text on a light one
//
// Because the candidates are built from the palette, different artwork lands
// on genuinely different colours, and because every one of them is scored
// against real contrast maths, none of them is unreadable. Readability is a
// hard gate, not a term: a candidate under WCAG AA cannot win, however
// beautiful it scores everywhere else.

import type { AlbumPalette, RGB } from '@shared/types';
import { clampForContrast, contrastRatio, hslToRgb, relativeLuminance, rgbToHsl } from './colorUtils';

export type LyricsBackground = 'albumCover' | 'clear' | 'albumBlend' | 'custom';

export interface LyricColorChoice {
  /** The text colour to paint. */
  color: RGB;
  /** A subtle shadow when the background can't be trusted to stay put (a
   *  blurred cover is not one flat colour) or when contrast is only just
   *  adequate. Null when the colour carries itself. */
  shadow: string | null;
  /** Measured contrast against the reference background. Diagnostic. */
  contrast: number;
}

/** WCAG AA for body text. A candidate below this cannot be chosen. */
const MIN_CONTRAST = 4.5;
/** Above this, more contrast stops buying legibility and starts costing
 *  character — a 4.6 and a 14.0 are both perfectly readable. */
const COMFORTABLE_CONTRAST = 7.5;
/** Under this, the colour gets a shadow to lean on. */
const SHADOW_BELOW_CONTRAST = 6;

/**
 * The floor when AA is genuinely unreachable.
 *
 * Mid-luminance covers — a mid green especially, where the eye's green
 * weighting puts the background near the middle of the luminance range — leave
 * no room in EITHER direction: white lands around 4.2:1 and a tinted dark
 * around 3.6:1, and only pure black clears 4.5. Taking pure black there is the
 * same failure as taking the complementary hue: technically correct, visually
 * a colour that has nothing to do with the record. So below AA the choice
 * drops to this floor and pays for the difference with a shadow, which is real
 * separation on the actual pixels rather than a number on a flat average.
 */
const RELAXED_CONTRAST = 3.4;

/** How much each palette slot counts as "the album's colour". Primary is what
 *  the cover reads as; tertiary is often an accent from a corner of it. */
const PALETTE_WEIGHTS = [1, 0.72, 0.5];

/** Below this saturation a colour has no meaningful hue, so hue-matching it
 *  against the artwork says nothing. */
const ACHROMATIC_S = 0.08;

/** Analogous steps only. Nothing here goes far enough to leave the artwork's
 *  own region of the wheel — that's the entire difference from the old
 *  split-complementary rule. */
const HUE_OFFSETS = [0, -14, 14, -27, 27];

/** Candidate saturations. Tops out well short of neon; the scorer prefers the
 *  middle of this range and punishes anything past it. */
const SAT_TARGETS = [0.08, 0.16, 0.26, 0.38, 0.5];

/** Candidate lightnesses, both directions. Which end is appropriate is not
 *  decided here — contrast and the lightness score settle it, so a light
 *  cover gets deep text without a separate code path.
 *
 *  The deep end runs down to 0.06 on purpose. A mid-luminance background (an
 *  olive, a mid green) needs a genuinely deep colour to clear AA, and if the
 *  ladder stops at 0.14 the only thing that clears it is pure black — the
 *  ladder's floor is what decides whether such a cover gets a deep forest
 *  green or an unrelated black. The lightness score still penalises the
 *  extremes, so these rungs only win when they are the ones that work. */
const LIGHT_TARGETS = [0.06, 0.1, 0.14, 0.22, 0.3, 0.68, 0.76, 0.84, 0.9, 0.95];

/** Bell curve, for "prefer values near this, fall off smoothly either side"
 *  scoring. Nothing is a cliff — a candidate slightly off-target should lose
 *  slightly, not be eliminated. */
function bell(value: number, target: number, spread: number): number {
  const d = value - target;
  return Math.exp(-(d * d) / (2 * spread * spread));
}

/** Shortest distance between two hues, in degrees (0-180). */
function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function paletteColors(palette: AlbumPalette): RGB[] {
  return [palette.primary, palette.secondary, palette.tertiary];
}

/**
 * The colour actually behind the lyrics in Transparent mode.
 *
 * The backdrop is the cover blurred by 50px under a 25% black scrim
 * (album.css .album-backdrop-media / -scrim). A 50px blur is an average, so
 * the palette mixed by prominence is a far better estimate of it than any
 * single swatch — and it is nothing like the near-black the old code measured
 * against, which is how a bright cover ended up with lyrics that passed a
 * contrast check on paper and were unreadable on screen.
 */
export function blurredBackdropRgb(palette: AlbumPalette): RGB {
  const colors = paletteColors(palette);
  const total = PALETTE_WEIGHTS.reduce((a, b) => a + b, 0);
  const mix = (channel: 'r' | 'g' | 'b'): number =>
    colors.reduce((sum, c, i) => sum + c[channel] * PALETTE_WEIGHTS[i]!, 0) / total;
  // The scrim multiplies whatever is under it by (1 - 0.25).
  const SCRIM = 0.75;
  return {
    r: Math.round(mix('r') * SCRIM),
    g: Math.round(mix('g') * SCRIM),
    b: Math.round(mix('b') * SCRIM),
  };
}

/**
 * Harmony: does this colour look like it came off the record?
 *
 * Scored against the nearest palette hue, weighted by that slot's prominence,
 * so matching the cover's dominant colour beats matching a corner accent. A
 * near-neutral candidate scores a flat middling value — an album-tinted white
 * never clashes, but it never sings either, so it should lose to a real
 * palette hue that also satisfies everything else.
 */
function harmonyScore(hue: number, sat: number, palette: AlbumPalette): number {
  if (sat < ACHROMATIC_S) return 0.55;
  const chromatic = paletteColors(palette)
    .map((c, i) => ({ hsl: rgbToHsl(c), weight: PALETTE_WEIGHTS[i]! }))
    .filter((e) => e.hsl.s >= ACHROMATIC_S);
  // A greyscale cover has no hue to harmonise with. Nothing is more "of the
  // artwork" than anything else, so let the other terms decide.
  if (!chromatic.length) return 0.55;
  return Math.max(
    ...chromatic.map((e) => e.weight * bell(hueDelta(hue, e.hsl.h), 0, 30))
  );
}

/** Saturation: a premium band, not a slider. Muted enough to read as
 *  considered, saturated enough to read as coloured at all — and anything
 *  past 0.6 is the neon the old system kept producing. */
function saturationScore(sat: number): number {
  const base = bell(sat, 0.26, 0.17);
  return sat > 0.6 ? base * 0.3 : base;
}

/** Lightness: light text over a dark cover, deep text over a light one, and
 *  a penalty at the very extremes so the answer is a tinted near-white rather
 *  than #fff whenever a tinted one will do. */
function lightnessScore(lightness: number, bgLuminance: number): number {
  const target = bgLuminance < 0.22 ? 0.82 : 0.26;
  const base = bell(lightness, target, 0.24);
  return lightness > 0.96 || lightness < 0.06 ? base * 0.75 : base;
}

/** Contrast: a gate first (below the floor scores nothing), then diminishing
 *  returns — past comfortable, extra contrast is not worth losing a better hue
 *  over, and maximum contrast (pure white or black) is worth slightly less
 *  than a tinted colour that is already perfectly readable. */
function contrastScore(ratio: number, floor: number): number {
  if (ratio < floor) return 0;
  const t = Math.min(1, (ratio - floor) / Math.max(0.5, COMFORTABLE_CONTRAST - floor));
  return ratio > 15 ? t * 0.94 : t;
}

const WEIGHTS = { contrast: 0.4, harmony: 0.3, saturation: 0.17, lightness: 0.13 };

interface Scored {
  color: RGB;
  ratio: number;
  score: number;
}

/** Every colour worth considering for this artwork: each palette hue, stepped
 *  analogously, across the saturation and lightness ranges — plus album-tinted
 *  near-neutrals, which is what wins on a busy or greyscale cover. */
function candidates(palette: AlbumPalette): RGB[] {
  const out: RGB[] = [];
  for (const source of paletteColors(palette)) {
    const { h, s } = rgbToHsl(source);
    for (const offset of HUE_OFFSETS) {
      for (const satTarget of SAT_TARGETS) {
        // Never MORE saturated than the colour it came from: pushing an
        // already-muted cover into vivid text is exactly the "colourful for
        // its own sake" failure this is meant to avoid.
        const sat = Math.min(satTarget, Math.max(s, ACHROMATIC_S));
        for (const l of LIGHT_TARGETS) out.push(hslToRgb(h + offset, sat, l));
      }
    }
  }
  // Album-tinted neutrals: a warm/cool white or ink that still carries the
  // cover's hue. The quiet answer, and often the right one.
  const dominant = rgbToHsl(palette.primary);
  for (const l of [0.12, 0.2, 0.88, 0.94]) out.push(hslToRgb(dominant.h, 0.06, l));
  return out;
}

/**
 * Pick the lyric colour for this artwork and this background.
 *
 * `bg` must be the colour actually behind the text — for Transparent mode
 * that's blurredBackdropRgb(), not the palette's raw primary.
 */
export function paletteLyricColor(
  palette: AlbumPalette,
  bg: RGB,
  mode: LyricsBackground = 'albumBlend'
): LyricColorChoice {
  const bgLuminance = relativeLuminance(bg);
  const pool = candidates(palette);

  /** Scores every candidate against a readability floor. Anything under the
   *  floor scores -1 and cannot win, however good it looks. */
  const scoreAll = (floor: number): Scored[] =>
    pool.map((color) => {
      const { h, s, l } = rgbToHsl(color);
      const ratio = contrastRatio(color, bg);
      const score =
        WEIGHTS.contrast * contrastScore(ratio, floor) +
        WEIGHTS.harmony * harmonyScore(h, s, palette) +
        WEIGHTS.saturation * saturationScore(s) +
        WEIGHTS.lightness * lightnessScore(l, bgLuminance);
      return { color, ratio, score: ratio < floor ? -1 : score };
    });

  const pick = (scored: Scored[]): Scored => scored.reduce((a, b) => (b.score > a.score ? b : a));

  let best = pick(scoreAll(MIN_CONTRAST));
  // Comfortably readable: nothing else to do.
  let compromised = false;

  if (best.score < 0) {
    // No candidate clears AA. Drop to the relaxed floor before giving up on
    // the palette entirely — a tinted colour at 3.6:1 WITH a shadow reads
    // better on a real blurred cover than pure black at 5:1 does.
    compromised = true;
    best = pick(scoreAll(RELAXED_CONTRAST));
  }

  if (best.score < 0) {
    // Even the relaxed floor is out of reach. Keep the most harmonious hue and
    // walk its lightness until it clears — the palette still chooses the
    // colour, contrast maths only decides how deep or pale it ends up.
    const harmonyOf = (c: RGB): number => {
      const { h, s } = rgbToHsl(c);
      return harmonyScore(h, s, palette);
    };
    const mostHarmonious = pool.reduce((a, b) => (harmonyOf(b) > harmonyOf(a) ? b : a));
    const rescued = clampForContrast(mostHarmonious, bg, MIN_CONTRAST);
    best = { color: rescued, ratio: contrastRatio(rescued, bg), score: 0 };
  }

  return {
    color: best.color,
    // Album cover and Clear always get one. Over a blurred cover the measured
    // background is an average, and the real pixels under any given line are
    // lighter or darker than it; over nothing at all the background is
    // whatever the user happens to have on screen, which is unknowable. The
    // shadow is what makes a single colour survive that — the alternative
    // being to jump to the opposite hue the moment contrast gets tight.
    shadow:
      mode === 'albumCover' ||
      mode === 'clear' ||
      compromised ||
      best.ratio < SHADOW_BELOW_CONTRAST
        ? relativeLuminance(best.color) > bgLuminance
          ? '0 1px 14px rgba(0, 0, 0, 0.45)'
          : '0 1px 14px rgba(255, 255, 255, 0.35)'
        : null,
    contrast: best.ratio,
  };
}
