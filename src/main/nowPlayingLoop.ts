// The now-playing poll and everything that hangs off a track change.
//
// Split out of index.ts because it owns real state — the poll timer and the
// last seen track — and index.ts was carrying it purely because that's where
// it was first written. Nothing outside this file touches that state; callers
// get an explicit handle instead.

import type { NowPlaying } from '../shared/types';
import type { NowPlayingProvider } from './providers/types';
import { fetchSyncedLyrics } from './lyrics';
import { extractAlbumPalette } from './color';

const POLL_MS = 2000;

/** Ceiling on the half-round-trip added to a reported position. Past this the
 *  request was slow enough that the measurement says nothing dependable about
 *  where playback is. */
const MAX_LATENCY_CORRECTION_MS = 1500;

export interface LoopDeps {
  /** Resolved per call, not captured: the user can switch music source at any
   *  time and the next tick must follow it. */
  provider: () => NowPlayingProvider;
  /** True while an album-colour override is on, which suppresses extraction. */
  colorOverrideEnabled: () => boolean;
  send: (channel: string, payload?: unknown) => void;
}

export interface NowPlayingLoop {
  /** One poll now, out of band. Also the Resync path from the lyrics view. */
  tick: () => Promise<void>;
  start: () => void;
  stop: () => void;
  /** Forget the current track so the next tick re-runs the track-change work
   *  (palette extraction, lyrics fetch). */
  forgetTrack: () => void;
}

/** Builds the poll loop. Nothing runs until start(); the returned handle owns
 *  the timer, so callers never touch it directly. */
export function createNowPlayingLoop({ provider, colorOverrideEnabled, send }: LoopDeps): NowPlayingLoop {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTrackId: string | null | undefined = null;

  /** Palette + lyrics for a newly started track. Both are fire-and-forget: a
   *  failure in either must not stop playback updates. */
  function onTrackChanged(np: NonNullable<Awaited<ReturnType<NowPlayingProvider['getCurrentlyPlaying']>>>): void {
    lastTrackId = np.trackId;
    send('lyrics:update', null);

    if (np.artUrl && !colorOverrideEnabled()) {
      extractAlbumPalette(np.artUrl)
        .then((palette) => send('palette:update', palette))
        .catch((err) => console.error('[color] extraction failed:', err.message));
    }

    fetchSyncedLyrics({
      title: np.title ?? '',
      artist: np.artist ?? '',
      primaryArtist: np.primaryArtist,
      album: np.album,
      durationMs: np.durationMs,
      // Cache key: a replay of the same track, or a re-run of this work after
      // a palette-override toggle, reuses the first lookup instead of hitting
      // LRCLIB again.
      trackId: np.trackId,
    })
      .then((lines) => {
        // The track may have changed again while this was in flight — dropping
        // the result is correct, it belongs to a song that is no longer playing.
        if (np.trackId !== lastTrackId) return;
        send('lyrics:update', lines);
      })
      .catch((err) => console.error('[lyrics] fetch failed:', err.message));
  }

  async function tick(): Promise<void> {
    if (!provider().isAuthed()) {
      send('nowPlaying:update', { connected: false } satisfies NowPlaying);
      return;
    }

    let np;
    // Measured per poll, never assumed: the position Spotify reports was true
    // when IT read the clock, and the answer then spent the trip home getting
    // here. Half the round trip is the standard estimate of that one-way leg.
    // A hardcoded constant would be wrong on every network but the one it was
    // tuned on, and wrong again on that one whenever it hiccups.
    const sentAt = Date.now();
    try {
      np = await provider().getCurrentlyPlaying();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authFailed = message === 'unauthorized';
      send('nowPlaying:update', {
        connected: !authFailed,
        playing: false,
        error: message,
      } satisfies NowPlaying);
      return;
    }

    if (!np || !np.isPlaying) {
      lastTrackId = null;
      send('nowPlaying:update', { connected: true, playing: false } satisfies NowPlaying);
      return;
    }

    const receivedAt = Date.now();
    // Clamped because the correction is only a good estimate while the trip is
    // symmetric and short. A multi-second round trip (a stall, a sleeping
    // laptop waking mid-request) says nothing useful about where the track is,
    // and half of it would be a large confident fudge in the wrong direction.
    const oneWayMs = Math.min(MAX_LATENCY_CORRECTION_MS, Math.max(0, Math.round((receivedAt - sentAt) / 2)));

    send('nowPlaying:update', {
      connected: true,
      playing: true,
      title: np.title,
      artist: np.artist,
      album: np.album,
      artUrl: np.artUrl,
      // Advanced by the trip home: the track kept playing while the answer was
      // in flight. Only when it's actually playing — a paused position doesn't
      // move, so "correcting" it would just introduce error.
      progressMs: (np.progressMs ?? 0) + oneWayMs,
      durationMs: np.durationMs,
      trackId: np.trackId,
      shuffle: np.shuffle,
      // Stamped after the await, so the renderer's extrapolation starts from
      // when the value actually arrived rather than when it was requested.
      receivedAt,
      pollLatencyMs: receivedAt - sentAt,
    } satisfies NowPlaying);

    if (np.trackId !== lastTrackId) onTrackChanged(np);
  }

  return {
    tick,
    start() {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, POLL_MS);
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    forgetTrack() {
      lastTrackId = null;
    },
  };
}
