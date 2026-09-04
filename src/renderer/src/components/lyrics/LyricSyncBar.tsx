import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';

/** Nudge step. Bracket keys do the same thing without aiming at a button. */
const NUDGE_MS = 250;
const FLASH_MS = 1400;

/**
 * Lyric timing trim.
 *
 * Two different fixes, deliberately kept as two controls:
 *   ± offset — persistent, for output latency (Bluetooth, DAC) and per-track
 *              LRC offsets. Neither is knowable from any API.
 *   Resync   — one-shot re-read of the playback position, for drift since the
 *              last poll and for seeks. Does nothing about output latency.
 */
export function LyricSyncBar(): JSX.Element {
  const offsetMs = useStore((s) => s.settings.lyricsOffsetMs);
  const updateSettings = useStore((s) => s.updateSettings);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const setOffset = (ms: number) => void updateSettings({ lyricsOffsetMs: ms });

  useEffect(() => {
    // Reads the offset from the store rather than closing over it, so the
    // listener registers once instead of on every render.
    const onKey = (e: KeyboardEvent) => {
      const current = useStore.getState().settings.lyricsOffsetMs;
      if (e.key === '[') setOffset(current - NUDGE_MS);
      else if (e.key === ']') setOffset(current + NUDGE_MS);
      else if (e.key === '\\') setOffset(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateSettings]);

  const resync = async () => {
    await window.syncity.syncPlayback();
    setFlash('Resynced');
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), FLASH_MS);
  };

  return (
    <div className="lyrics-sync" data-hitregion>
      <button type="button" className="lyrics-sync-btn" title="Lyrics earlier ( [ )" onClick={() => setOffset(offsetMs - NUDGE_MS)}>
        −
      </button>
      <button type="button" className="lyrics-sync-offset" title="Click to reset offset ( \ )" onClick={() => setOffset(0)}>
        {`${offsetMs > 0 ? '+' : ''}${(offsetMs / 1000).toFixed(2)}s`}
      </button>
      <button type="button" className="lyrics-sync-btn" title="Lyrics later ( ] )" onClick={() => setOffset(offsetMs + NUDGE_MS)}>
        +
      </button>
      <button type="button" className="lyrics-sync-resync" onClick={resync}>
        {flash || 'Resync'}
      </button>
    </div>
  );
}
