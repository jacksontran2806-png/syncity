// Opt-in draw profiling. Off by default (zero cost); switch on from devtools
// with:  localStorage.setItem('lyriglow:profile', '1')  and reload.
//
// Exists because "is this mode silently re-stroking its geometry three times?"
// is a question that should be answered by a counter, not by reading the code
// and hoping.

export interface ProfileStats {
  strokes: number;
  drawMs: number;
}

export function profilingEnabled(): boolean {
  try {
    return localStorage.getItem('lyriglow:profile') === '1';
  } catch {
    return false;
  }
}

/** Wraps a 2D context so stroke()/fill() calls are counted. Returns the same
 *  context object when profiling is off. */
export function countingContext(
  ctx: CanvasRenderingContext2D,
  stats: ProfileStats
): CanvasRenderingContext2D {
  const originalStroke = ctx.stroke.bind(ctx);
  const patched = ctx as CanvasRenderingContext2D & { __lyriglowCounted?: boolean };
  if (patched.__lyriglowCounted) return ctx;
  patched.__lyriglowCounted = true;
  ctx.stroke = ((...args: unknown[]) => {
    stats.strokes++;
    return (originalStroke as (...a: unknown[]) => void)(...args);
  }) as typeof ctx.stroke;
  return ctx;
}

/** Logs once a second: strokes per frame and ms spent in the mode's draw().
 *  A number that jumps 3x when nothing visual changed means work is being
 *  duplicated somewhere. */
export function createProfileReporter(label: string) {
  let acc = { strokes: 0, drawMs: 0, frames: 0 };
  let lastReport = performance.now();

  return (stats: ProfileStats, now: number): void => {
    acc.strokes += stats.strokes;
    acc.drawMs += stats.drawMs;
    acc.frames++;
    if (now - lastReport < 1000) return;
    const f = Math.max(1, acc.frames);
    console.info(
      `[profile:${label}] ${(acc.strokes / f).toFixed(0)} stroke()/frame, ` +
        `${(acc.drawMs / f).toFixed(2)}ms draw/frame, ${f} fps`
    );
    acc = { strokes: 0, drawMs: 0, frames: 0 };
    lastReport = now;
  };
}
