// The LRC format itself: parsing timestamped text, and picking which of
// LRCLIB's search hits actually matches the track that's playing.
//
// Split from lyrics.ts so it stays pure — no electron, no fetch — which is
// what lets the test suite exercise it directly. lyrics.ts keeps the I/O.

import type { LyricLine } from '../shared/types';

/** How far a search hit's duration may sit from the track we're playing before
 *  it's assumed to be a different recording (live cut, edit, extended remix). */
export const DURATION_TOLERANCE_S = 2;

/**
 * LRC text to the app's timed lines.
 *
 * Deliberately permissive about the timestamp shape: minutes and seconds may
 * be one or two digits, and the fraction may be centiseconds, milliseconds, or
 * absent entirely — all of which appear in real LRCLIB payloads.
 *
 * One line can carry SEVERAL timestamps (`[00:12.30][02:41.10] same chorus`),
 * so each becomes its own entry. Metadata headers like `[ar:...]` or
 * `[length:03:12]` don't match the digits-first pattern and drop out on their
 * own.
 *
 * Empty-text entries are KEPT: an `[01:20.00]` with nothing after it is the
 * file saying "singing stops here", which is exactly what the instrumental
 * detector downstream needs to see.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const stampRe = /\[(\d+):(\d+)(?:[.:](\d{1,3}))?\]/g;
  const lines: LyricLine[] = [];

  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(stampRe)];
    if (!stamps.length) continue;
    const text = raw.replace(stampRe, '').trim();

    for (const m of stamps) {
      const min = parseInt(m[1]!, 10);
      const sec = parseInt(m[2]!, 10);
      // '5' -> 500ms, '05' -> 50ms, '050' -> 50ms: pad out to milliseconds,
      // then clamp to three digits so a longer fraction can't inflate it.
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      if (Number.isNaN(min) || Number.isNaN(sec)) continue;
      lines.push({ timeMs: min * 60_000 + sec * 1_000 + ms, text });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

export interface LrcSearchHit {
  syncedLyrics?: string | null;
  duration?: number;
}

/**
 * The search hit whose duration sits closest to the playing track, or null if
 * the closest one is still outside the tolerance — no confident match beats a
 * confident wrong one, because lyrics for a different cut of the same song
 * drift further apart the longer they play.
 *
 * Hits without synced lyrics are ignored entirely: an unsynced result can't
 * drive any of this app's lyric views. With no duration to compare against,
 * LRCLIB's own ranking is the only signal, so the first synced hit wins.
 */
export function pickBestHit(
  hits: LrcSearchHit[],
  targetSec: number | null,
  toleranceS: number = DURATION_TOLERANCE_S
): LrcSearchHit | null {
  const synced = hits.filter((h) => typeof h.syncedLyrics === 'string' && h.syncedLyrics.length > 0);
  if (!synced.length) return null;
  if (targetSec == null) return synced[0]!;

  const gapOf = (h: LrcSearchHit) => (typeof h.duration === 'number' ? Math.abs(h.duration - targetSec) : Infinity);
  const best = synced.reduce((a, b) => (gapOf(b) < gapOf(a) ? b : a));
  return gapOf(best) > toleranceS ? null : best;
}
