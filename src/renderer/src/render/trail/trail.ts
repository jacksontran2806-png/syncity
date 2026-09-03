// Trail: a directed beam of energy that whips around the screen perimeter.
//
// Geometry comes from shared/rig.ts, so the path is one continuous
// arc-length-parameterized loop and a corner is never a special case. The
// spring chain is solved in ARC-LENGTH space rather than xy — a chord drawn
// between two xy points would cut a corner off, an interpolated arc value
// always lands back on the path.
//
// TARGET SILHOUETTE: one bright head, a long smooth fade, then nothing —
// roughly 5-15% of the perimeter lit at once, not a roughly-even-brightness
// body. The physics below (spring-chain lag + steep alpha/width falloff) is
// what produces that silhouette; a simpler backward-distance sample
// (`opacity = pow(1 - i/N, 2.5)` walking back from the head at fixed steps)
// would draw the identical target curve with none of the lag, and is the
// reference to compare against if this ever drifts — tune FOLLOW_FACTOR,
// TAPER_EXP and ALPHA_EXP to close the gap, don't replace the spring chain.
// The lag is what makes it read as alive; the sample is only the shape check.

import { pointOnRoundedRect, roundedRectPerimeter } from '../shared/rig';
import { noise2D } from '../shared/noise';
import { lerpRgb } from '../shared/palette';
import { autoTrailLengthPct } from '@shared/types';
import type { FrameCtx, ModeRenderer } from '../shared/types';

/** Chain nodes. Physics only — never drawn directly. */
const NODE_COUNT = 32;
/** Points actually rasterized. ~11px apart on 1080p, so a corner arc gets ~5. */
const RENDER_SAMPLES = 240;
/** point[i] eases toward where point[i-1] was last frame. 0.25-0.4 = alive. */
const FOLLOW_FACTOR = 0.32;
/** Smoothing toward the bass-driven target speed. Prevents frame-to-frame snap. */
const SPEED_LERP = 0.08;
/** Width falloff. >1 tapers to a fine point fast — beam, not worm. */
const TAPER_EXP = 2.2;
/** Brightness falloff head -> tail. Steep: one bright head, a long soft fade,
 *  then nothing — not a roughly-even body that merely tapers at the ends.
 *  2.5 matches the reference backward-sampled fade (see module comment). */
const ALPHA_EXP = 2.5;
/** How white the head burns out. */
const HEAD_WHITE = 0.85;
/** Residual perpendicular wobble on mid-body only, in px. Deliberately tiny. */
const WOBBLE_PX = 1;
const WOBBLE_PERIOD_S = 0.26;
const CORNER_RADIUS_MUL = 1.2;
const CORNER_RADIUS_MIN = 20;

/** Exported so the target-silhouette curve is testable against the actual
 *  production exponents rather than a reimplementation of the magic numbers
 *  (see tests/trail.test.ts). t=0 at the head, t=1 at the tail end. */
export function trailAlpha(t: number): number {
  return Math.pow(1 - t, ALPHA_EXP);
}
export function trailWidthFactor(t: number): number {
  return Math.pow(1 - t, TAPER_EXP);
}

function catmullRom1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Normalizes a per-frame lerp factor authored at 60fps to the real delta. */
function frameLerp(factor: number, dtMs: number): number {
  return 1 - Math.pow(1 - factor, dtMs / 16.67);
}

