// The Lyric size setting reaches every lyric size.
//
// The setting works by multiplying each type size through --lyric-scale, which
// means it only covers the rules that actually use it. Adding a lyric style
// with a plain `font-size: 44px` would leave that one style silently ignoring
// the slider — the kind of gap nobody notices until someone with a 4K monitor
// asks why one style won't grow. This reads the stylesheet and insists.

const fs = require('node:fs');
const path = require('node:path');
// assert.ts is TypeScript and this suite is plain CJS (it only reads files),
// so it carries the same three lines the other .cjs suite does.
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const done = () => {
  console.log('');
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
};

const cssPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'styles', 'lyricStyles.css');
const css = fs.readFileSync(cssPath, 'utf8');

// Every font-size declaration in the sheet, with the rule it belongs to.
// Comments are stripped first, or a rule preceded by a paragraph of reasoning
// reports that entire paragraph as its selector.
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim().replace(/\s+/g, ' '),
  body,
}));

const sized = rules.filter((r) => /font-size\s*:/.test(r.body));
check('the lyric stylesheet declares font sizes at all', sized.length > 0, `${sized.length} rules`);

for (const rule of sized) {
  const declarations = [...rule.body.matchAll(/font-size\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
  for (const value of declarations) {
    // `inherit` is the active row taking the stage's own size, which is
    // already scaled — nothing to multiply.
    if (value === 'inherit') continue;
    check(
      `${rule.selector} scales with the Lyric size setting`,
      value.includes('var(--lyric-scale'),
      `font-size: ${value}`
    );
  }
}

// The Giant Word is measured on a canvas rather than set in CSS, so its scale
// is applied in the component. Pinned here so the two cannot drift apart.
const giantPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'lyrics', 'GiantWordStage.tsx');
const giant = fs.readFileSync(giantPath, 'utf8');
check(
  'Giant Word applies the scale to the width it fits to',
  /TARGET_WIDTH_FRAC\s*\*\s*scale/.test(giant),
  'expected the fit target to be multiplied by the scale setting'
);
check(
  'Giant Word applies the scale to its height ceiling too',
  /MAX_HEIGHT_VH\s*\*\s*scale/.test(giant),
  'a scaled width against an unscaled height clamp would just hit the clamp'
);

done();
