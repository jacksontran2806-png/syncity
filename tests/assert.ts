// Shared harness for the numeric suites.
//
// These aren't unit tests in the usual sense — the app is a GUI overlay that
// can't be rendered headlessly here, so each suite pins down the arithmetic
// underneath something visual: does the wave actually travel, does the drag
// actually track the pointer, does the glow actually reach the edge. If one of
// these fails, the corresponding thing on screen is wrong.

let failures = 0;

export function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

/** Call once at the end of a suite. Exits non-zero if anything failed. */
export function done(): never {
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
