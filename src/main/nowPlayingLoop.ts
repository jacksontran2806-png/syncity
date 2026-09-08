// The now-playing poll and everything that hangs off a track change.
//
// Split out of index.ts because it owns real state — the poll timer and the
// last seen track — and index.ts was carrying it purely because that's where
// it was first written. Nothing outside this file touches that state; callers
// get an explicit handle instead.

import type { NowPlaying } from '../shared/types';
import { RateLimitError, type NowPlayingProvider } from './providers/types';
import { fetchSyncedLyrics } from './lyrics';
import { extractAlbumPalette } from './color';
import { nextPollDelayMs, BURST_POLLS, type PollState } from './pollSchedule';

// Poll cadence is adaptive — see pollSchedule.ts for the policy and why.

/** Delay before the confirming poll after a transport command: long enough
 *  for the service to have applied it, short enough to feel immediate. */
const AFTER_COMMAND_MS = 350;

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
  /** One poll now, out of band. Also the Resync path from the lyrics view.
   *  Reschedules the next poll, so calling it never leaves two timers running.
   *
   *  `force` is for a poll the USER asked for: an ordinary tick that lands
   *  while another is in flight is dropped (the answer on its way is as good
   *  as the one it would fetch), but a Resync must not be — the in-flight
   *  answer was read from the service BEFORE the user pressed the button, so
   *  returning it is exactly the stale position they were trying to replace.
   *  A forced tick waits that poll out and then reads the position again. */
  tick: (opts?: { force?: boolean }) => Promise<void>;
  start: () => void;
  stop: () => void;
  /** Forget the current track so the next tick re-runs the track-change work
   *  (palette extraction, lyrics fetch). */
  forgetTrack: () => void;
  /** "Something just changed — look sooner." Used after a transport command,
   *  which is the one moment we know the answer is about to be stale. Polls
   *  shortly and then quickly a few more times before easing off. */
  bump: () => void;
}

/** Builds the poll loop. Nothing runs until start(); the returned handle owns
 *  the timer, so callers never touch it directly. */
export function createNowPlayingLoop({ provider, colorOverrideEnabled, send }: LoopDeps): NowPlayingLoop {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTrackId: string | null | undefined = null;
  let stopped = true;
  /** The poll currently out, if any. Guards against two in flight at once —
   *  which an out-of-band tick() during a slow request would otherwise cause —
   *  and gives a forced tick something to wait on. */
  let inFlight: Promise<void> | null = null;
  const schedule: PollState = {
    playing: false,
    msUntilTrackEnd: null,
    idleStreak: 0,
    errorStreak: 0,
    burstsLeft: 0,
  };
  /** Epoch ms before which we must not call the source again. Set from a 429's
   *  own Retry-After. Polling through a rate limit is what turns a short one
   *  into a long one, so while this is in the future every tick returns
   *  without touching the network. */
  let quietUntil = 0;

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

  /** Replaces any pending poll with one `delayMs` from now. Every path out of
   *  tick() goes through here, so there is only ever one timer outstanding no
   *  matter how the tick was triggered. */
  function scheduleNext(delayMs: number): void {
    if (timer) clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(() => void tick(), delayMs);
  }

  /** Runs the poll, then schedules the next one from whatever it learned. */
  async function tick(opts?: { force?: boolean }): Promise<void> {
    if (inFlight) {
      // A poll is already out; its own completion reschedules. Only a forced
      // tick (Resync) is worth a second request, and only after this one is
      // done — two concurrent reads would race to set the anchor, and the
      // loser could be the newer of the two.
      if (!opts?.force) return;
      await inFlight.catch(() => {});
    }
    const poll = pollOnce();
    inFlight = poll;
    try {
      await poll;
    } finally {
      if (inFlight === poll) inFlight = null;
      // While throttled, sleep out the window exactly rather than waking on
      // the normal cadence just to return early — no requests either way, but
      // this way the loop is genuinely idle for the duration.
      const throttleLeft = quietUntil - Date.now();
      scheduleNext(throttleLeft > 0 ? Math.max(throttleLeft, 1000) : nextPollDelayMs(schedule));
    }
  }

  async function pollOnce(): Promise<void> {
    if (!provider().isAuthed()) {
      // Not signed in: nothing to ask and nothing to wait for but the user.
      schedule.playing = false;
      schedule.idleStreak++;
      send('nowPlaying:update', { connected: false } satisfies NowPlaying);
      return;
    }

    // Serving the throttle. Keep telling the UI why it's quiet — silence here
    // is what made a rate limit look like "nothing is playing".
    if (Date.now() < quietUntil) {
      send('nowPlaying:update', {
        connected: true,
        playing: false,
        error: 'rate_limited',
        retryAtMs: quietUntil,
      } satisfies NowPlaying);
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
      if (err instanceof RateLimitError) {
        quietUntil = Date.now() + err.retryAfterS * 1000;
        // Not an error streak: we know exactly how long to wait, so back-off
        // guessing would only muddy it. The quietUntil guard above is what
        // holds the line.
        schedule.errorStreak = 0;
        schedule.burstsLeft = 0;
        schedule.playing = false;
        console.warn(
          `[now-playing] rate limited by the music source; going quiet for ${err.retryAfterS}s ` +
            `(until ${new Date(quietUntil).toLocaleTimeString()})`
        );
        send('nowPlaying:update', {
          connected: true,
          playing: false,
          error: 'rate_limited',
          retryAtMs: quietUntil,
        } satisfies NowPlaying);
        return;
      }
      // Anything else: back off progressively rather than retrying a failing
      // endpoint at full cadence.
      schedule.errorStreak++;
      schedule.playing = false;
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
      schedule.errorStreak = 0;
      schedule.playing = false;
      schedule.idleStreak++;
      schedule.msUntilTrackEnd = null;
      if (schedule.burstsLeft > 0) schedule.burstsLeft--;
      lastTrackId = null;
      send('nowPlaying:update', { connected: true, playing: false } satisfies NowPlaying);
      return;
    }

    schedule.errorStreak = 0;
    schedule.idleStreak = 0;
    schedule.playing = true;
    // Feeds the "never sleep past the end of the track" clamp: the track
    // boundary is the one moment a change is actually expected, so the policy
    // wakes just after it however slow the baseline is.
    schedule.msUntilTrackEnd =
      np.durationMs != null && np.progressMs != null ? Math.max(0, np.durationMs - np.progressMs) : null;
    if (schedule.burstsLeft > 0) schedule.burstsLeft--;

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
      stopped = false;
      void tick(); // polls now, then schedules itself from what it finds
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    forgetTrack() {
      lastTrackId = null;
    },
    bump() {
      // A transport command just landed, so the current answer is about to be
      // wrong. Poll shortly (not instantly — the change needs a moment to
      // register on the service) and stay quick for a few polls after.
      schedule.burstsLeft = BURST_POLLS;
      schedule.errorStreak = 0;
      scheduleNext(AFTER_COMMAND_MS);
    },
  };
}
