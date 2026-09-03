import { useCallback } from 'react';
import { useStore } from '../store';
import { DraggableBox, type PlacementEnv } from './DraggableBox';
import { SettingsPanel } from './SettingsPanel';

/**
 * Settings as its own floating window, independent of the widget.
 *
 * It used to be a child of the widget dock, which meant it inherited the
 * widget's position, grew the dock's hit region, and could not be moved out of
 * the way of what it was configuring. It is now a peer: its own box, its own
 * persisted position, dragged by its header.
 */
export function SettingsWindow(): JSX.Element {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setPanel = useStore((s) => s.setPanel);

  // Undragged default: right side, clear of the top-centre widget.
  const placement = useCallback(
    ({ vw, vh, bw, bh }: PlacementEnv) => ({
      x: Math.max(0, vw - bw - 48),
      y: Math.max(0, Math.min(72, vh - bh)),
    }),
    []
  );

  const commit = useCallback(
    (settingsPosition: { xPct: number; yPct: number }) => {
      void updateSettings({ settingsPosition });
    },
    [updateSettings]
  );

  return (
    <DraggableBox
      className="settings-window"
      position={settings.settingsPosition}
      onCommit={commit}
      defaultPlacement={placement}
    >
      <SettingsPanel onClose={() => setPanel('none')} />
    </DraggableBox>
  );
}
