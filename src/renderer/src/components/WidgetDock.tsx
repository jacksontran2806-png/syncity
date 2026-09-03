import { useCallback, useState } from 'react';
import { useStore } from '../store';
import { useAutoHide } from '../hooks/useAutoHide';
import { Widget } from './Widget';
import { DraggableBox, type PlacementEnv } from './DraggableBox';

interface Props {
  expandSignal: number;
}

export function WidgetDock({ expandSignal }: Props): JSX.Element {
  const settings = useStore((s) => s.settings);
  const panel = useStore((s) => s.panel);
  const updateSettings = useStore((s) => s.updateSettings);
  const nowPlaying = useStore((s) => s.nowPlaying);

  const collapsed = useAutoHide(settings.autoHideWidget, expandSignal) && panel === 'none';
  const [hovered, setHovered] = useState(false);
  const showPill = collapsed && !hovered;

  // Undragged default: centred on the top edge, below any safe-area offset.
  const placement = useCallback(
    ({ vw, vh, bw }: PlacementEnv) => ({ x: (vw - bw) / 2, y: Math.min(settings.safeAreaOffsetPx, vh - 40) }),
    [settings.safeAreaOffsetPx]
  );

  const commit = useCallback(
    (widgetPosition: { xPct: number; yPct: number }) => {
      void updateSettings({ widgetPosition });
    },
    [updateSettings]
  );

  return (
    <DraggableBox
      className={`widget-dock ${showPill ? 'is-pill' : ''}`}
      position={settings.widgetPosition}
      onCommit={commit}
      defaultPlacement={placement}
      onHoverChange={setHovered}
    >
      {showPill ? (
        <div className="widget-pill" data-hitregion title="LyriGlow — hover, drag, or press Ctrl+Alt+L">
          {nowPlaying.artUrl ? <img src={nowPlaying.artUrl} alt="" /> : <span className="widget-pill-dot" />}
          <span className="widget-pill-glow" />
        </div>
      ) : (
        <Widget />
      )}
    </DraggableBox>
  );
}
