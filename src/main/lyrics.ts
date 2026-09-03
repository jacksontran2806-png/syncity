// DEMO-ONLY lyrics source: LRCLIB (https://lrclib.net), a free/open community
// lyrics DB. It does NOT hold licenses to the underlying lyrics text itself.
// Fine for personal/local use; NOT cleared for a commercially distributed
// product — swap for a licensed provider (e.g. Musixmatch partner API)
// before this ships to anyone else. Flagged in the UI too.

import type { LyricLine } from '../shared/types';

interface LrcTrack {
  title: string;
  artist: string;
  primaryArtist: string | null;
  album?: string;
  durationMs?: number;
}

export async function fetchSyncedLyrics(track: LrcTrack): Promise<LyricLine[] | null> {
  const { title, artist, primaryArtist, album, durationMs } = track;
  // LRCLIB indexes by the track's primary/featured artist, not Spotify's
  // full joined credit string (e.g. "Metro Boomin, A$AP Rocky, Roisee") —
  // that joined form matches nothing. Try primary artist first, then the
  // full string as a fallback.
  const artistCandidates = [...new Set([primaryArtist, artist].filter(Boolean))] as string[];

  for (const a of artistCandidates) {
    const exact = await tryExactGet({ title, artist: a, album, durationMs });
    if (exact) return exact;
  }
  for (const a of artistCandidates) {
    const found = await trySearchFallback({ title, artist: a, durationMs });
    if (found) return found;
  }
  return null;
}

// /api/get requires an exact title+artist+album+duration match — a remaster
// tag or rounding on any of those is enough to 404 even when the song exists.
async function tryExactGet(opts: { title: string; artist: string; album?: string; durationMs?: number }): Promise<LyricLine[] | null> {
  const params = new URLSearchParams({ track_name: opts.title, artist_name: opts.artist });
  if (opts.album) params.set('album_name', opts.album);
  if (opts.durationMs) params.set('duration', String(Math.round(opts.durationMs / 1000)));

  const resp = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`lrclib_get_${resp.status}`);
  const data = (await resp.json()) as { syncedLyrics?: string };
  if (!data.syncedLyrics) return null;
  return parseLrc(data.syncedLyrics);
}

// /api/search is fuzzy (no album/duration requirement) — pick the candidate
// with synced lyrics whose duration is closest to Spotify's.
async function trySearchFallback(opts: { title: string; artist: string; durationMs?: number }): Promise<LyricLine[] | null> {
  const params = new URLSearchParams({ track_name: opts.title, artist_name: opts.artist });
  const resp = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
  if (!resp.ok) throw new Error(`lrclib_search_${resp.status}`);
  const results = (await resp.json()) as { syncedLyrics?: string; duration: number }[];
  if (!Array.isArray(results) || !results.length) return null;

  const targetSec = opts.durationMs ? opts.durationMs / 1000 : null;
  const candidates = results.filter(
    (r): r is { syncedLyrics: string; duration: number } => !!r.syncedLyrics
  );
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (targetSec == null) return 0;
    return Math.abs(a.duration - targetSec) - Math.abs(b.duration - targetSec);
  });

  const best = candidates[0];
  if (targetSec != null && Math.abs(best.duration - targetSec) > 5) return null; // too far off, likely wrong song
  return parseLrc(best.syncedLyrics);
}

function parseLrc(lrc: string): LyricLine[] {
  const lineRe = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const matches = [...raw.matchAll(lineRe)];
    if (!matches.length) continue;
    const text = raw.replace(lineRe, '').trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      lines.push({ timeMs: min * 60000 + sec * 1000 + ms, text });
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}
