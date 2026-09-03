// Lava: 3-5 soft blobs drifting on noise, merged through a gooey filter chain
// so they fuse into one membrane when close and separate cleanly when apart.
//
// The goo is the classic blur -> alpha-contrast threshold, done here as a
// canvas filter chain (`blur() contrast()`) against an opaque black backing.
// Black contributes nothing under compositeGlow's additive 'lighter' pass, so
// the backing disappears in the final image while still giving contrast()
// something solid to threshold against.

import { noise2D, noise2Db } from '../shared/noise';
import { lerpRgb, rgbaStr } from '../shared/palette';
import type { FrameCtx, ModeRenderer } from '../shared/types';

const BLOB_COUNT = 4;
/** Full-range traversal every 30-50s: slow, organic, non-repeating. */
const DRIFT_SPEED = 0.028;
const BLOB_RADIUS_FRAC = 0.26; // of min(w,h)
const AUDIO_RADIUS_GAIN = 0.22; // gentle pulse — lava lamps don't snap to a beat
const AUDIO_DRIFT_GAIN = 0.25;
const GOO_BLUR_PX = 26;
const GOO_CONTRAST = 18;

export function createLavaRenderer(): ModeRenderer {
  // Blobs are drawn crisp here first, then thresholded into the energy map.
  const scratch = document.createElement('canvas');
  let driftT = 0;

  return {
    reset() {
      driftT = 0;
    },

    draw(ctx, f: FrameCtx) {
      const { w, h, dtMs, audio, palette } = f;
      const cw = ctx.canvas.width;
      const ch = ctx.canvas.height;
      if (scratch.width !== cw || scratch.height !== ch) {
        scratch.width = cw;
        scratch.height = ch;
      }
      const sctx = scratch.getContext('2d');
      if (!sctx) return;

      driftT += (dtMs / 1000) * DRIFT_SPEED * (1 + audio * AUDIO_DRIFT_GAIN);

      // opaque black backing: contrast() needs something solid to bite on, and
      // black adds nothing under the additive composite afterwards
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = 'source-over';
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, cw, ch);

      const scale = cw / Math.max(1, w);
      sctx.setTransform(scale, 0, 0, scale, 0, 0);
      sctx.globalCompositeOperation = 'lighter';

      const baseR = Math.min(w, h) * BLOB_RADIUS_FRAC;
      for (let i = 0; i < BLOB_COUNT; i++) {
        // separate noise fields per axis so the path is a wander, not a line
        const nx = noise2D(i * 12.3, driftT);
        const ny = noise2Db(i * 7.1, driftT);
        const x = w * (0.5 + nx * 0.42);
        const y = h * (0.5 + ny * 0.42);
        const r = baseR * (0.75 + 0.25 * noise2D(i * 3.7, driftT * 2)) * (1 + audio * AUDIO_RADIUS_GAIN);

        const tint = lerpRgb(palette.primary, palette.secondary, i / Math.max(1, BLOB_COUNT - 1));
        const grad = sctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, rgbaStr(tint, 1));
        grad.addColorStop(0.55, rgbaStr(tint, 0.6));
        grad.addColorStop(1, rgbaStr(tint, 0));
        sctx.fillStyle = grad;
        sctx.beginPath();
        sctx.arc(x, y, r, 0, Math.PI * 2);
        sctx.fill();
      }

      // blur + hard contrast = the membrane. Overlapping blobs blur into each
      // other before the threshold, so they come out as one shape; separated
      // ones threshold back into distinct shapes with clean edges.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = `blur(${GOO_BLUR_PX * scale}px) contrast(${GOO_CONTRAST})`;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      ctx.filter = 'none';
    },
  };
}
