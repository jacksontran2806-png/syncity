// Deletes the Chromium locale packs the app never shows.
//
// Electron ships every translation Chromium has — ~55 .pak files, ~40 MB, and
// nothing in Syncity is translated: the UI is English-only strings in the
// renderer, so the only pack that is ever read is the one matching the app
// locale. electron-builder's `electronLanguages` option covers macOS and Linux
// but is a no-op on Windows, which is the platform that actually ships here,
// so the pruning happens in an afterPack hook instead.
//
// en-US.pak is NOT optional: Chromium falls back to it for its own built-in UI
// strings, and removing it makes the app start with empty menus and blank
// dialog buttons rather than in another language.
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const KEEP = new Set(['en-US.pak']);

/** @param {{ appOutDir: string }} context */
export default async function pruneLocales(context) {
  const dir = path.join(context.appOutDir, 'locales');

  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    // No locales directory on this target (macOS keeps them elsewhere in the
    // bundle). Nothing to prune, and nothing worth failing a build over.
    return;
  }

  let freed = 0;
  for (const name of entries) {
    if (!name.endsWith('.pak') || KEEP.has(name)) continue;
    const file = path.join(dir, name);
    freed += (await stat(file)).size;
    await rm(file);
  }

  console.log(`  • pruned Chromium locales, freed ${(freed / 1024 / 1024).toFixed(1)} MB`);
}
