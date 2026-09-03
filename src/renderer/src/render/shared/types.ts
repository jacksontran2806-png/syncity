import type { AppSettings, GlowPalette } from '@shared/types';

export interface FrameCtx {
  w: number;
  h: number;
  /** Frame delta in ms, clamped — every mode integrates with this, never with
   *  a frame count, so speed is framerate-independent. */
  dtMs: number;
  /** Accumulated seconds since the mode started (not Date.now()). */
  timeSec: number;
  /** Smoothed bass envelope, 0..1 (src/renderer/src/audio.ts). */
  audio: number;
  /** Already crossfaded — modes get the live-lerped palette, not the raw one. */
  palette: GlowPalette;
  settings: AppSettings;
}

export interface ModeRenderer {
  /** Draw the crisp energy map. The caller clears the canvas first and runs
   *  compositeGlow() afterwards — modes never blur or stack themselves. */
  draw(energy: CanvasRenderingContext2D, f: FrameCtx): void;
  /** Called on resize / mode switch. */
  reset?(): void;
}
