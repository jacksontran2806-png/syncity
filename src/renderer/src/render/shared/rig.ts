// The single source of truth for the screen-perimeter path.
//
// The whole rounded rect — 4 straight edges AND 4 corner arcs — is one
// continuous arc-length parameterization. Nothing here is split per-edge, and
// no caller should ever build its own path: Trail and Aura both read from
// this module, which is what guarantees a corner is never a special case.

export interface RigPoint {
  x: number;
  y: number;
  /** Outward unit normal: perpendicular to the edge on straights, radial on corner arcs. */
  nx: number;
  ny: number;
  arcLen: number;
}

interface Geom {
  left: number;
  top: number;
  right: number;
  bottom: number;
  r: number;
  straightH: number;
  straightV: number;
  arc: number;
  total: number;
}

function geom(w: number, h: number, inset: number, radius: number): Geom {
  const left = inset;
  const top = inset;
  const right = w - inset;
  const bottom = h - inset;
  const iw = Math.max(0, right - left);
  const ih = Math.max(0, bottom - top);
  const r = Math.max(0, Math.min(radius, iw / 2, ih / 2));
  const straightH = iw - 2 * r;
  const straightV = ih - 2 * r;
  const arc = (Math.PI / 2) * r;
  return { left, top, right, bottom, r, straightH, straightV, arc, total: 2 * straightH + 2 * straightV + 4 * arc };
}

export function roundedRectPerimeter(w: number, h: number, inset: number, radius: number): number {
  return geom(w, h, inset, radius).total;
}

/** Point + outward normal at arc position s. s wraps automatically. */
export function pointOnRoundedRect(
  w: number,
  h: number,
  inset: number,
  radius: number,
  s: number
): RigPoint {
  const g = geom(w, h, inset, radius);
  const total = g.total || 1;
  let rem = ((s % total) + total) % total;
  const arcLen = rem;

  const onArc = (cx: number, cy: number, from: number, u: number): RigPoint => {
    const theta = from + u * (Math.PI / 2);
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);
    return { x: cx + g.r * nx, y: cy + g.r * ny, nx, ny, arcLen };
  };

  // top edge, left -> right
  if (rem <= g.straightH) return { x: g.left + g.r + rem, y: g.top, nx: 0, ny: -1, arcLen };
  rem -= g.straightH;
  // top-right corner
  if (rem <= g.arc) return onArc(g.right - g.r, g.top + g.r, -Math.PI / 2, g.arc ? rem / g.arc : 0);
  rem -= g.arc;
  // right edge, top -> bottom
  if (rem <= g.straightV) return { x: g.right, y: g.top + g.r + rem, nx: 1, ny: 0, arcLen };
  rem -= g.straightV;
  // bottom-right corner
  if (rem <= g.arc) return onArc(g.right - g.r, g.bottom - g.r, 0, g.arc ? rem / g.arc : 0);
  rem -= g.arc;
  // bottom edge, right -> left
  if (rem <= g.straightH) return { x: g.right - g.r - rem, y: g.bottom, nx: 0, ny: 1, arcLen };
  rem -= g.straightH;
  // bottom-left corner
  if (rem <= g.arc) return onArc(g.left + g.r, g.bottom - g.r, Math.PI / 2, g.arc ? rem / g.arc : 0);
  rem -= g.arc;
  // left edge, bottom -> top
  if (rem <= g.straightV) return { x: g.left, y: g.bottom - g.r - rem, nx: -1, ny: 0, arcLen };
  rem -= g.straightV;
  // top-left corner
  return onArc(g.left + g.r, g.top + g.r, Math.PI, g.arc ? rem / g.arc : 0);
}

/** Walks the full loop in fixed arc-length steps. Returned as one continuous
 *  ring — points[last] is adjacent to points[0]. */
export function buildRoundedRectRig(
  w: number,
  h: number,
  inset: number,
  radius: number,
  spacingPx: number
): RigPoint[] {
  const total = roundedRectPerimeter(w, h, inset, radius);
  const count = Math.max(8, Math.round(total / Math.max(1, spacingPx)));
  const step = total / count;
  const out: RigPoint[] = [];
  for (let i = 0; i < count; i++) out.push(pointOnRoundedRect(w, h, inset, radius, i * step));
  return out;
}
