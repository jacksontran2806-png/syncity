import { useEffect, useRef, useState } from 'react';

// Hover detection for Notch mode.
//
// The collapsed notch is only ~32px tall, so a zone that matched it exactly
// would be nearly impossible to hit coming up from below — the cursor crosses
// it in one frame. The trigger is therefore a taller invisible band: the
// notch's own x-range plus some slack, from the top edge down to
// TRIGGER_HEIGHT.
//
// NO CURSOR POLLING: the overlay window is click-through with
// setIgnoreMouseEvents(true, { forward: true }), and `forward` keeps delivering
// mousemove to the renderer even where the page isn't interactive. So plain
// viewport coordinates are enough — there's no need for the main process to
// poll screen.getCursorScreenPoint() on an interval, and no IPC on the hover
// path at all. (useClickThrough.ts already leans on the same guarantee.)

/** How far down from the top edge the invisible reveal band reaches. */
const TRIGGER_HEIGHT = 80;
/** Horizontal slack either side of the notch, so a near-miss still opens it. */
const TRIGGER_PAD_X = 24;
/** Grace period before collapsing. Deliberately short: the menu is meant to
 *  stay open only while you keep the pointer on it, so moving away should
 *  close it almost at once. It isn't zero because the reveal band and the
 *  panel don't share an exact edge — a few frames of slack stops a cursor
 *  crossing that seam from flickering the menu shut and open again. */
const CLOSE_DELAY_MS = 110;

export function useNotchHover(enabled: boolean, ref: React.RefObject<HTMLElement | null>): boolean {
  const [active, setActive] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) {
      clearTimeout(closeTimer.current);
      setActive(false);
      return;
    }

    const leave = () => {
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setActive(false), CLOSE_DELAY_MS);
    };

    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Once expanded, rect is the full panel and this follows it — that's what
      // keeps the panel open while the cursor is inside it, rather than only
      // while it's in the original collapsed strip.
      const inside =
        e.clientX >= rect.left - TRIGGER_PAD_X &&
        e.clientX <= rect.right + TRIGGER_PAD_X &&
        e.clientY >= 0 &&
        e.clientY <= Math.max(TRIGGER_HEIGHT, rect.bottom);

      if (inside) {
        clearTimeout(closeTimer.current);
        setActive(true);
      } else {
        leave();
      }
    };

    // The cursor moving onto another display stops delivering mousemove
    // entirely, which would otherwise leave the notch stuck open.
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', leave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', leave);
      clearTimeout(closeTimer.current);
    };
  }, [enabled, ref]);

  return active;
}
