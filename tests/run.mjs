// Test runner. `npm test`.
//
// No test framework: these suites import app modules directly and assert on
// numbers, so all that's needed is a way to run TypeScript in Node. esbuild
// (already a transitive dev dependency via Vite) bundles each suite to a temp
// CJS file, then Node runs it. Suites already written as .cjs run as-is.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'lyriglow-tests-'));
// esbuild's own JS entry, run with this Node. Not `npx`: Node refuses to
// spawnSync a .cmd shim on Windows without a shell, and going through the
// shell just to find a binary that's already on disk is pointless.
const esbuild = join(here, '..', 'node_modules', 'esbuild', 'bin', 'esbuild');
// App code under test imports via the '@shared/*' alias (see
// tsconfig.web.json / electron.vite.config), which plain esbuild doesn't know
// about — it needs to be told explicitly or bundling any suite that touches
// shared/types.ts fails outright.
const sharedAlias = `@shared=${join(here, '..', 'src', 'shared')}`;

const suites = readdirSync(here)
  .filter((f) => f.includes('.test.'))
  .sort();

let failed = 0;
try {
  for (const suite of suites) {
    console.log(`\n=== ${suite} ===`);
    let entry = join(here, suite);
    if (suite.endsWith('.ts')) {
      entry = join(out, suite.replace(/\.ts$/, '.cjs'));
      execFileSync(
        process.execPath,
        [
          esbuild,
          join(here, suite),
          '--bundle',
          '--platform=node',
          '--format=cjs',
          `--alias:${sharedAlias}`,
          `--outfile=${entry}`,
          '--log-level=warning',
        ],
        { stdio: 'inherit' }
      );
    }
    try {
      execFileSync(process.execPath, [entry], { stdio: 'inherit' });
    } catch {
      failed++;
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(failed === 0 ? `\n${suites.length} suites, all passed` : `\n${failed} of ${suites.length} suites FAILED`);
process.exit(failed === 0 ? 0 : 1);
