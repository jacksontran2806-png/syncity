// Aura's displacement field: traveling waves, not local noise bulges.
//
// The distinction that matters: noise bulges appear and dissipate wherever the
// field happens to peak, which reads as directionless flicker. A sine with a
// moving phase has a crest that physically travels — form one, watch it go
// round the loop. That's what makes this read as water rather than flame.
//
// Frequencies are INTEGER multiples of the loop, so the wave meets itself
// exactly at the s=0 / s=perimeter join with no seam.

import { noise2D } from '../shared/noise';

/** Base harmonics. Scaled by the Wave count setting, kept integer. */
export const BASE_FREQS = [3, 5, 8] as const;
/** Relative heights of the three harmonics (scaled by the Wave height setting). */
export const BASE_AMPS = [14, 7, 3] as const;
/** Different phase speeds so the layers drift against each other — without
 *  this the three lock together and the whole thing loops like a GIF. */
export const BASE_SPEEDS = [0.6, 1.1, 1.8] as const;

/** Fixed once at startup, not per frame: the pattern differs between launches
 *  but stays coherent within a session. */
const PHASES = [0, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2];

const TAU = Math.PI * 2;
/** Radius of the circle the ripple noise is sampled around. Bigger = more
 *  ripple detail per lap. */
const NOISE_RADIUS = 3.5;

export interface WaveParams {
  /** Integer multiplier on the base frequencies. Higher = more crests. */
  waveCount: number;
  /** Scales all three amplitudes together. */
  waveHeight: number;
  /** Scales all three phase speeds together. */
  waveSpeed: number;
  /** Low-amplitude noise on top, purely to break up the sine regularity.
   *  0 = pure sine. This is seasoning — the waves must still read as
   *  directional with it turned up. */
  rippleDetail: number;
  /** Bass crash multiplier applied to the first (largest) harmonic only. */
  crash: number;
}

/** Signed offset, in px, to push a rig point along its outward normal. */
export function waveOffset(arcLen: number, perimeter: number, t: number, p: WaveParams): number {
  const u = perimeter > 0 ? arcLen / perimeter : 0; // 0..1 around the loop
  const count = Math.max(1, Math.round(p.waveCount));

  let sum = 0;
  for (let i = 0; i < BASE_FREQS.length; i++) {
    const amp = BASE_AMPS[i]! * p.waveHeight * (i === 0 ? p.crash : 1);
    sum += Math.sin(u * TAU * (BASE_FREQS[i]! * count) - t * BASE_SPEEDS[i]! * p.waveSpeed + PHASES[i]!) * amp;
  }

  // The noise layer has to close on itself too, or it reintroduces exactly the
  // seam the integer frequencies were chosen to avoid. Sampling it around a
  // CIRCLE in noise space means s=0 and s=perimeter land on the same point by
  // construction; drifting the circle's centre over time animates it.
  if (p.rippleDetail > 0) {
    const theta = u * TAU;
    sum += noise2D(Math.cos(theta) * NOISE_RADIUS + t * 0.35, Math.sin(theta) * NOISE_RADIUS) * p.rippleDetail;
  }
  return sum;
}

/** Peak possible excursion — used to inset the rig so a crest can swing
 *  outward without being clipped off the screen edge. */
export function maxWaveAmplitude(p: WaveParams): number {
  return (
    BASE_AMPS.reduce((s, a, i) => s + a * p.waveHeight * (i === 0 ? p.crash : 1), 0) + p.rippleDetail
  );
}

/** Normalizes an offset to 0..1 for the brightness ramp: crest bright, trough dim. */
export function waveBrightness(offset: number, maxAmp: number): number {
  if (maxAmp <= 0) return 0.5;
  return Math.max(0, Math.min(1, (offset + maxAmp) / (2 * maxAmp)));
}
