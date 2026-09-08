import { useEffect, useRef, useState } from 'react';
import { HOVER_CLOSE_DELAY_MS } from '../lib/hoverTiming';

// Hover detection for Notch mode.
//
// Opening is on a dwell timer (see lib/hoverTiming), not on entry. It used to
// be immediate, which meant the notch opened for any pointer that touched the
// top edge of the screen on its way to something else — and meant the hover
// delay a user set for the widget did nothing at all in the mode that ships
// as the default.
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

/**
 * Slack around the notch's own box, in px.
 *
 * Was a tall invisible band (80px down the screen, 24px either side) on the
 * theory that a ~28px notch is hard to hit. In practice that opened the menu
 * while the pointer was nowhere near anything visible — it felt like snagging
 * on an invisible object, which is worse than an occasional near-miss. The
 * zone now hugs what's actually drawn, with just enough margin to forgive a
 * pixel or two of overshoot.
 */
const TRIGGER_PAD = 6;

export interface NotchHoverState {
  /** The notch is open. */
  open: boolean;
  /** The dwell is counting down: the pointer is in the band but the widget
   *  has not opened yet. */
  arming: boolean;
}

export function useNotchHover(
  enabled: boolean,
  ref: React.RefObject<HTMLElement | null>,
  /** Dwell before opening, from settings. Passed in rather than read here so
   *  the hook stays a pure input-to-boolean and both modes are visibly driven
   *  by the same value in WidgetDock. */
  openDelayMs: number
): NotchHoverState {
  const [active, setActive] = useState(false);
  /** True while the dwell is counting down — what the notch draws its fill
   *  from, so the wait is visible rather than being a second of nothing. */
  const [arming, setArming] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) {
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      setActive(false);
      setArming(false);
      return;
    }

    const leave = () => {
      // Leaving cancels a pending open outright. Dwell has to be continuous —
      // otherwise a pointer that crosses the band three times on its way
      // elsewhere accumulates its way into opening the menu.
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
      setArming(false);
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setActive(false), HOVER_CLOSE_DELAY_MS);
    };

    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Once expanded, rect is the full panel and this follows it — that's what
      // keeps the panel open while the cursor is inside it, rather than only
      // while it's in the original collapsed strip.
      const inside =
        e.clientX >= rect.left - TRIGGER_PAD &&
        e.clientX <= rect.right + TRIGGER_PAD &&
        e.clientY >= 0 && // the notch sits flush to the edge; nothing above it
        e.clientY <= rect.bottom + TRIGGER_PAD;

      if (inside) {
        clearTimeout(closeTimer.current);
        // Already open, or already counting down to open: nothing to restart.
        // Restarting on every mousemove would mean the menu only ever opened
        // for a pointer held perfectly still.
        if (active || openTimer.current) return;
        setArming(true);
        openTimer.current = setTimeout(() => {
          openTimer.current = undefined;
          setArming(false);
          setActive(true);
        }, openDelayMs);
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
      clearTimeout(openTimer.current);
    };
  }, [enabled, ref, active, openDelayMs]);

  return { open: active, arming };
}
