// Verifies the trail's target silhouette from the Master Build Prompt's
// "explicit distance-based trail with backward-sampled fade" section:
// only ~5-15% of the perimeter lit at once, steep bright-head/long-fade
// falloff rather than a roughly-even-brightness body.

import { trailAlpha, trailWidthFactor } from '../src/renderer/src/render/trail/trail';
import { autoTrailLengthPct } from '../src/shared/types';
import { check, done } from './assert';

// --- length: the auto default must land in the 5-15% band, on any display ---
for (const [w, h] of [
  [1920, 1080],
  [2560, 1440],
  [1280, 800],
  [3440, 1440], // ultrawide
  [1080, 1920], // portrait
] as const) {
  const pct = autoTrailLengthPct(w, h);
  check(
    `auto length is 5-15% of the perimeter at ${w}x${h}`,
    pct >= 5 && pct <= 15,
    `got ${pct}%`
  );
}

// --- falloff: most of the body must be dim, not evenly bright ---
// "Roughly even brightness" would mean alpha stays close to 1 for most of t.
// The steep target curve should already be under half brightness by the
// midpoint of the visible segment.
const midAlpha = trailAlpha(0.5);
check('alpha has fallen well below half brightness by the midpoint', midAlpha < 0.2, `alpha(0.5)=${midAlpha.toFixed(3)}`);

// Fraction of the sampled length that's still "bright" (>0.5 alpha) should be
// small — a bright head, not a bright body.
const N = 1000;
let brightSamples = 0;
for (let i = 0; i < N; i++) {
  if (trailAlpha(i / N) > 0.5) brightSamples++;
}
const brightFrac = brightSamples / N;
check('only a small leading fraction is above half brightness', brightFrac < 0.25, `${(brightFrac * 100).toFixed(1)}% of the segment`);

// Head must be full brightness, tail must approach zero — otherwise this
// isn't a fade to "then nothing".
check('head is full brightness', Math.abs(trailAlpha(0) - 1) < 1e-9, `alpha(0)=${trailAlpha(0)}`);
check('tail end is near zero', trailAlpha(1) < 0.01, `alpha(1)=${trailAlpha(1)}`);

// Monotonically decreasing — no bump partway down the tail.
let monotonic = true;
let prev = trailAlpha(0);
for (let i = 1; i <= N; i++) {
  const a = trailAlpha(i / N);
  if (a > prev + 1e-9) monotonic = false;
  prev = a;
}
check('falloff is monotonic (no brightness bump mid-tail)', monotonic);

// --- width taper: same shape check, independently tunable exponent ---
check('width taper also front-loads at the head', trailWidthFactor(0.5) < 0.3, `width(0.5)=${trailWidthFactor(0.5).toFixed(3)}`);
check('width reaches a fine point by the tail', trailWidthFactor(1) < 0.01, `width(1)=${trailWidthFactor(1)}`);

done();
