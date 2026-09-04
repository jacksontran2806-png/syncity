// One-time carry-over from the app's previous name.
//
// Electron derives userData from the app name, so renaming LyriGlow -> Syncity
// moved the whole profile directory: %APPDATA%/LyriGlow -> %APPDATA%/Syncity.
// Without this, an existing install silently comes back up logged out and with
// every setting reset — the old files are still on disk, just somewhere the
// app no longer looks.
//
// COPIES rather than moves, and never overwrites: the old directory stays put
// as a fallback, and a Syncity profile that already exists always wins.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** Former product names, newest first. Add to this if it's ever renamed again. */
const LEGACY_APP_NAMES = ['LyriGlow'];

/** The files worth carrying over. Caches and crash logs are deliberately left
 *  behind — they're regenerated, and a stale crash log under a new name would
 *  just be confusing. */
const CARRY_OVER = ['settings.json', 'tokens.json'];

/**
 * Brings settings and the saved Spotify session forward from a previous app
 * name, if this profile doesn't have them yet.
 *
 * Must run BEFORE anything reads userData (settingsStore, tokens) — see the
 * call site in index.ts, which is ordered ahead of the first loadSettings().
 * Safe to call every launch: once the files exist under the new name, it does
 * nothing.
 */
export function migrateLegacyUserData(): void {
  let current: string;
  try {
    current = app.getPath('userData');
  } catch {
    return; // paths unavailable this early on some platforms — nothing to do
  }
  const parent = path.dirname(current);

  for (const legacyName of LEGACY_APP_NAMES) {
    const legacy = path.join(parent, legacyName);
    if (legacy === current || !fs.existsSync(legacy)) continue;

    for (const file of CARRY_OVER) {
      const from = path.join(legacy, file);
      const to = path.join(current, file);
      try {
        if (!fs.existsSync(from) || fs.existsSync(to)) continue;
        fs.mkdirSync(current, { recursive: true });
        fs.copyFileSync(from, to);
        console.log(`[migrate] carried ${file} over from ${legacyName}`);
      } catch (err) {
        // Never fatal: a failed carry-over costs the user a re-login, whereas
        // throwing here would stop the app from starting at all.
        console.warn(`[migrate] could not carry ${file} from ${legacyName}:`, err);
      }
    }
  }
}
