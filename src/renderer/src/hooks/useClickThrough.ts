import { useEffect } from 'react';
import { isClickThroughLocked, onClickThroughLockChange } from '../lib/clickThroughLock';

// The overlay window globally ignores mouse events (click-through) but still
// forwards mousemove for hit-testing (see main/windows.ts). Any element
// marked data-hitregion is "solid" — hovering it disables click-through so
// it can receive clicks/hovers/drags normally.
export function useClickThrough(): void {
  useEffect(() => {
    let lastIgnored: boolean | null = null;

    const apply = (ignore: boolean) => {
      if (ignore === lastIgnored) return;
      lastIgnored = ignore;
      window.lyriglow.setIgnoreMouseEvents(ignore);
    };

    const onMouseMove = (e: MouseEvent) => {
      // A drag holds the lock. Re-enabling click-through mid-gesture cuts off
      // the pointer stream and freezes the drag — see clickThroughLock.ts.
      if (isClickThroughLocked()) return;
      const target = e.target as HTMLElement | null;
      apply(!target?.closest('[data-hitregion]'));
    };

    // Taking the lock has to force click-through off immediately, not wait for
    // the next mousemove: the pointer may already be off every hit region by
    // the time the drag starts moving.
    const offLock = onClickThroughLockChange((locked) => {
      if (locked) apply(false);
    });

    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      offLock();
    };
  }, []);
}
