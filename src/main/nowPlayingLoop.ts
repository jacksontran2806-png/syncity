// The now-playing poll and everything that hangs off a track change.
//
// Split out of index.ts because it owns real state — the poll timer, the last
// seen track, the last known repeat state — and index.ts was carrying it purely
// because that's where it was first written. Nothing outside this file touches
// that state; callers get an explicit handle instead.

import type { NowPlaying, RepeatState } from '../shared/types';
import type { NowPlayingProvider } from './providers/types';
import { fetchSyncedLyrics } from './lyrics';
import { extractGlowPalette } from './color';

const POLL_MS = 2000;

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
  getRepeatState: () => RepeatState;
  setRepeatState: (state: RepeatState) => void;
}

export function createNowPlayingLoop({ provider, colorOverrideEnabled, send }: LoopDeps): NowPlayingLoop {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTrackId: string | null | undefined = null;
  let repeatState: RepeatState = 'off';

  /** Palette + lyrics for a newly started track. Both are fire-and-forget: a
   *  failure in either must not stop playback updates. */
  function onTrackChanged(np: NonNullable<Awaited<ReturnType<NowPlayingProvider['getCurrentlyPlaying']>>>): void {
    lastTrackId = np.trackId;
    send('lyrics:update', null);

    if (np.artUrl && !colorOverrideEnabled()) {
      extractGlowPalette(np.artUrl)
        .then((palette) => send('glow:palette', palette))
        .catch((err) => console.error('[color] extraction failed:', err.message));
    }

    fetchSyncedLyrics({
      title: np.title ?? '',
      artist: np.artist ?? '',
      primaryArtist: np.primaryArtist,
      album: np.album,
      durationMs: np.durationMs,
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
      send('now-playing:update', { connected: false } satisfies NowPlaying);
      return;
    }

    let np;
    try {
      np = await provider().getCurrentlyPlaying();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authFailed = message === 'unauthorized';
      send('now-playing:update', {
        connected: !authFailed,
        playing: false,
        error: message,
      } satisfies NowPlaying);
      return;
    }

    if (!np || !np.isPlaying) {
      lastTrackId = null;
      send('now-playing:update', { connected: true, playing: false } satisfies NowPlaying);
      return;
    }

    if (np.repeatState) repeatState = np.repeatState;

    send('now-playing:update', {
      connected: true,
      playing: true,
      title: np.title,
      artist: np.artist,
      album: np.album,
      artUrl: np.artUrl,
      progressMs: np.progressMs,
      durationMs: np.durationMs,
      trackId: np.trackId,
      repeatState: np.repeatState,
      shuffle: np.shuffle,
      // Stamped after the await, so the renderer's extrapolation starts from
      // when the value actually arrived rather than when it was requested.
      receivedAt: Date.now(),
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
    getRepeatState: () => repeatState,
    setRepeatState: (state) => {
      repeatState = state;
    },
  };
}
