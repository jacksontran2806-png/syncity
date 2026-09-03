// DEMO-ONLY lyrics source: LRCLIB (https://lrclib.net), a free/open community
// lyrics DB. It does NOT hold licenses to the underlying lyrics text itself —
// see the writeup in chat. Fine for a local prototype you run for yourself;
// NOT cleared for a commercially distributed product. Swap for a licensed
// provider (e.g. Musixmatch partner API) before this ships to anyone else.

async function fetchSyncedLyrics({ title, artist, primaryArtist, album, durationMs }) {
  // LRCLIB indexes by the track's primary/featured artist, not the full
  // joined credit string Spotify gives us (e.g. "Metro Boomin, A$AP Rocky,
  // Roisee") — that joined form matches nothing. Try primary artist first,
  // fall back to the full string in case LRCLIB happens to have it that way.
  const artistCandidates = [...new Set([primaryArtist, artist].filter(Boolean))];

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
async function tryExactGet({ title, artist, album, durationMs }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (album) params.set('album_name', album);
  if (durationMs) params.set('duration', String(Math.round(durationMs / 1000)));

  const resp = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`lrclib_get_${resp.status}`);
  const data = await resp.json();
  if (!data.syncedLyrics) return null;
  return parseLrc(data.syncedLyrics);
}

// /api/search is fuzzy (no album/duration requirement) and returns candidates —
// pick the one with synced lyrics whose duration is closest to Spotify's.
async function trySearchFallback({ title, artist, durationMs }) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const resp = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
  if (!resp.ok) throw new Error(`lrclib_search_${resp.status}`);
  const results = await resp.json();
  if (!Array.isArray(results) || !results.length) return null;

  const targetSec = durationMs ? durationMs / 1000 : null;
  const candidates = results.filter((r) => r.syncedLyrics);
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (targetSec == null) return 0;
    return Math.abs(a.duration - targetSec) - Math.abs(b.duration - targetSec);
  });

  const best = candidates[0];
  if (targetSec != null && Math.abs(best.duration - targetSec) > 5) return null; // too far off, likely wrong song
  return parseLrc(best.syncedLyrics);
}

function parseLrc(lrc) {
  const lineRe = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  const lines = [];
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

module.exports = { fetchSyncedLyrics };
