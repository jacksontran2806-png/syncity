import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { isPageActive, onPageActiveChange } from '../lib/pageActive';

// The pill's "still playing" sliver: a real bar-style spectrum visualizer.
// audio.ts owns capture, decimation into log-spaced bands, and per-band
// attack/decay smoothing — this component only reads the already-settled
// result and draws it, so it stays cheap regardless of how long the pill's
// been sitting there. Colored from the current track's palette instead of a
// fixed gradient.
//
// This is the only consumer of those bars, so it announces itself to the store
// while mounted: useSpectrumCapture starts capture for it and stops when the
// pill goes away. An empty `audioBars` is a normal state, not a failure — it
// means capture is denied, stopped, or not up yet, and the idle animation
// below covers all three.

const BAR_GAP_FRAC = 0.45; // gap as a fraction of one bar's slot width
const IDLE_LERP = 0.05;
/** Frame budget for the idle animation. The idle state is a slow breathing
 *  curve — it is indistinguishable at 20fps, and this is a tray app that can
 *  sit in exactly this state (pill on screen, nothing playing) all day, so the
 *  other 40 frames a second are pure battery. Live audio still draws at full
 *  rate, where the difference is visible. */
const IDLE_FRAME_MS = 1000 / 20;

export function PillWave(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const idleRef = useRef(0);
  const idleBarsRef = useRef<number[] | null>(null);

  useEffect(() => {
    const setSpectrumVisible = useStore.getState().setSpectrumVisible;
    setSpectrumVisible(true);
    return () => setSpectrumVisible(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    let lastIdleMs = 0;

    // Re-measured every frame rather than once-at-mount (+ResizeObserver):
    // the pill's CSS size is static, so it never actually changes after
    // mount — if the very first measurement ever raced ahead of layout and
    // read a 0/tiny box, the canvas would be stuck at that size forever with
    // nothing left to ever fire a resize and correct it. Checking each frame
    // is cheap for a canvas this small and self-heals from that regardless
    // of why the first read was wrong.
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      const live = useStore.getState().audioBars;
      let bars: ArrayLike<number>;
      if (live.length) {
        bars = live;
      } else {
        // No signal reaching the renderer at all (capture denied, stopped
        // because nothing is playing, or just not started yet) — a gentle idle
        // breathing so the pill still reads as "alive" rather than a dead flat
        // row, at a fraction of the frame rate.
        if (now - lastIdleMs < IDLE_FRAME_MS) return;
        // Advance by real elapsed time, not a fixed 1/60 per call: the loop no
        // longer runs at a fixed rate here, and a per-call increment would make
        // the breathing speed depend on the frame budget.
        const dtSec = lastIdleMs ? Math.min(0.25, (now - lastIdleMs) / 1000) : 1 / 60;
        lastIdleMs = now;
        if (!idleBarsRef.current) idleBarsRef.current = new Array(26).fill(0);
        idleRef.current += dtSec;
        const idle = idleBarsRef.current;
        // Lerp per elapsed frame-equivalent rather than per call, so the settle
        // looks the same whether this ran at 20fps or 60.
        const lerp = Math.min(1, IDLE_LERP * dtSec * 60);
        for (let i = 0; i < idle.length; i++) {
          const target = 0.08 + 0.05 * (Math.sin(idleRef.current * 1.4 + i * 0.4) * 0.5 + 0.5);
          idle[i] = idle[i]! + (target - idle[i]!) * lerp;
        }
        bars = idle;
      }

      syncSize();

      const { primary, secondary } = useStore.getState().palette;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, `rgb(${primary.r}, ${primary.g}, ${primary.b})`);
      grad.addColorStop(1, `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`);
      ctx.fillStyle = grad;

      const count = bars.length;
      const slot = w / count;
      const barWidth = Math.max(1, slot * (1 - BAR_GAP_FRAC));
      const mid = h / 2;

      for (let i = 0; i < count; i++) {
        const barH = Math.max(1.5 * dpr, bars[i]! * h);
        const x = i * slot + (slot - barWidth) / 2;
        ctx.fillRect(x, mid - barH / 2, barWidth, barH);
      }
    };
    // Hidden window: stop entirely rather than relying on Chromium to throttle
    // the loop for us, and restart when the overlay is shown again — a loop
    // that only re-arms from inside its own callback would never wake up on
    // its own once frames stopped. See lib/pageActive.
    const start = (): void => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastIdleMs = 0;
    };
    if (isPageActive()) start();
    const offVisible = onPageActiveChange((active) => (active ? start() : stop()));

    return () => {
      offVisible();
      stop();
    };
  }, []);

  return <canvas ref={canvasRef} className="widget-pill-wave" />;
}
