import { waveOffset, type WaveParams } from '../src/renderer/src/render/aura/waves';
import { estimateSyllables, estimateWordTimings } from '../src/renderer/src/lyricsTiming';
import { check, done } from './assert';


const PERIM = 5946.8;
const p: WaveParams = { waveCount: 1, waveHeight: 1, waveSpeed: 1, rippleDetail: 1.5, crash: 1 };

const N = 1200;
const profile = (t: number) => {
  const out: number[] = [];
  for (let i = 0; i < N; i++) out.push(waveOffset((i / N) * PERIM, PERIM, t, p));
  return out;
};

// --- 1. seamless loop: the wave must meet itself at s=0 / s=perimeter ---
const t0 = 0;
check(
  'no seam at the loop join',
  Math.abs(waveOffset(0, PERIM, t0, p) - waveOffset(PERIM, PERIM, t0, p)) < 0.01,
  `delta=${Math.abs(waveOffset(0, PERIM, t0, p) - waveOffset(PERIM, PERIM, t0, p)).toExponential(2)}`
);

// --- 2. THE wave test: cross-correlate profiles 2s apart. If crests travel,
//        the best-matching shift is nonzero. If they only pulse in place
//        (the old flame behavior), the best shift is 0. ---
const a = profile(0);
const b = profile(2);
let bestShift = 0;
let bestScore = -Infinity;
for (let shift = -N / 2; shift < N / 2; shift++) {
  let dot = 0;
  for (let i = 0; i < N; i++) dot += a[i]! * b[((i + shift) % N + N) % N]!;
  if (dot > bestScore) {
    bestScore = dot;
    bestShift = shift;
  }
}
const shiftPx = (bestShift / N) * PERIM;
check('crests TRAVEL along the perimeter (not static)', Math.abs(shiftPx) > 100, `shift over 2s = ${shiftPx.toFixed(0)}px`);

// expected travel of the dominant harmonic: speed1*t / (2pi*freq1) * perimeter
const expected = ((0.6 * 2) / (Math.PI * 2 * 3)) * PERIM;
check(
  'travel matches the dominant harmonic',
  Math.abs(Math.abs(shiftPx) - expected) < expected * 0.35,
  `measured=${Math.abs(shiftPx).toFixed(0)}px expected~${expected.toFixed(0)}px`
);

// --- 3. not a repeating GIF: layers drift, so the profile at t=0 and one full
//        period of harmonic 1 later is NOT identical ---
const period1 = (Math.PI * 2) / 0.6;
const c = profile(period1);
let maxDiff = 0;
for (let i = 0; i < N; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i]! - c[i]!));
check('layers drift out of sync (no GIF loop)', maxDiff > 1, `maxDiff=${maxDiff.toFixed(2)}px`);

// --- 4. crash: bass spikes amplitude ---
const loud: WaveParams = { ...p, crash: 2.4 };
const quietPeak = Math.max(...a.map(Math.abs));
const loudPeak = Math.max(...profile(0).map((_, i) => Math.abs(waveOffset((i / N) * PERIM, PERIM, 0, loud))));
check('bass crash raises wave height', loudPeak > quietPeak * 1.3, `${quietPeak.toFixed(1)} -> ${loudPeak.toFixed(1)}px`);

// --- 5. syllable weighting beats an even split ---
const syl: [string, number][] = [
  ['through', 1], ['away', 2], ['beautiful', 3], ['I', 1], ['running', 2], ['fire', 1], ['everything', 4],
];
let sylOk = true;
for (const [w, expect] of syl) {
  const got = estimateSyllables(w);
  if (got !== expect) {
    sylOk = false;
    console.log(`      "${w}" -> ${got}, expected ${expect}`);
  }
}
check('syllable estimator', sylOk);

const timings = estimateWordTimings(['I', 'ran', 'through', 'everything'], 1000, 5000);
const durs = timings.map((t) => t.end - t.start);
check('word timings span the whole line', Math.abs(timings[timings.length - 1]!.end - 5000) < 0.001);
check('word timings are contiguous', timings.every((t, i) => i === 0 || Math.abs(t.start - timings[i - 1]!.end) < 1e-9));
check(
  'longer words get more time than short ones',
  durs[3]! > durs[0]! * 2,
  `"I"=${durs[0]!.toFixed(0)}ms "everything"=${durs[3]!.toFixed(0)}ms (even split would be ${(4000 / 4).toFixed(0)}ms each)`
);

done();
