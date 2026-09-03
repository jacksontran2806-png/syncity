import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store';
import { compositeGlow, GLOW_STACK } from '../../render/shared/compositeGlow';
import { crossfadePalette } from '../../render/shared/palette';
import { createTrailRenderer } from '../../render/trail/trail';
import { createAuraRenderer } from '../../render/aura/energyMap';
import { createLavaRenderer } from '../../render/lava/lava';
import { countingContext, createProfileReporter, profilingEnabled } from '../../render/shared/profile';
import type { ModeRenderer } from '../../render/shared/types';
import type { AnimationMode, GlowPalette } from '@shared/types';

/** Above this the blur stack costs more than it looks better. */
const MAX_DPR = 2;
/** Longest frame a mode is told about. A tab stall must not teleport the
 *  animation on the next frame. */
const MAX_FRAME_MS = 50;

export type CanvasMode = Exclude<AnimationMode, 'none'>;

const RENDERERS: Record<CanvasMode, () => ModeRenderer> = {
  trail: createTrailRenderer,
  aura: createAuraRenderer,
  lava: createLavaRenderer,
};

/**
 * Shared driver for every canvas mode.
 *
 * A mode's only job is to rasterize its geometry into the offscreen energy map.
 * Blur, bloom and stacking happen once, here, via compositeGlow — modes never
 * stroke themselves three times, which is what made the corner seams visible
 * back when each one composited on its own.
 */
export function GlowCanvas({ mode }: { mode: CanvasMode }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const energyRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<GlowPalette | null>(null);

  const renderer = useMemo(() => RENDERERS[mode](), [mode]);

  useEffect(() => {
    if (!energyRef.current) energyRef.current = document.createElement('canvas');
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);

    const resize = () => {
      for (const c of [canvasRef.current, energyRef.current]) {
        if (!c) continue;
        c.width = Math.round(window.innerWidth * dpr);
        c.height = Math.round(window.innerHeight * dpr);
      }
      renderer.reset?.();
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    let timeSec = 0;
    const profile = profilingEnabled();
    const report = createProfileReporter(mode);
    const stats = { strokes: 0, drawMs: 0 };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      const main = canvasRef.current;
      const energy = energyRef.current;
      const mctx = main?.getContext('2d');
      const ectx = energy?.getContext('2d');
      if (!main || !energy || !mctx || !ectx) return;

      const dtMs = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      timeSec += dtMs / 1000;

      const state = useStore.getState();
      paletteRef.current = crossfadePalette(paletteRef.current ?? state.palette, state.palette, dtMs);

      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, main.width, main.height);
      ectx.setTransform(1, 0, 0, 1, 0, 0);
      ectx.clearRect(0, 0, energy.width, energy.height);
      // Modes draw in CSS pixels; the DPR scale lives here so no mode has to
      // know about it.
      ectx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const frame = {
        w: window.innerWidth,
        h: window.innerHeight,
        dtMs,
        timeSec,
        audio: state.audioLevel,
        palette: paletteRef.current,
        settings: state.settings,
      };

      if (profile) {
        stats.strokes = 0;
        const t0 = performance.now();
        renderer.draw(countingContext(ectx, stats), frame);
        stats.drawMs = performance.now() - t0;
        report(stats, now);
      } else {
        renderer.draw(ectx, frame);
      }

      compositeGlow(mctx, energy, GLOW_STACK, dpr);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [renderer]);

  return (
    <div className="glow-root">
      <canvas ref={canvasRef} className="glow-canvas" />
    </div>
  );
}
