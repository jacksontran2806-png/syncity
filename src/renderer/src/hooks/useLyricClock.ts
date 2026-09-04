import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { progressAt } from '../lib/playbackClock';
import { activeLineIndex } from '../lib/lyricsTiming';

/**
 * Where we are in the song, and which line that lands on.
 *
 * Runs off the playback ANCHOR (see lib/playbackClock), not off the poll:
 * every frame this reads one known (position, instant) pair from the store and
 * adds the wall time since. A poll only ever moves the anchor, so a 2s poll
 * interval never shows up as 2s-granular highlighting — and a play or pause
 * from our own transport moves the anchor immediately, so the highlight
 * reacts on the click rather than on the next poll.
 *
 * Drift can't accumulate across a song: each poll replaces the anchor outright
 * rather than adjusting a running total, so error is bounded by one poll
 * interval no matter how long the track is.
 *
 * What this still CANNOT know: how long the audio sits in the output path
 * before it's heard (Bluetooth alone is 150-300ms), and whether this track's
 * LRC file is itself offset. Both read as the highlight running ahead of the
 * vocal, which is why lyricsOffsetMs is user-trimmable and the sync bar can
 * force a fresh position read.
 */
/** Opt-in: `localStorage.setItem('lyriglow:sync-debug','1')`. Logs
 *  expected-vs-actual for every line as it's crossed, per the sync debugging
 *  checklist — a roughly CONSTANT delta across lines means a fixed offset
 *  (the ± trim fixes it), a GROWING delta means real clock drift (shouldn't
 *  happen: the anchor is replaced every poll), an INCONSISTENT delta means bad
 *  data for this specific track (a bad LRCLIB timestamp, or a parsing bug). */
function syncDebugEnabled(): boolean {
  try {
    return localStorage.getItem('lyriglow:sync-debug') === '1';
  } catch {
    return false;
  }
}

export function useLyricClock(): { elapsedMs: number; activeIdx: number } {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    let raf = 0;
    let lastLoggedIdx = -2;
    const debug = syncDebugEnabled();

    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Read through getState rather than subscribing: this effect must NOT
      // be torn down and rebuilt every time a poll lands (which is what
      // depending on the anchor would do, every 2s), and the loop already
      // re-reads at frame rate anyway.
      const { anchor, lyrics, settings } = useStore.getState();
      if (!lyrics?.length) {
        setActiveIdx((prev) => (prev === -1 ? prev : -1));
        return;
      }

      const elapsed = progressAt(anchor, Date.now()) - settings.lyricsOffsetMs;
      const idx = activeLineIndex(lyrics, elapsed);

      // Only write state when the value actually moves. While paused the
      // anchor is frozen, so this settles into a loop that computes and
      // discards — no re-render storm behind a stationary highlight.
      setElapsedMs((prev) => (prev === elapsed ? prev : elapsed));
      setActiveIdx((prev) => (prev === idx ? prev : idx));

      if (debug && idx !== lastLoggedIdx && idx >= 0) {
        lastLoggedIdx = idx;
        const lineStart = lyrics[idx]!.timeMs;
        console.log(
          `[lyric-sync] line ${idx}: lineStart=${lineStart}ms elapsed=${elapsed.toFixed(0)}ms ` +
            `delta=${(elapsed - lineStart).toFixed(0)}ms (should be small & non-negative right after a crossing) ` +
            `| anchor=${anchor.progressMs}ms@${anchor.atMs} playing=${anchor.playing}`
        );
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { elapsedMs, activeIdx };
}
