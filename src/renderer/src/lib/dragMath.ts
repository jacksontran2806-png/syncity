// Pure geometry for DraggableBox, split out so it can be tested without a DOM.

/** Magnetic, not hard-locked: within this many px of an edge or the centre, a
 *  dragged box eases onto it. */
export const SNAP_PX = 20;

export interface DragEnv {
  /** Grab offset — where inside the box the pointer went down. Keeping this
   *  constant is what stops the box teleporting its corner to the cursor. */
  grabX: number;
  grabY: number;
  bw: number;
  bh: number;
  vw: number;
  vh: number;
}

function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(v, Math.max(0, max)));
}

function snap1d(v: number, span: number): number {
  const centre = span / 2;
  if (Math.abs(v) < SNAP_PX) return 0;
  if (Math.abs(v - span) < SNAP_PX) return span;
  if (Math.abs(v - centre) < SNAP_PX) return centre;
  return v;
}

/** Box top-left for a pointer at (clientX, clientY): clamped on-screen, then
 *  snapped to the nearest edge or centre line. */
export function placeBox(clientX: number, clientY: number, env: DragEnv): { x: number; y: number } {
  return {
    x: snap1d(clamp(clientX - env.grabX, env.vw - env.bw), env.vw - env.bw),
    y: snap1d(clamp(clientY - env.grabY, env.vh - env.bh), env.vh - env.bh),
  };
}

/** Committed position -> pixels, clamped: a fraction stored on a wider display
 *  would otherwise park the box off-screen. */
export function resolvePosition(
  xPct: number,
  yPct: number,
  env: { bw: number; bh: number; vw: number; vh: number }
): { x: number; y: number } {
  return {
    x: clamp(xPct * env.vw, env.vw - env.bw),
    y: clamp(yPct * env.vh, env.vh - env.bh),
  };
}
