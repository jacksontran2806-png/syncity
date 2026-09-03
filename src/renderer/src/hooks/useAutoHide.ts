import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 4000;

/** Dynamic-Island-style collapse: after IDLE_MS with no pointer activity the
 *  widget shrinks to a pill; any movement (or the global hotkey, which fires
 *  `expandSignal`) brings it back.
 *
 *  Pointer movement is observable even while the window is click-through —
 *  setIgnoreMouseEvents(forward:true) still delivers mousemove to the renderer. */
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

    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    arm();

    return () => {
      window.removeEventListener('mousemove', wake);
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
