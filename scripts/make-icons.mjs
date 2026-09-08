// Derives every icon the app ships from one source artwork. `npm run icons`.
//
// resources/icon-source.png is the master: the gradient S on its dark
// squircle, sitting on a black field with room around it. Everything below is
// produced from it rather than exported by hand, so replacing the master is a
// one-command change and the tray icon can never drift from the app icon.
//
// The work happens on a canvas inside Electron's renderer. capturePage was the
// obvious tool and the wrong one: it hands back PHYSICAL pixels, so the icons
// came out sized by the build machine's display scaling. A canvas is exact.
//
// Outputs:
//   resources/app-icon.png   1024px — window and installer icon;
//                            electron-builder derives the .ico from it.
//   resources/tray-icon.png  64px — the same mark, small. The whole dark tile
//                            rather than a monochrome glyph: the tile holds up
//                            on a light taskbar and the glowing S holds up on
//                            a dark one, so one file covers both themes.
//   site/icon.png            512px — the site's favicon and link preview.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const source = join(root, 'resources', 'icon-source.png');
const outputs = [
  { size: 1024, out: join(root, 'resources', 'app-icon.png') },
  { size: 64, out: join(root, 'resources', 'tray-icon.png') },
  { size: 512, out: join(root, 'site', 'icon.png') },
];

// The host page is a real file, not a data: URL. A data: navigation here never
// settles — loadURL's promise simply never resolves — which is the same
// failure a data: URL gave the previous version of this script.
const hostPage = join(tmpdir(), 'syncity-icon-host.html');

const mainScript = `
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const source = ${JSON.stringify(source)};
const outputs = ${JSON.stringify(outputs)};

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 200, height: 200, show: false });
  await win.loadFile(${JSON.stringify(hostPage)});
  const sourceUrl = pathToFileURL(source).href;

  for (const job of outputs) {
    const dataUrl = await win.webContents.executeJavaScript(
      'renderIcon(' + JSON.stringify(sourceUrl) + ',' + job.size + ')'
    );
    writeFileSync(job.out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote ' + job.out + ' (' + job.size + 'px)');
  }

  win.destroy();
  app.quit();
});
`;

// Defined as its own string so the page function stays readable rather than
// being escaped three levels deep.
const pageFunction = `
window.renderIcon = async (sourceUrl, size) => {
  const img = new Image();
  img.src = sourceUrl;
  await img.decode();

  const probe = document.createElement('canvas');
  probe.width = img.width;
  probe.height = img.height;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(img, 0, 0);
  const { data } = pctx.getImageData(0, 0, img.width, img.height);

  // Where the artwork actually is. The master sits on pure black and the tile
  // itself is very dark but never black, so a low luma threshold separates
  // them — measured rather than hardcoded, because a fixed crop breaks the
  // moment the master is re-exported with a different margin.
  const THRESHOLD = 14;
  let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma <= THRESHOLD || data[i + 3] < 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  // Squared off the crop's own centre: the glow bleeds further on one axis
  // than the other, and a non-square crop would stretch the tile.
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  // Pulled in slightly: the threshold catches the glow that bleeds past the
  // tile, and cropping to THAT leaves the tile floating inside a dark ring
  // instead of filling the icon. This lands its edge on the canvas edge.
  const OVERSCAN = 0.955;
  const side = Math.max(w, h) * OVERSCAN;
  const sx = minX + w / 2 - side / 2;
  const sy = minY + h / 2 - side / 2;

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  // Re-cut the rounded corners so what falls outside them is transparent
  // rather than the master's black field, which would read as black corners
  // on every light surface Windows puts the icon on. The radius matches the
  // proportion the master was drawn at.
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.226);
  ctx.clip();
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return out.toDataURL('image/png');
};
`;

// The page carries the render function itself, so the main script only has to
// call it — no escaping a function body through two levels of string.
writeFileSync(hostPage, `<meta charset="utf-8"><script>${pageFunction}</script>`);

const scriptPath = join(root, 'node_modules', '.cache-make-icons.cjs');
writeFileSync(scriptPath, mainScript);

const electron = join(root, 'node_modules', 'electron', 'cli.js');
execFileSync(process.execPath, [electron, scriptPath], { stdio: 'inherit', cwd: root });
