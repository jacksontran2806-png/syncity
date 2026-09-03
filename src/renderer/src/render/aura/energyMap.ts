// Aura: ripples-on-water. Crests visibly travel around the perimeter rather
// than forming and dissolving in place — see waves.ts for why that's the whole
// point of the mode.

import { buildRoundedRectRig, roundedRectPerimeter } from '../shared/rig';
import { catmullRomResample } from '../shared/spline';
import { lerpRgb } from '../shared/palette';
import { maxWaveAmplitude, waveBrightness, waveOffset, type WaveParams } from './waves';
import type { FrameCtx, ModeRenderer } from '../shared/types';

/** Rig step. Denser than the shortest wavelength so crests are resolved. */
const RIG_SPACING_PX = 9;
/** Spline subdivisions per rig step — smooths the polyline into a curve. */
const SUBDIV = 2;
const CORNER_RADIUS_MUL = 1.2;
const CORNER_RADIUS_MIN = 20;
/** How far in the wave's resting line sits, as a fraction of peak wave height.
 *  0 = resting line exactly on the screen edge (half of every wave clipped);
 *  1 = no crest ever clips, but a permanent gap between glow and edge. */
const EDGE_HUG = 0.35;

/** A bass hit is a wave CRASHING against the edge, not a slow swell: snap up,
 *  ease back down. */
const CRASH_ATTACK_MS = 80;
const CRASH_RELEASE_MS = 300;
const CRASH_GAIN = 1.4; // peak multiplier on the largest harmonic

interface AuraPoint extends Record<string, number> {
  x: number;
  y: number;
  brightness: number;
}

export function createAuraRenderer(): ModeRenderer {
  let crash = 1;

  return {
    reset() {
      crash = 1;
    },

    draw(ctx, f: FrameCtx) {
      const { w, h, dtMs, timeSec, audio, palette, settings } = f;

      // asymmetric envelope on the crash multiplier
      const targetCrash = 1 + audio * CRASH_GAIN;
      const tau = targetCrash > crash ? CRASH_ATTACK_MS : CRASH_RELEASE_MS;
      crash += (targetCrash - crash) * (1 - Math.exp(-dtMs / tau));

      const params: WaveParams = {
        waveCount: settings.auraWaveCount,
        waveHeight: settings.auraWaveHeight,
        waveSpeed: settings.auraWaveSpeed,
        rippleDetail: settings.auraRippleDetail,
        crash,
      };

      const radius = Math.max(CORNER_RADIUS_MIN, settings.thickness * CORNER_RADIUS_MUL);
      const maxAmp = maxWaveAmplitude(params);
      // Inset by a FRACTION of the peak excursion, not the whole thing.
      // Insetting by maxAmp keeps every crest on screen, but it also parks the
      // wave's resting line ~25px in and its troughs ~50px in — a permanent
      // margin between the aura and the screen edge, which is the opposite of
      // what an edge-hugging ambient glow is for. At this fraction the band
      // hugs the edge and the tallest crests clip off it, which is what a wave
      // breaking against the border should look like anyway.
      const inset = maxAmp * EDGE_HUG;
      const rig = buildRoundedRectRig(w, h, inset, radius, RIG_SPACING_PX);
      if (rig.length < 4) return;
      const perimeter = roundedRectPerimeter(w, h, inset, radius);

      const displaced: AuraPoint[] = rig.map((p) => {
        const offset = waveOffset(p.arcLen, perimeter, timeSec, params);
        return {
          x: p.x + p.nx * offset,
          y: p.y + p.ny * offset,
          brightness: waveBrightness(offset, maxAmp),
        };
      });

      const pts = catmullRomResample(displaced, SUBDIV);

      // Canvas 2D can't vary width or color within one stroke(), so the body is
      // rasterized as short per-pair segments into the energy map. This runs
      // ONCE — the bloom/mid/core stack is applied afterwards by
      // compositeGlow() over the finished bitmap, not by re-stroking.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        const br = Math.max(0, Math.min(1, (a.brightness + b.brightness) / 2));
        const c = lerpRgb(palette.secondary, palette.primary, br);
        ctx.globalAlpha = 0.3 + br * 0.7;
        ctx.strokeStyle = `rgb(${c.r | 0}, ${c.g | 0}, ${c.b | 0})`;
        ctx.lineWidth = settings.thickness * (0.5 + br * 0.9);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };
}
