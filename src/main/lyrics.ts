// DEMO-ONLY lyrics source: LRCLIB (https://lrclib.net), a free/open community
// lyrics DB. It does NOT hold licenses to the underlying lyrics text itself.
// Fine for personal/local use; NOT cleared for a commercially distributed
// product — swap for a licensed provider (e.g. Musixmatch partner API)
// before this ships to anyone else. Flagged in the UI too.
//
// LOOKUP STRATEGY, in order:
//   1. /api/get    — exact match on title + artist + album + duration.
//   2. /api/search — fuzzy, then keep the closest duration within TOLERANCE.
// Each is tried once per artist spelling (see artistCandidates below). Every
// step is failure-tolerant: a 404, a 500, a dropped connection or malformed
// JSON all degrade to "no lyrics for this track" rather than throwing, so one
// bad response can't take out the steps after it.

import { app } from 'electron';
import type { LyricLine } from '../shared/types';
import { parseLrc, pickBestHit, type LrcSearchHit } from './lrc';

/** LRCLIB asks callers to identify themselves so they can spot misbehaving
 *  clients. REPLACE the URL with this project's real repo or a contact
 *  address before distributing — a placeholder is worse than useless to them. */
function userAgent(): string {
  const version = app?.getVersion?.() ?? '0.0.0';
  return `LyriGlow/${version} (https://github.com/your-name/lyriglow)`;
}

/** Lyrics are immutable per track, so one lookup per track id is enough for
 *  the life of the process — a replay, a scrub back, or a palette-override
 *  toggle (which re-runs the track-changed work) all reuse this.
 *
 *  Holds the in-flight PROMISE, not just the result: two lookups for the same
 *  track fired close together then share one request instead of racing. The
 *  stored promise never rejects, so a cached failure can't resurface as an
 *  unhandled rejection later. */
const cache = new Map<string, Promise<LyricLine[] | null>>();
/** Bounded so a long listening session can't grow this without limit. Oldest
 *  entry goes first — Map iterates in insertion order. */
const CACHE_LIMIT = 300;

export interface LrcTrack {
  title: string;
  artist: string;
  primaryArtist: string | null;
  album?: string;
  durationMs?: number;
  /** Cache key. Omit to force a fresh lookup. */
  trackId?: string;
}

/**
 * Time-synced lyrics for a track, or null when there are none.
 *
 * Null is a normal outcome for much of the catalogue — an instrumental, or
 * simply a song nobody has transcribed — and is NOT an error. The renderer
 * shows its own "music is playing" state for it (see NoLyricsIndicator).
 *
 * Only SYNCED lyrics are returned. LRCLIB often has an unsynced `plainLyrics`
 * for a track with no `syncedLyrics`, but every lyric view in this app is
 * time-driven (active line, karaoke fill, Giant Word, the instrumental
 * countdown), so plain text could only be shown by inventing timestamps —
 * confidently-wrong sync, which reads worse than the honest empty state.
 */
export async function fetchSyncedLyrics(track: LrcTrack): Promise<LyricLine[] | null> {
  const key = track.trackId;
  if (key) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const pending = lookup(track);
  if (key) {
    cache.set(key, pending);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
  return pending;
}

/** Drops every cached lookup. For a "lyrics look wrong, try again" path —
 *  nothing calls it yet, but the cache shouldn't be a one-way door. */
export function clearLyricsCache(): void {
  cache.clear();
}

async function lookup(track: LrcTrack): Promise<LyricLine[] | null> {
  const { title, artist, primaryArtist, album, durationMs } = track;
  if (!title.trim()) return null;

  // One line per actual network lookup. A cached track never reaches here, so
  // this doubles as the way to see the cache working: replay a song and there
  // should be no second line for it.
  console.log(`[lyrics] looking up "${title}" — ${primaryArtist ?? artist}`);

  // LRCLIB indexes by the track's primary/featured artist, not Spotify's full
  // joined credit string (e.g. "Metro Boomin, A$AP Rocky, Roisee") — that
  // joined form matches nothing. Try the primary artist first, then the full
  // string as a fallback.
  const artistCandidates = [...new Set([primaryArtist, artist].filter(Boolean))] as string[];
  if (!artistCandidates.length) return null;

  // Exact match for every spelling first: a /api/get hit is the right
  // recording by definition, so it beats any fuzzy result.
  for (const a of artistCandidates) {
    const exact = await tryExactGet({ title, artist: a, album, durationMs });
    if (exact) return exact;
  }
  for (const a of artistCandidates) {
    const found = await trySearchFallback({ title, artist: a, durationMs });
    if (found) return found;
  }
  console.log(`[lyrics] no synced lyrics found for "${title}"`);
  return null;
}

/** GETs JSON from LRCLIB, or null for any failure at all (HTTP error, network
 *  drop, unparseable body). Callers treat null as "this step found nothing",
 *  which keeps one bad response from aborting the steps that follow it. */
async function getJson(url: string): Promise<unknown | null> {
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': userAgent() } });
    // 404 is LRCLIB's ordinary "no match", not a fault worth logging.
    if (resp.status === 404) return null;
    if (!resp.ok) {
      console.warn(`[lyrics] LRCLIB responded ${resp.status} for ${url}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.warn('[lyrics] LRCLIB request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// /api/get requires an exact title+artist+album+duration match — a remaster
// tag or rounding on any of those is enough to miss even when the song exists.
async function tryExactGet(opts: {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
}): Promise<LyricLine[] | null> {
  const params = new URLSearchParams({ track_name: opts.title, artist_name: opts.artist });
  if (opts.album) params.set('album_name', opts.album);
  if (opts.durationMs) params.set('duration', String(Math.round(opts.durationMs / 1000)));

  const data = (await getJson(`https://lrclib.net/api/get?${params.toString()}`)) as {
    syncedLyrics?: string | null;
  } | null;
  if (!data?.syncedLyrics) return null;
  return parseLrc(data.syncedLyrics);
}

// /api/search is fuzzy (no album or duration constraint), so the duration is
// what tells a match apart from a live cut or an extended remix of the same
// title. Closest within tolerance wins; nothing within tolerance means no
// confident match, which is better than showing lyrics that drift.
async function trySearchFallback(opts: {
  title: string;
  artist: string;
  durationMs?: number;
}): Promise<LyricLine[] | null> {
  const params = new URLSearchParams({ track_name: opts.title, artist_name: opts.artist });
  const data = await getJson(`https://lrclib.net/api/search?${params.toString()}`);
  if (!Array.isArray(data)) return null;

  const best = pickBestHit(data as LrcSearchHit[], opts.durationMs ? opts.durationMs / 1000 : null);
  return best?.syncedLyrics ? parseLrc(best.syncedLyrics) : null;
}
