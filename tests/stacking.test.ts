// Verifies the z-index scale that makes Trail/Aura actually visible during
// Album and Lyrics mode. Before this, the full-bleed album-art backdrop
// (opaque, edge-to-edge) painted over the glow canvas purely by DOM order —
// the canvas was still rendering the whole time, just invisible underneath.
// Reads the stylesheets directly rather than a DOM, since there's no browser
// here — this pins the ordering the way the wave/edge tests pin geometry.

import fs from 'node:fs';
// __dirname isn't safe here: esbuild bundles this into one file and __dirname
// then reflects wherever THAT lands (a temp dir), not this source file. An
// absolute path baked in at author time is what the other suites use too
// (see opacity.test.cjs) for exactly this reason.
const STYLES = 'C:/Vscode/touchpad/src/renderer/src/styles';
import { check, done } from './assert';

const css = (name: string): string => fs.readFileSync(`${STYLES}/${name}`, 'utf8');

/** Pulls the z-index declared for a selector. Assumes one declaration per
 *  selector in these sheets (true today — if that ever changes, this needs a
 *  real CSS parser instead of a regex). */
function zIndexOf(sheet: string, selector: string): number | null {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*(-?\\d+)',
    's'
  );
  const m = sheet.match(re);
  return m ? Number(m[1]) : null;
}

const glow = css('glow.css');
const album = css('album.css');
const lyrics = css('lyrics.css');
const fullscreen = css('fullscreen.css');
const chrome = css('chrome.css');

const glowZ = zIndexOf(glow, '.glow-root');
check('.glow-root declares a z-index', glowZ !== null, `got ${glowZ}`);

const layers: [string, number | null][] = [
  ['.album-backdrop', zIndexOf(album, '.album-backdrop')],
  ['.lyrics-backdrop', zIndexOf(lyrics, '.lyrics-backdrop')],
];
for (const [selector, z] of layers) {
  check(`${selector} is below the glow ring`, z !== null && glowZ !== null && z < glowZ, `${selector}=${z} glow=${glowZ}`);
}

const foreground: [string, number | null][] = [
  ['.fullscreen-back', zIndexOf(fullscreen, '.fullscreen-back')],
  ['.album-stage', zIndexOf(album, '.album-stage')],
  ['.album-transport', zIndexOf(album, '.album-transport')],
  ['.lyrics-art-wrap', zIndexOf(lyrics, '.lyrics-art-wrap')],
  ['.lyrics-stage', zIndexOf(lyrics, '.lyrics-stage')],
  ['.lyrics-sync', zIndexOf(lyrics, '.lyrics-sync')],
];
for (const [selector, z] of foreground) {
  check(`${selector} is above the glow ring`, z !== null && glowZ !== null && z > glowZ, `${selector}=${z} glow=${glowZ}`);
}

const boxZ = zIndexOf(chrome, '.draggable-box');
check('.draggable-box (widget/settings) is above everything else', boxZ !== null && glowZ !== null && boxZ > glowZ, `box=${boxZ} glow=${glowZ}`);
for (const [selector, z] of foreground) {
  check(`.draggable-box is above ${selector}`, boxZ !== null && z !== null && boxZ > z, `box=${boxZ} ${selector}=${z}`);
}

// Elements that need position:relative/absolute/fixed for z-index to apply at
// all — a z-index on a statically positioned element is silently ignored by
// the CSS spec, which would make this whole scale a no-op there.
const needsPosition: [string, string][] = [
  ['.lyrics-art-wrap', lyrics],
  ['.lyrics-stage', lyrics],
];
for (const [selector, sheet] of needsPosition) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*position:\\s*(relative|absolute|fixed|sticky)', 's');
  check(`${selector} has a position that makes z-index apply`, re.test(sheet), selector);
}

done();
