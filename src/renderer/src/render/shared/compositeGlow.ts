// One crisp rasterized "energy map" -> three additive blurred passes.
//
// Every mode draws its shape ONCE into an offscreen energy canvas, then hands
// it here. Nothing re-strokes its geometry three times: the bloom/mid/core
// stack is three drawImage calls over the same bitmap.

export interface GlowStackLayer {
  blur: number;
  alpha: number;
}

export const GLOW_STACK: GlowStackLayer[] = [
  { blur: 50, alpha: 0.35 }, // bloom
  { blur: 18, alpha: 0.55 }, // mid
  { blur: 2, alpha: 1.0 }, // core
];

export function compositeGlow(
  ctx: CanvasRenderingContext2D,
  energy: HTMLCanvasElement,
  stack: GlowStackLayer[] = GLOW_STACK,
  scale = 1
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const layer of stack) {
    ctx.filter = `blur(${layer.blur * scale}px)`;
    ctx.globalAlpha = layer.alpha;
    ctx.drawImage(energy, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.restore();
  ctx.filter = 'none';
}
