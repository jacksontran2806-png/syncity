import { placeBox, resolvePosition, SNAP_PX } from '../src/renderer/src/lib/dragMath';
import {
  acquireClickThroughLock,
  isClickThroughLocked,
  onClickThroughLockChange,
} from '../src/renderer/src/lib/clickThroughLock';
import { check, done } from './assert';


const VW = 1920;
const VH = 1080;
const BW = 312;
const BH = 190;

// --- 1. grab offset preserved: the box must not jump on pointer-down ---
// Pointer goes down 100px into the box, which sits at (500, 300).
const env = { grabX: 100, grabY: 40, bw: BW, bh: BH, vw: VW, vh: VH };
const p0 = placeBox(600, 340, env);
check('no jump on grab', p0.x === 500 && p0.y === 300, `-> (${p0.x}, ${p0.y}) expected (500, 300)`);

// --- 2. box tracks the pointer 1:1 ---
const p1 = placeBox(600 + 137, 340 + 91, env);
check('tracks pointer 1:1', p1.x - p0.x === 137 && p1.y - p0.y === 91, `d=(${p1.x - p0.x}, ${p1.y - p0.y})`);

// --- 3. never leaves the viewport, however far the pointer goes ---
let escaped = 0;
for (const [cx, cy] of [[-5000, -5000], [99999, 99999], [0, 99999], [99999, 0]] as [number, number][]) {
  const p = placeBox(cx, cy, env);
  if (p.x < 0 || p.y < 0 || p.x > VW - BW || p.y > VH - BH) escaped++;
}
check('clamped to the viewport', escaped === 0, `${escaped} escapes`);

// --- 4. snapping: edges and centre, and ONLY within SNAP_PX ---
const centreX = (VW - BW) / 2;
const nearCentre = placeBox(centreX + env.grabX + 12, 400, env);
check('snaps to horizontal centre', nearCentre.x === centreX, `x=${nearCentre.x} centre=${centreX}`);

const farFromCentre = placeBox(centreX + env.grabX + SNAP_PX + 5, 400, env);
check(
  'does NOT snap outside the threshold',
  farFromCentre.x === centreX + SNAP_PX + 5,
  `x=${farFromCentre.x}`
);

const nearLeft = placeBox(env.grabX + 7, 400, env);
check('snaps to the left edge', nearLeft.x === 0, `x=${nearLeft.x}`);
const nearRight = placeBox(VW - BW + env.grabX - 6, 400, env);
check('snaps to the right edge', nearRight.x === VW - BW, `x=${nearRight.x}`);
const nearTop = placeBox(700, env.grabY + 4, env);
check('snaps to the top edge', nearTop.y === 0, `y=${nearTop.y}`);

// --- 5. idempotence: re-placing at the same pointer gives the same answer.
//        A snap that moved the box and then re-snapped from the new position
//        would creep across the screen while the pointer sat still. ---
let creep = 0;
for (let cx = 0; cx <= VW; cx += 7) {
  const a = placeBox(cx, 500, env);
  const b = placeBox(cx, 500, env);
  if (a.x !== b.x || a.y !== b.y) creep++;
}
check('placement is stable for a stationary pointer', creep === 0, `${creep} unstable samples`);

// --- 6. monotonic: dragging right never moves the box left. Any inversion
//        here is a box that visibly jitters backwards mid-drag. ---
let inversions = 0;
let prev = -Infinity;
for (let cx = 0; cx <= VW; cx += 1) {
  const x = placeBox(cx, 500, env).x;
  if (x < prev - 1e-9) inversions++;
  prev = x;
}
check('drag is monotonic (no backwards jitter)', inversions === 0, `${inversions} inversions`);

// --- 7. round-trip through persisted percentages ---
const committed = placeBox(900, 500, env);
const pct = { xPct: committed.x / VW, yPct: committed.y / VH };
const restored = resolvePosition(pct.xPct, pct.yPct, { bw: BW, bh: BH, vw: VW, vh: VH });
check(
  'position survives the percent round-trip',
  Math.abs(restored.x - committed.x) < 1e-6 && Math.abs(restored.y - committed.y) < 1e-6,
  `(${committed.x}, ${committed.y}) -> (${restored.x.toFixed(2)}, ${restored.y.toFixed(2)})`
);

// --- 8. a position saved on a big display stays on screen on a small one ---
const small = resolvePosition(0.95, 0.95, { bw: BW, bh: BH, vw: 1280, vh: 720 });
check(
  'off-screen fraction is pulled back on-screen',
  small.x <= 1280 - BW && small.y <= 720 - BH,
  `(${small.x.toFixed(0)}, ${small.y.toFixed(0)}) max=(${1280 - BW}, ${720 - BH})`
);

// --- 9. the click-through lock: this is the freeze fix ---
const seen: boolean[] = [];
const off = onClickThroughLockChange((l) => seen.push(l));
check('unlocked at rest', !isClickThroughLocked());
const rel1 = acquireClickThroughLock();
check('locked while dragging', isClickThroughLocked());
const rel2 = acquireClickThroughLock();
rel1();
check('nested holder keeps the lock', isClickThroughLocked());
rel1(); // double-release must be a no-op, not an underflow
check('double release is a no-op', isClickThroughLocked());
rel2();
check('released after the last holder', !isClickThroughLocked());
check('emitted exactly one change per transition', seen.length === 2 && seen[0] === true && seen[1] === false, `seen=${JSON.stringify(seen)}`);
off();

done();
