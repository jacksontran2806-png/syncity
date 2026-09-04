import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 4000;

/** Dynamic-Island-style collapse: after IDLE_MS with no real interaction the
 *  widget shrinks to a pill. Bringing it back out of the pill is handled by
 *  WidgetDock's own hover-delay (a direct, sustained hover over the pill) or
 *  the global hotkey (`expandSignal`) — NOT plain mouse movement.
 *
 *  Deliberately not listening for 'mousemove' here: click-through still
 *  delivers mousemove to the renderer everywhere on screen (see
 *  useClickThrough.ts), so a global mousemove wake meant the pill almost
 *  never stayed collapsed for more than an instant whenever the mouse moved
 *  anywhere at all, on top of unrelated apps. pointerdown/keydown are safe to
 *  keep as wake signals — click-through means those only ever reach this
 *  window when the interaction was actually with the app (a hit-region). */
export function useAutoHide(enabled: boolean, expandSignal: number): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      clearTimeout(timer.current);
      return;
    }

    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCollapsed(true), IDLE_MS);
    };
    const wake = () => {
      setCollapsed(false);
      arm();
    };

    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    arm();

    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      clearTimeout(timer.current);
    };
  }, [enabled]);

  // Hotkey summon
  useEffect(() => {
    if (expandSignal > 0) setCollapsed(false);
  }, [expandSignal]);

  return collapsed;
}
