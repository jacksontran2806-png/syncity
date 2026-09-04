// Verifies the z-index scale in Album and Lyrics mode: the full-bleed
// album-art backdrop must stay behind the foreground stage/lyrics content,
// which must stay behind the draggable widget/settings box.
// Reads the stylesheets directly rather than a DOM, since there's no browser
// here — this pins the ordering the way the drag tests pin geometry.

import fs from 'node:fs';
// __dirname isn't safe here: esbuild bundles this into one file and __dirname
// then reflects wherever THAT lands (a temp dir), not this source file. An
// absolute path baked in at author time is what the other suites use too
// (see opacity.test.cjs) for exactly this reason.
const STYLES = 'C:/Vscode/touchpad/src/renderer/src/styles';
import { check, done } from './assert';

// Every sheet, concatenated, rather than named files: the z-index scale is an
// app-wide property, and which file a rule happens to live in is a detail that
// changes whenever a sheet is split for size. Selectors are unique across the
// set, so a single haystack is unambiguous.
const ALL_CSS = fs
  .readdirSync(STYLES)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(`${STYLES}/${f}`, 'utf8'))
  .join('\n');

/** Pulls the z-index declared for a selector. Assumes one declaration per
 *  selector across these sheets (true today — if that ever changes, this needs
 *  a real CSS parser instead of a regex). */
function zIndexOf(selector: string): number | null {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*(-?\\d+)',
    's'
  );
  const m = ALL_CSS.match(re);
  return m ? Number(m[1]) : null;
}

const layers: [string, number | null][] = [
  ['.album-backdrop', zIndexOf('.album-backdrop')],
  ['.lyrics-backdrop', zIndexOf('.lyrics-backdrop')],
];
for (const [selector, z] of layers) {
  check(`${selector} declares a z-index`, z !== null, `got ${z}`);
}

const foreground: [string, number | null][] = [
  ['.fullscreen-back', zIndexOf('.fullscreen-back')],
  ['.album-stage', zIndexOf('.album-stage')],
  ['.album-transport', zIndexOf('.album-transport')],
  ['.lyrics-stage', zIndexOf('.lyrics-stage')],
  ['.lyrics-sync', zIndexOf('.lyrics-sync')],
  ['.giant-word-stage', zIndexOf('.giant-word-stage')],
  ['.lyrics-slide-stage', zIndexOf('.lyrics-slide-stage')],
];
for (const [backSelector, backZ] of layers) {
  for (const [foreSelector, foreZ] of foreground) {
    check(
      `${foreSelector} is above ${backSelector}`,
      backZ !== null && foreZ !== null && foreZ > backZ,
      `${foreSelector}=${foreZ} ${backSelector}=${backZ}`
    );
  }
}

const boxZ = zIndexOf('.draggable-box');
check('.draggable-box (widget/settings) declares a z-index', boxZ !== null, `got ${boxZ}`);
for (const [selector, z] of [...layers, ...foreground]) {
  check(`.draggable-box is above ${selector}`, boxZ !== null && z !== null && boxZ > z, `box=${boxZ} ${selector}=${z}`);
}

// Elements that need position:relative/absolute/fixed for z-index to apply at
// all — a z-index on a statically positioned element is silently ignored by
// the CSS spec, which would make this whole scale a no-op there.
const needsPosition = ['.lyrics-stage', '.giant-word-stage', '.lyrics-slide-stage'];
for (const selector of needsPosition) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*position:\\s*(relative|absolute|fixed|sticky)', 's');
  check(`${selector} has a position that makes z-index apply`, re.test(ALL_CSS), selector);
}

done();
