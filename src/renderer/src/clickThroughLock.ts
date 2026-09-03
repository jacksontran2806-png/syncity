// A hold on click-through, for the duration of a drag.
//
// WHY THIS EXISTS — this is the bug that made Move mode unusable.
// The overlay window ignores mouse events globally and only forwards
// mousemove; useClickThrough hit-tests each move against [data-hitregion] and
// tells the main process whether to keep passing clicks through to the desktop.
// During a drag the pointer routinely sits over NOTHING solid: the box is being
// repositioned out from under it, and a fast flick outruns it entirely. The hit
// test then says "not interactive", click-through is handed back to the OS
// mid-gesture, and the window stops receiving the pointer stream. The drag
// stalls, the pointer re-enters somewhere else, and the box teleports — which
// is exactly the "glitching place to place and freezing" symptom.
//
// So a drag takes a lock: while it's held, click-through stays OFF regardless
// of what's under the cursor, and it's released on pointerup/pointercancel.
// A counter rather than a boolean, so overlapping holders can't clobber
// each other.

let depth = 0;
const listeners = new Set<(locked: boolean) => void>();

function emit(locked: boolean): void {
  for (const fn of listeners) fn(locked);
}

/** Takes the lock. Returns a release function that is safe to call twice. */
export function acquireClickThroughLock(): () => void {
  depth++;
  if (depth === 1) emit(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth--;
    if (depth === 0) emit(false);
  };
}

export function isClickThroughLocked(): boolean {
  return depth > 0;
}

export function onClickThroughLockChange(fn: (locked: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
