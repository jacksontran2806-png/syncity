// Renders the app's icons from source, rather than keeping binaries nobody can
// edit. `npm run icons`.
//
// The icon is drawn as HTML/CSS and captured through Electron — the same
// renderer the app itself paints in — so the mark can use the real gradient,
// the real radii and the real palette constants instead of an approximation
// hand-encoded into a PNG. Re-running this after a palette change keeps the
// icon in step with the app.
//
// Outputs:
//   resources/app-icon.png   1024px — window/installer icon; electron-builder
//                            derives the .ico from it at package time.
//   resources/tray-icon.png  64px, transparent, white — the tray sits at 16px
//                            on a dark taskbar, where colour and detail both
//                            disappear, so it's a plain glyph with heavier
//                            proportions.
//   resources/tray-icon-light.png  the same glyph in near-black, for a light
//                            taskbar. Windows does not invert tray icons.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// The mark: three stacked lyric lines with the middle one active — the lyrics
// view's own stage, reduced to something that still reads at 16 pixels.
// Anything more literal (a note, a microphone) says "music player" and nothing
// about what this app actually shows.
const APP_ICON_HTML = `
<style>
  html, body { margin: 0; width: 1024px; height: 1024px; background: transparent; }
  .icon {
    position: relative;
    width: 1024px; height: 1024px;
    border-radius: 232px;              /* Windows/macOS squircle proportions */
    background:
      radial-gradient(120% 120% at 22% 12%, rgba(124, 92, 255, 0.55), transparent 58%),
      radial-gradient(110% 110% at 86% 90%, rgba(255, 92, 205, 0.42), transparent 60%),
      radial-gradient(120% 120% at 92% 22%, rgba(79, 172, 254, 0.30), transparent 62%),
      linear-gradient(160deg, #17161f 0%, #0b0a0f 100%);
    box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.09);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 54px;
  }
  .line { border-radius: 999px; }
  /* Sung already / coming up: present but receded, the way the stacked lyric
     styles render their inactive rows. */
  .line--past   { width: 322px; height: 58px; background: rgba(255,255,255,0.30); }
  .line--next   { width: 404px; height: 58px; background: rgba(255,255,255,0.24); }
  /* The active line, carrying the app's own palette left to right. */
  .line--active {
    width: 560px; height: 86px;
    background: linear-gradient(90deg, #8f6bff 0%, #c46cff 46%, #ff6fb8 100%);
    box-shadow: 0 0 70px rgba(180, 108, 255, 0.55);
  }
</style>
<div class="icon">
  <div class="line line--past"></div>
  <div class="line line--active"></div>
  <div class="line line--next"></div>
</div>
`;

// Tray: no gradient, no glow, no colour. At 16px a gradient turns to mud and a
// tinted glyph disappears against whatever accent colour the taskbar is using.
// Bars are proportionally fatter than the app icon's so they survive the
// downscale to a couple of pixels each.
//
// Two of them, because Windows does NOT invert a tray icon for you: a white
// glyph is invisible on a light taskbar and a dark one is invisible on a dark
// taskbar. tray.ts picks between these by the system theme and re-picks when
// it changes.
const trayHtml = (ink) => `
<style>
  html, body { margin: 0; width: 64px; height: 64px; background: transparent; }
  .tray {
    width: 64px; height: 64px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 7px;
  }
  .line { border-radius: 999px; background: ${ink}; }
  .line--past   { width: 28px; height: 7px; opacity: 0.55; }
  .line--active { width: 46px; height: 10px; }
  .line--next   { width: 34px; height: 7px; opacity: 0.55; }
</style>
<div class="tray">
  <div class="line line--past"></div>
  <div class="line line--active"></div>
  <div class="line line--next"></div>
</div>
`;

// HTML goes to real files rather than data: URLs — a data: URL loads fine as
// the first navigation and then fails with ERR_FAILED on the next window,
// which is not worth chasing when a temp file always works.
const pages = [
  { html: APP_ICON_HTML, size: 1024, out: join(root, 'resources', 'app-icon.png') },
  // Named for the taskbar they belong on, not for the ink they're drawn in.
  { html: trayHtml('#ffffff'), size: 64, out: join(root, 'resources', 'tray-icon.png') },
  { html: trayHtml('#17161f'), size: 64, out: join(root, 'resources', 'tray-icon-light.png') },
];
const jobs = pages.map((page, i) => {
  const htmlPath = join(tmpdir(), `syncity-icon-${i}.html`);
  writeFileSync(htmlPath, page.html);
  return { htmlPath, size: page.size, out: page.out };
});

// The renderer half: a throwaway Electron main script. Written out rather than
// kept as a file because it is not part of the app and has no reason to be
// loadable by anything else.
const mainScript = `
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');

const jobs = ${JSON.stringify(jobs)};

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  // ONE window, resized between jobs. A second BrowserWindow created after the
  // first is destroyed fails its very first navigation with ERR_FAILED on
  // Windows — reusing the window sidesteps it and is less work anyway.
  const win = new BrowserWindow({
    width: jobs[0].size,
    height: jobs[0].size,
    show: false,
    frame: false,
    transparent: true,          // keeps the rounded corners actually rounded
    backgroundColor: '#00000000',
  });

  for (const job of jobs) {
    win.setContentSize(job.size, job.size);
    await win.loadFile(job.htmlPath);
    // One frame after load: capturePage on a window that has not painted yet
    // comes back empty.
    await new Promise((r) => setTimeout(r, 250));
    const captured = await win.webContents.capturePage();
    // capturePage works in PHYSICAL pixels, so on a 125% display a 1024px
    // window captures at 1280. Resize back to the size actually asked for —
    // an icon that is 1280px because of the build machine's DPI is a bug that
    // only shows up on someone else's machine.
    const image = captured.getSize().width === job.size
      ? captured
      : captured.resize({ width: job.size, height: job.size, quality: 'best' });
    writeFileSync(job.out, image.toPNG());
    console.log('wrote ' + job.out + ' (' + image.getSize().width + 'px)');
  }

  win.destroy();
  app.quit();
});
`;

const scriptPath = join(root, 'node_modules', '.cache-make-icons.cjs');
writeFileSync(scriptPath, mainScript);

const electron = join(root, 'node_modules', 'electron', 'cli.js');
execFileSync(process.execPath, [electron, scriptPath], { stdio: 'inherit', cwd: root });
