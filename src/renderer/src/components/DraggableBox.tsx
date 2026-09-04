import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { acquireClickThroughLock } from '../lib/clickThroughLock';
import { placeBox, resolvePosition } from '../lib/dragMath';
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
  /** False pins the box to defaultPlacement — a pointer-down never starts a
   *  drag. Notch mode owns its placement (flush to the top edge) and Default
   *  mode parks it; only Free mode lets the user move it. */
  draggable?: boolean;
  /** Exposes the box element for hit-testing outside the React tree (Notch
   *  mode's reveal band measures it — see useNotchHover). */
  elementRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** Committed position, as a fraction of the viewport. null = defaultPlacement. */
  position: WidgetPosition | null;
  /** Called ONCE, on pointer-up. Dragging never writes to settings mid-gesture:
   *  a settings round-trip per pointermove is an IPC call per frame. */
  onCommit: (position: WidgetPosition) => void;
  /** Where the box sits before it has ever been dragged. Gets real measured
   *  box dimensions, so "centred" means centred, not left-edge-at-centre. */
  defaultPlacement: (env: PlacementEnv) => { x: number; y: number };
  onHoverChange?: (hovered: boolean) => void;
  /** Fires at the start of a gesture (moved=false, drag not yet confirmed)
   *  and again at pointer-up (moved = whether it actually traveled past the
   *  click/drag threshold). Lets a caller like WidgetDock suppress its own
   *  hover-expand timer for the whole gesture — otherwise a slow drag could
   *  get swapped out from under the cursor mid-gesture when the hover timer
   *  fires on its own schedule. */
  onDragStateChange?: (dragging: boolean, moved: boolean) => void;
  children: React.ReactNode;
}

/** Below this, a gesture reads as a click (or an accidental jitter), not a
 *  drag — matters for callers that treat pointerup-without-movement as a
 *  click (e.g. tap-to-expand on the collapsed pill). */
const DRAG_THRESHOLD_PX = 4;

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
  draggable = true,
  elementRef,
  position,
  onCommit,
  defaultPlacement,
  onHoverChange,
  onDragStateChange,
  children,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  /** Set while a drag is in flight; see the unmount effect below. */
  const abortDrag = useRef<(() => void) | null>(null);

  // An unmount mid-drag would otherwise strand the pointer listeners AND the
  // click-through lock — and a stranded lock keeps click-through off for good,
  // so the overlay would swallow every mouse event on the screen.
  useEffect(() => () => abortDrag.current?.(), []);

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

  // The box's own size changes when it swaps between pill and full widget, and
  // a centred placement is computed FROM that width — without this it would
  // keep the left it was given as a pill and sit off-centre once expanded
  // (very visible in Notch mode, where centring is the whole look).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => applyPosition());
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyPosition]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!draggable || !el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(NO_DRAG)) return;

    const box = el.getBoundingClientRect();
    // Grab offset: the box keeps its position under the cursor instead of
    // jumping so its corner meets the pointer.
    const grabX = e.clientX - box.left;
    const grabY = e.clientY - box.top;
    const bw = box.width;
    const bh = box.height;
    const startX = e.clientX;
    const startY = e.clientY;
    let maxDist = 0;

    dragging.current = true;
    el.classList.add('is-dragging');
    onDragStateChange?.(true, false);
    const releaseLock = acquireClickThroughLock();

    // setPointerCapture throws NotFoundError if the pointer id isn't active any
    // more — a pointer released in the same tick, or an injected/synthetic
    // event (accessibility and remote-input tools do produce these). Letting
    // that propagate would abandon the gesture AFTER the click-through lock was
    // taken but BEFORE the pointerup listener that releases it exists, leaving
    // the lock held forever: click-through stays off and the overlay swallows
    // every mouse event on the screen until the app restarts. Unwinding is the
    // only safe response.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      el.classList.remove('is-dragging');
      dragging.current = false;
      onDragStateChange?.(false, false);
      releaseLock();
      return;
    }

    let frame = 0;

    // Box size is captured at pointer-down, not measured per move: the box's
    // own hover/active styles can change its size mid-drag, and re-reading it
    // would make the grab offset drift.
    const place = (clientX: number, clientY: number): { x: number; y: number } =>
      placeBox(clientX, clientY, { grabX, grabY, bw, bh, vw: window.innerWidth, vh: window.innerHeight });

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      maxDist = Math.max(maxDist, Math.hypot(ev.clientX - startX, ev.clientY - startY));
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
      abortDrag.current = null;
      releaseLock();

      const moved = maxDist > DRAG_THRESHOLD_PX;
      onDragStateChange?.(false, moved);
      onCommit({ xPct: p.x / window.innerWidth, yPct: p.y / window.innerHeight });
    };

    // Teardown without the commit half, for when the box goes away mid-gesture
    // (a mode switch or a view change can unmount it under the cursor). Only
    // the listeners and the click-through lock matter then — committing a
    // position while unmounting would both write a half-finished drag and set
    // state on a dead tree.
    abortDrag.current = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      if (frame) cancelAnimationFrame(frame);
      el.classList.remove('is-dragging');
      dragging.current = false;
      releaseLock();
      abortDrag.current = null;
    };

    // Bound to the captured element, not window: pointer capture routes every
    // subsequent event for this pointer here, including ones outside the box.
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  return (
    <div
      ref={(node) => {
        ref.current = node;
        if (elementRef) elementRef.current = node;
      }}
      className={['draggable-box', className].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      {children}
    </div>
  );
}