export function createTrailRenderer(): ModeRenderer {
  let arcs: number[] | null = null;
  let prev: number[] = [];
  let head = 0;
  let currentSpeed = 0;

  return {
    reset() {
      arcs = null;
      head = 0;
      currentSpeed = 0;
    },

    draw(ctx, f: FrameCtx) {
      const { w, h, dtMs, timeSec, audio, palette, settings } = f;
      const radius = Math.max(CORNER_RADIUS_MIN, settings.thickness * CORNER_RADIUS_MUL);
      const perim = roundedRectPerimeter(w, h, 0, radius);
      if (perim <= 0) return;

      // --- speed: reactive to bass, smoothed, and hard-capped ---
      const base = settings.trailSpeed;
      const target = base * (1 + audio * settings.trailSpeedReactivity);
      const capped = Math.min(target, base * settings.trailMaxSpeedMultiplier);
      if (currentSpeed === 0) currentSpeed = capped;
      currentSpeed += (capped - currentSpeed) * frameLerp(SPEED_LERP, dtMs);
      head += currentSpeed * (dtMs / 1000);

      const lengthPct = settings.trailLengthPct ?? autoTrailLengthPct(w, h);
      const lengthPx = perim * (lengthPct / 100);
      const spacing = lengthPx / (NODE_COUNT - 1);

      // --- spring chain: each node eases toward where the one ahead of it was
      //     last frame. That lag is what reads as alive rather than a rigid
      //     dash sliding at uniform speed. ---
      if (!arcs || arcs.length !== NODE_COUNT) {
        arcs = Array.from({ length: NODE_COUNT }, (_, i) => head - i * spacing);
      }
      prev = arcs.slice();
      const k = frameLerp(FOLLOW_FACTOR, dtMs);
      arcs[0] = head;
      for (let i = 1; i < NODE_COUNT; i++) {
        const want = prev[i - 1]! - spacing;
        arcs[i] = arcs[i]! + (want - arcs[i]!) * k;
        if (arcs[i]! > arcs[i - 1]!) arcs[i] = arcs[i - 1]!; // never overtake
      }

      // Keep arc values bounded so long sessions don't lose float precision.
      if (head > perim) {
        head -= perim;
        for (let i = 0; i < NODE_COUNT; i++) arcs[i] = arcs[i]! - perim;
      }

      // --- rasterize the energy map ---
      const baseWidth = Math.max(2, settings.thickness * (0.5 + audio * 0.5));
      const at = (i: number) => arcs![Math.min(NODE_COUNT - 1, Math.max(0, i))]!;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let px = 0;
      let py = 0;
      for (let j = 0; j < RENDER_SAMPLES; j++) {
        const t = j / (RENDER_SAMPLES - 1); // 0 = head, 1 = tail
        const g = t * (NODE_COUNT - 1);
        const i = Math.min(NODE_COUNT - 2, Math.floor(g));
        const u = g - i;
        const arc = catmullRom1D(at(i - 1), at(i), at(i + 1), at(i + 2), u);
        const s = ((arc % perim) + perim) % perim;
        const p = pointOnRoundedRect(w, h, 0, radius, s);

        // Living skin: the same 2-octave displacement Aura uses, windowed to
        // the visible body and at roughly a third the amplitude — enough to
        // stop the edges reading as a perfectly uniform ribbon, not enough to
        // turn a directed beam into an Aura ring.
        const o1 = noise2D(s * 0.02, timeSec * 0.08) * settings.trailTextureAmp1;
        const o2 = noise2D(s * 0.1, timeSec * 0.25) * settings.trailTextureAmp2;
        // wobble on mid-body only, faded out at both ends
        const midWindow = Math.sin(Math.PI * t);
        const wob = WOBBLE_PX * midWindow * Math.sin(timeSec / WOBBLE_PERIOD_S + g * 0.55);
        const off = (o1 + o2) * midWindow + wob;

        const x = p.x + p.nx * off;
        const y = p.y + p.ny * off;

        if (j > 0) {
          const fall = trailWidthFactor(t);
          const alpha = trailAlpha(t) * (0.85 + 0.15 * (o2 / (settings.trailTextureAmp2 || 1)));
          if (alpha > 0.004) {
            const body = lerpRgb(palette.primary, palette.secondary, t);
            const white = HEAD_WHITE * Math.pow(1 - t, 3);
            const c = lerpRgb(body, { r: 255, g: 255, b: 255 }, white);
            ctx.strokeStyle = `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${Math.min(1, alpha)})`;
            ctx.lineWidth = Math.max(0.6, baseWidth * fall);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
        px = x;
        py = y;
      }
    },
  };
}
