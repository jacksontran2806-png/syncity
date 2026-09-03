import { useEffect, useState } from 'react';
import { useStore } from '../../store';

/**
 * Where we are in the song, and which line that lands on.
 *
 * Playback position is polled every 2.5s and extrapolated from the local clock
 * in between. Two things that estimate CANNOT know: how long the audio sits in
 * the output path before it's heard (Bluetooth alone is 150-300ms), and whether
 * this track's LRC file is offset. Both show up as the highlight running ahead
 * of the vocal, which is why lyricsOffsetMs is user-trimmable and the sync bar
 * can force a fresh position read.
 */
/** Opt-in: `localStorage.setItem('lyriglow:sync-debug','1')`. Logs
 *  expected-vs-actual for every line as it's crossed, per the sync debugging
 *  checklist — a roughly CONSTANT delta across lines means a fixed offset
 *  (the ± trim fixes it), a GROWING delta means real clock drift (shouldn't
 *  happen: the clock resyncs to the reported position every poll — see
 *  nowPlayingLoop.ts POLL_MS), an INCONSISTENT delta means bad data for this
 *  specific track (a bad LRCLIB timestamp, or a parsing bug). */
function syncDebugEnabled(): boolean {
  try {
    return localStorage.getItem('lyriglow:sync-debug') === '1';
  } catch {
    return false;
  }
}

export function useLyricClock(): { elapsedMs: number; activeIdx: number } {
  const lyrics = useStore((s) => s.lyrics);
  const playing = useStore((s) => s.nowPlaying.playing);
  const progressMs = useStore((s) => s.nowPlaying.progressMs);
  const receivedAt = useStore((s) => s.nowPlaying.receivedAt);
  const offsetMs = useStore((s) => s.settings.lyricsOffsetMs);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    let raf = 0;
    let lastLoggedIdx = -2;
    const debug = syncDebugEnabled();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!lyrics?.length || !playing || receivedAt == null) return;

      // The clock is reset to the API's reported position (progressMs) on
      // every poll and only extrapolated by wall-clock delta in between — so
      // this can't accumulate drift across a whole song, only within one poll
      // interval (see nowPlayingLoop.ts POLL_MS).
      const elapsed = (progressMs ?? 0) + (Date.now() - receivedAt) - offsetMs;
      setElapsedMs(elapsed);

      // Lines are sorted, so the active one is the last whose timestamp has
      // passed — break on the first that hasn't.
      let idx = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i]!.timeMs <= elapsed) idx = i;
        else break;
      }
      setActiveIdx(idx);

      if (debug && idx !== lastLoggedIdx && idx >= 0) {
        lastLoggedIdx = idx;
        const lineStart = lyrics[idx]!.timeMs;
        console.log(
          `[lyric-sync] line ${idx}: lineStart=${lineStart}ms elapsed=${elapsed.toFixed(0)}ms ` +
            `delta=${(elapsed - lineStart).toFixed(0)}ms (should be small & non-negative right after a crossing)`
        );
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyrics, playing, progressMs, receivedAt, offsetMs]);

  return { elapsedMs, activeIdx };
}
