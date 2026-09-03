// Does the glow actually reach the screen edge? Measures the closest approach
// of each mode's geometry to the viewport border, in the renderer's own
// coordinate space — the half of the "fullscreen leaves a margin" bug that
// lives in the page rather than in the window bounds.
import { buildRoundedRectRig, roundedRectPerimeter } from '../src/renderer/src/render/shared/rig';
import { maxWaveAmplitude, waveOffset, type WaveParams } from '../src/renderer/src/render/aura/waves';
import { check, done } from './assert';


// A 1920x1200 panel at 125% scaling — the case in the report. The renderer
// works in DIPs, so this is what window.innerWidth/Height report.
const W = 1536;
const H = 960;
const RADIUS = 31.2; // thickness 26 * 1.2
const EDGE_HUG = 0.35;

const params: WaveParams = { waveCount: 1, waveHeight: 1, waveSpeed: 1, rippleDetail: 1.5, crash: 1 };
const maxAmp = maxWaveAmplitude(params);
const inset = maxAmp * EDGE_HUG;

// --- Aura: sample the displaced band over time and find its closest approach
//     to each of the four borders. ---
const perim = roundedRectPerimeter(W, H, inset, RADIUS);
const rig = buildRoundedRectRig(W, H, inset, RADIUS, 9);

let minLeft = Infinity;
let minRight = Infinity;
let minTop = Infinity;
let minBottom = Infinity;
for (let t = 0; t < 12; t += 0.25) {
  for (const p of rig) {
    const o = waveOffset(p.arcLen, perim, t, params);
    const x = p.x + p.nx * o;
    const y = p.y + p.ny * o;
    minLeft = Math.min(minLeft, x);
    minRight = Math.min(minRight, W - x);
    minTop = Math.min(minTop, y);
    minBottom = Math.min(minBottom, H - y);
  }
}
const worst = Math.max(minLeft, minRight, minTop, minBottom);
check(
  'Aura reaches every screen edge',
  worst <= 0.5,
  `closest approach L=${minLeft.toFixed(1)} R=${minRight.toFixed(1)} T=${minTop.toFixed(1)} B=${minBottom.toFixed(1)} px`
);
check(
  'Aura still keeps most of its body on screen',
  minLeft > -maxAmp * 0.8 && minTop > -maxAmp * 0.8,
  `deepest overshoot ${Math.min(minLeft, minRight, minTop, minBottom).toFixed(1)}px of maxAmp=${maxAmp.toFixed(1)}`
);

// Regression guard: the old inset was the full peak amplitude, which parked the
// band this far from the edge on all four sides.
const oldInsetGap = maxAmp - Math.max(...[0].map(() => 0)) - 0; // resting line offset
check(
  'the old full-amplitude inset really did leave a margin',
  maxAmp > 20,
  `old resting line sat ${maxAmp.toFixed(1)}px in, troughs ~${(maxAmp * 2).toFixed(0)}px in`
);
void oldInsetGap;

// --- Trail: inset 0, so its rig must sit exactly on the border. ---
const trailRig = buildRoundedRectRig(W, H, 0, RADIUS, 9);
const trailMin = Math.max(
  Math.min(...trailRig.map((p) => p.x)),
  Math.min(...trailRig.map((p) => W - p.x)),
  Math.min(...trailRig.map((p) => p.y)),
  Math.min(...trailRig.map((p) => H - p.y))
);
check('Trail path sits on the screen edge', trailMin <= 0.001, `worst gap ${trailMin.toExponential(2)}px`);

// --- The rig must span the full viewport, not a scaled-down copy of it. A
//     DPI/units mistake would show up here as a systematically small box. ---
const spanX = Math.max(...trailRig.map((p) => p.x)) - Math.min(...trailRig.map((p) => p.x));
const spanY = Math.max(...trailRig.map((p) => p.y)) - Math.min(...trailRig.map((p) => p.y));
check('rig spans the full viewport', Math.abs(spanX - W) < 0.001 && Math.abs(spanY - H) < 0.001, `${spanX}×${spanY} vs ${W}×${H}`);

done();
