// Shared simplex noise. Aura uses it for its edge displacement, Trail reuses
// the exact same instance for its living-skin texture, and Lava uses it for
// blob drift — one seeded generator, imported everywhere, never re-set-up.

import { createNoise2D } from 'simplex-noise';

function seededRandom(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed seed: the pattern is stable across restarts, so the glow doesn't
 *  look subtly different every launch. */
export const noise2D = createNoise2D(seededRandom(0x10ced));

/** Second, decorrelated field — for anything that needs noise that doesn't
 *  march in lockstep with the first (e.g. a blob's y drift vs its x drift). */
export const noise2Db = createNoise2D(seededRandom(0xbeef));
