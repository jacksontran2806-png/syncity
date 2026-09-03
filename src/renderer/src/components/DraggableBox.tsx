import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { acquireClickThroughLock } from '../clickThroughLock';
import { placeBox, resolvePosition } from './dragMath';
import type { WidgetPosition } from '@shared/types';

/** Controls never start a drag — otherwise every button press on the widget is
 *  a one-pixel drag and the click is eaten. */
const NO_DRAG = 'button, input, select, textarea, a, label, [contenteditable], [data-nodrag]';

export interface PlacementEnv {
  vw: number;
  vh: number;
  bw: number;
  bh: number;
}

interface Props {
  className?: string;
  /** Committed position, as a fraction of the viewport. null = defaultPlacement. */
  position: WidgetPosition | null;
  /** Called ONCE, on pointer-up. Dragging never writes to settings mid-gesture:
   *  a settings round-trip per pointermove is an IPC call per frame. */
  onCommit: (position: WidgetPosition) => void;
  /** Where the box sits before it has ever been dragged. Gets real measured
   *  box dimensions, so "centred" means centred, not left-edge-at-centre. */
  defaultPlacement: (env: PlacementEnv) => { x: number; y: number };
  onHoverChange?: (hovered: boolean) => void;
  children: React.ReactNode;
}

/**
 * A free-floating, draggable, position-persisted box.
 *
 * Two rules make this behave, both learned from the version that didn't:
 *
 * 1. LEFT/TOP ARE OWNED IMPERATIVELY, never by the React style prop. An
 *    unrelated re-render mid-drag (a now-playing poll lands every 2.5s) would
 *    otherwise snap the box back to its last committed position.
 * 2. The pointer stream is held for the whole gesture — pointer capture plus a
 *    click-through lock — so the box can move out from under the cursor
 *    without the drag dying. See clickThroughLock.ts.
 */
export function DraggableBox({
  className,
  position,
  onCommit,
  defaultPlacement,
  onHoverChange,
  children,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  /** Writes the committed (or default) position to the DOM. */
  const applyPosition = useCallback(() => {
    const el = ref.current;
    if (!el || dragging.current) return; // never fight an in-flight drag
    const env = { vw: window.innerWidth, vh: window.innerHeight, bw: el.offsetWidth, bh: el.offsetHeight };

    const p = position
      ? resolvePosition(position.xPct, position.yPct, env)
      : defaultPlacement(env);

    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }, [position, defaultPlacement]);

  useLayoutEffect(applyPosition, [applyPosition]);

  useEffect(() => {
    window.addEventListener('resize', applyPosition);
    return () => window.removeEventListener('resize', applyPosition);
  }, [applyPosition]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(NO_DRAG)) return;

    const box = el.getBoundingClientRect();
    // Grab offset: the box keeps its position under the cursor instead of
    // jumping so its corner meets the pointer.
    const grabX = e.clientX - box.left;
    const grabY = e.clientY - box.top;
    const bw = box.width;
    const bh = box.height;

    dragging.current = true;
    el.classList.add('is-dragging');
    const releaseLock = acquireClickThroughLock();
    el.setPointerCapture(e.pointerId);

    let frame = 0;

    // Box size is captured at pointer-down, not measured per move: the box's
    // own hover/active styles can change its size mid-drag, and re-reading it
    // would make the grab offset drift.
    const place = (clientX: number, clientY: number): { x: number; y: number } =>
      placeBox(clientX, clientY, { grabX, grabY, bw, bh, vw: window.innerWidth, vh: window.innerHeight });

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const p = place(ev.clientX, ev.clientY);
      // Coalesced to one write per frame: pointermove can fire well above
      // display rate on a high-polling mouse.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
      });
    };

    const end = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      if (frame) cancelAnimationFrame(frame);
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);

      const p = place(ev.clientX, ev.clientY);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.classList.remove('is-dragging');
      dragging.current = false;
      releaseLock();

      onCommit({ xPct: p.x / window.innerWidth, yPct: p.y / window.innerHeight });
    };

    // Bound to the captured element, not window: pointer capture routes every
    // subsequent event for this pointer here, including ones outside the box.
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={ref}
      className={['draggable-box', className].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      {children}
    </div>
  );
}
