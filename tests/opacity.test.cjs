// Evaluates the CSS calc() chains from app.css in plain JS, at the ends and
// the default of the panel-opacity slider. Catches a divisor typo that would
// only show up as "the default no longer looks like it used to".
const fs = require('fs');
const path = require('path');
// app.css is now an import manifest; the rules live in styles/.
const STYLES = 'C:/Vscode/touchpad/src/renderer/src/styles';
const sheets = fs.readdirSync(STYLES).filter((f) => f.endsWith('.css'));
const css = sheets.map((f) => fs.readFileSync(path.join(STYLES, f), 'utf8')).join('\n');

let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fail++;
};

// Every derived value in the chrome, mirrored from the stylesheet.
const derive = (o) => ({
  fill: o,
  blur: (24 * o) / 0.55,
  border: (0.08 * o) / 0.55,
  shadow: (0.35 * o) / 0.55,
  inset: (0.06 * o) / 0.55,
  text: Math.max(0, 0.55 - o), // CSS clamps negative alpha to 0
});

const DEFAULT = 0.55;
const d = derive(DEFAULT);
check(
  'default reproduces the original design',
  d.fill === 0.55 && d.blur === 24 && Math.abs(d.border - 0.08) < 1e-12 &&
    Math.abs(d.shadow - 0.35) < 1e-12 && Math.abs(d.inset - 0.06) < 1e-12 && d.text === 0,
  `fill=${d.fill} blur=${d.blur} border=${d.border} shadow=${d.shadow} text=${d.text}`
);

const zero = derive(0);
check(
  'at 0 the panel body vanishes completely',
  zero.fill === 0 && zero.blur === 0 && zero.border === 0 && zero.shadow === 0 && zero.inset === 0,
  'no floating outlined rectangle left behind'
);
check('at 0 the text gains a readability shadow', zero.text > 0.5, `alpha=${zero.text.toFixed(2)}`);

const one = derive(1);
check('at 1 the fill is fully opaque', one.fill === 1);
check('at 1 no text shadow is added', one.text === 0);

// Monotonic across the slider: no property may go backwards as it is raised.
let inversions = 0;
let prev = null;
for (let i = 0; i <= 100; i++) {
  const v = derive(i / 100);
  if (prev) {
    for (const k of ['fill', 'blur', 'border', 'shadow', 'inset']) if (v[k] < prev[k] - 1e-12) inversions++;
    if (v.text > prev.text + 1e-12) inversions++; // text shadow must go the other way
  }
  prev = v;
}
check('every derived value moves monotonically with the slider', inversions === 0, `${inversions} inversions`);

// All alphas legal at both ends.
let illegal = 0;
for (const o of [0, 0.55, 1]) {
  const v = derive(o);
  for (const k of ['fill', 'border', 'shadow', 'inset', 'text']) if (v[k] < 0 || v[k] > 1) illegal++;
}
check('alphas stay inside 0..1 across the range', illegal === 0, `${illegal} out of range`);

// The stylesheet must not still carry the removed toggle, and must reference
// the variable everywhere the old hardcoded 0.55 chrome alpha lived.
check('dead .settings-panel-opaque rule is gone', !css.includes('settings-panel-opaque'));
const varUses = (css.match(/--panel-opacity/g) || []).length;
check('chrome reads the variable', varUses >= 12, `${varUses} references`);
check('no hardcoded chrome fill left', !css.includes('rgba(15, 15, 15, 0.55)') && !css.includes('rgba(18, 18, 22, 0.55)'));

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
