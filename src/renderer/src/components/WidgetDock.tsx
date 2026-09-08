import { useCallback, useRef, useState } from 'react';
import { useStore } from '../store';
import { useAutoHide } from '../hooks/useAutoHide';
import { useNotchHover } from '../hooks/useNotchHover';
import { Widget } from './Widget';
import { PillWave } from './PillWave';
import { DraggableBox, type PlacementEnv } from './DraggableBox';
import { useSlideTransition } from '../hooks/useSlideTransition';
// Shared with Notch mode's reveal band — see lib/hoverTiming for why the
// number lives in one place now.
import { HOVER_EXPAND_DELAY_MS } from '../lib/hoverTiming';



interface Props {
  expandSignal: number;
}

export function WidgetDock({ expandSignal }: Props): JSX.Element {
  const settings = useStore((s) => s.settings);
  const panel = useStore((s) => s.panel);
  const updateSettings = useStore((s) => s.updateSettings);
  const nowPlaying = useStore((s) => s.nowPlaying);

  const mode = settings.overlayMode;
  const isNotch = mode === 'notch';

  const boxRef = useRef<HTMLDivElement | null>(null);
  const notchHovered = useNotchHover(isNotch, boxRef);

  // Keyed on the track id so a genuine song change animates, while the poll
  // re-sending the same track every few seconds does not.
  const pillLayers = useSlideTransition(nowPlaying.artUrl ?? null, nowPlaying.trackId ?? 'none', 420);

  const collapsed = useAutoHide(settings.autoHideWidget && !settings.widgetLocked, expandSignal) && panel === 'none';
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  // While a drag is in progress the pointer necessarily sits over the pill
  // for as long as the gesture lasts — without this, a slow drag would trip
  // the hover-expand timer and swap the pill out for the full widget out from
  // under the cursor mid-gesture (see DraggableBox's onDragStateChange).
  const draggingRef = useRef(false);
  const handleHoverChange = useCallback((isHovered: boolean) => {
    if (draggingRef.current) return;
    clearTimeout(hoverTimer.current);
    if (isHovered) hoverTimer.current = setTimeout(() => setHovered(true), HOVER_EXPAND_DELAY_MS);
    else setHovered(false);
  }, []);
  // Mirrors showPill so handleDragStateChange (a stable callback) can read the
  // current value without depending on it and getting recreated every render.
  const showPillRef = useRef(false);
  const handleDragStateChange = useCallback((isDragging: boolean, moved: boolean) => {
    draggingRef.current = isDragging;
    if (isDragging) {
      clearTimeout(hoverTimer.current);
      setHovered(false); // keep the pill a pill for the whole gesture
    } else if (!moved && showPillRef.current) {
      // A real click on the pill (no meaningful movement): expand right away,
      // same as a completed hover. Gated on showPillRef so an ordinary click
      // on the already-expanded widget's own chrome doesn't also set hovered
      // — that would go stale and suppress the pill forever the next time
      // auto-hide collapses (hovered only ever gets cleared by mouseleave or
      // a fresh hover-timer run, neither of which fires while expanded).
      setHovered(true);
    }
  }, []);

  // Notch mode is a collapsed notch by definition: it sits closed until the
  // reveal band is entered, regardless of the auto-hide setting or the idle
  // timer. The lock button still wins, and an open panel still holds it open.
  const showPill = isNotch
    ? !notchHovered && !settings.widgetLocked && panel === 'none'
    : collapsed && !hovered;
  showPillRef.current = showPill;

  // Notch: flush to the top edge, horizontally centred — the safe-area offset
  // is deliberately ignored, since "flush against the edge" IS the mode.
  // Free: centred on the top edge below the safe-area offset, until dragged.
  const placement = useCallback(
    ({ vw, vh, bw }: PlacementEnv) => ({
      x: (vw - bw) / 2,
      y: isNotch ? 0 : Math.min(settings.safeAreaOffsetPx, vh - 40),
    }),
    [isNotch, settings.safeAreaOffsetPx]
  );

  const commit = useCallback(
    (widgetPosition: { xPct: number; yPct: number }) => {
      void updateSettings({ widgetPosition });
    },
    [updateSettings]
  );

  return (
    <DraggableBox
      className={`widget-dock ${showPill ? 'is-pill' : ''} ${isNotch ? 'is-notch' : ''}`}
      // Only Free mode restores a saved position; Notch computes its own
      // placement every time, so a position saved in Free never drags the
      // notch off the top edge — it just waits for the next switch back.
      draggable={mode === 'free'}
      elementRef={boxRef}
      position={mode === 'free' ? settings.widgetPosition : null}
      onCommit={commit}
      defaultPlacement={placement}
      onHoverChange={isNotch ? undefined : handleHoverChange}
      onDragStateChange={handleDragStateChange}
    >
      {showPill ? (
        <div
          className={`widget-pill widget-anim-${settings.widgetCollapseAnimation}-collapse`}
          data-hitregion
          title={
            isNotch
              ? 'Syncity — hover the notch to open, or press Ctrl+Alt+L'
              : 'Syncity — click or hover to expand, drag to move, or press Ctrl+Alt+L'
          }
        >
          {/* Track changes slide the artwork sideways rather than cutting to
              the new cover — the same treatment the expanded widget and Album
              mode already use, so a change reads as movement at any size. */}
          <div className="widget-pill-art">
            {pillLayers.map((layer) => (
              <div key={layer.key} className={`widget-pill-slide widget-pill-slide-${layer.place}`}>
                {layer.value ? (
                  <img src={layer.value} alt="" />
                ) : (
                  <span className="widget-pill-dot" />
                )}
              </div>
            ))}
          </div>
          <PillWave />
        </div>
      ) : (
        <Widget />
      )}
    </DraggableBox>
  );
}
