// Closed-loop Catmull-Rom resampling, run over the FULL loop in one pass.
// Points either side of a corner are ordinary neighbours in the same curve —
// there is no per-edge pass, so no seam and no chord cutting a corner off.

export interface Point2D {
  x: number;
  y: number;
}

function cr(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Any extra numeric fields on the points (brightness, arcLen, …) are carried
 *  through, lerped on the same u, so they stay in sync with x/y. */
export function catmullRomResample<T extends Point2D & Record<string, number>>(
  points: T[],
  subdiv: number
): T[] {
  const n = points.length;
  if (n < 4 || subdiv < 1) return points.slice();

  const extraKeys = Object.keys(points[0]!).filter((k) => k !== 'x' && k !== 'y');
  const at = (i: number) => points[((i % n) + n) % n]!;
  const out: T[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < subdiv; s++) {
      const u = s / subdiv;
      const pt = { x: cr(p0.x, p1.x, p2.x, p3.x, u), y: cr(p0.y, p1.y, p2.y, p3.y, u) } as Record<string, number>;
      for (const k of extraKeys) pt[k] = p1[k]! + (p2[k]! - p1[k]!) * u;
      out.push(pt as T);
    }
  }
  return out;
}
