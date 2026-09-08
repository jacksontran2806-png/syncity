import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { progressAt } from '../../lib/playbackClock';

/** Nudge step. Bracket keys do the same thing without aiming at a button. */
const NUDGE_MS = 250;
const FLASH_MS = 1400;
/** Under this, the fresh read agreed with where the clock already was, and
 *  saying "+0.03s" would read as noise. Roughly one poll's worth of jitter. */
const IN_SYNC_MS = 120;

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

  // Reports the correction it actually made, rather than a flat "Resynced".
  // Most of the time the clock was already right and the honest answer is "in
  // sync" — without that the button looks broken every time it works, which
  // is precisely the case it can't distinguish from doing nothing at all.
  const resync = async () => {
    const before = progressAt(useStore.getState().anchor, Date.now());
    let message: string;
    try {
      await window.syncity.syncPlayback();
      // The new position arrives as a separate nowPlaying event, not as the
      // invoke's return value; yield a frame so the store has it.
      await new Promise(requestAnimationFrame);
      const delta = progressAt(useStore.getState().anchor, Date.now()) - before;
      message =
        Math.abs(delta) < IN_SYNC_MS
          ? 'In sync'
          : `${delta > 0 ? '+' : '−'}${(Math.abs(delta) / 1000).toFixed(2)}s`;
    } catch {
      message = 'Failed';
    }
    setFlash(message);
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
