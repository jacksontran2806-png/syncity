// How long to wait before asking the music source what's playing.
//
// WHY THIS EXISTS: a fixed interval has to be fast enough for the worst case
// (a track change nobody told us about) and therefore wastes requests on the
// common case (same song, still playing, nothing to learn). At 2s that was
// 1800 requests an hour for one listener, from an app designed to sit open all
// day — enough to get rate-limited, which is what prompted this.
//
// The renderer no longer depends on poll frequency at all: it runs on a local
// anchor (renderer/lib/playbackClock) and extrapolates every frame, so a poll
// is a correction, not the thing driving the UI. That frees the schedule to
// follow what's actually worth asking about:
//
//   - just changed        -> a short burst, so a change lands crisply
//   - playing steadily    -> slow, but never sleep past the end of the track
//   - nothing playing     -> moderate, easing off the longer it stays quiet
//   - erroring            -> back off, don't hammer something already failing
//
// Pure and total: no clock, no I/O, so the policy can be tested directly.

/** Right after a change (a skip, a transport command), poll quickly a few
 *  times to settle on the new track instead of waiting out a slow interval. */
const BURST_MS = 1_200;
export const BURST_POLLS = 3;

/** Steady playback. The anchor carries the position between these, so this is
 *  NOT about sync accuracy — it's the ceiling on how long the app can keep
 *  showing the wrong song after the user changes tracks in Spotify itself.
 *
 *  This was 20s, chosen purely for the request budget, and that made the app
 *  feel broken: skip a track and the title took up to twenty seconds to catch
 *  up, against half a second in the old fixed-2s build. The budget argument
 *  was also written before the app could handle a 429 at all — it now reads
 *  Retry-After and goes genuinely quiet for the stated window
 *  (nowPlayingLoop's quietUntil), so a burst of requests costs a measured
 *  pause instead of an escalating failure. Perceived latency is worth more
 *  than the requests saved, so this sits just above the old cadence. */
const PLAYING_MS = 2_500;

/** Poll again just after the current track is due to end, so the next track is
 *  picked up promptly however slow the baseline is. */
const TRACK_END_MARGIN_MS = 750;

/** Never schedule tighter than this, so a track ending (or a bad duration)
 *  can't spin the loop. */
const MIN_MS = 1_000;

/** Nothing playing: the only thing we're waiting for is the user starting
 *  something somewhere else, so ease off the longer that stays true — but the
 *  FIRST few steps have to stay prompt, because "press play in Spotify and
 *  watch the overlay" is exactly when someone is looking straight at it. The
 *  long tail is where the savings are: an app left open all afternoon spends
 *  almost all of its idle time at the last step, not the first. */
const IDLE_STEPS_MS = [3_000, 5_000, 10_000, 20_000, 30_000];

/** Consecutive failures (not rate limits — those carry their own window). */
const ERROR_STEPS_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

export interface PollState {
  /** Whether the source reported active playback on the last successful poll. */
  playing: boolean;
  /** ms until the current track is expected to end, or null if unknown. */
  msUntilTrackEnd: number | null;
  /** Consecutive polls that found nothing playing. */
  idleStreak: number;
  /** Consecutive failed polls. */
  errorStreak: number;
  /** Remaining quick polls after a change. */
  burstsLeft: number;
}

/** Picks the step for a streak, holding at the last one. */
function step(steps: number[], streak: number): number {
  return steps[Math.min(Math.max(streak - 1, 0), steps.length - 1)]!;
}

/**
 * Delay before the next poll.
 *
 * Order matters: an error outranks everything (whatever else we believed is
 * now stale), then a pending burst, then playback state.
 */
export function nextPollDelayMs(state: PollState): number {
  if (state.errorStreak > 0) return step(ERROR_STEPS_MS, state.errorStreak);
  if (state.burstsLeft > 0) return BURST_MS;
  if (!state.playing) return step(IDLE_STEPS_MS, state.idleStreak);

  // Playing: slow by default, but never sleep through the end of the track —
  // that boundary is the one moment a change is actually expected.
  const untilEnd = state.msUntilTrackEnd;
  const capped = untilEnd != null && untilEnd >= 0 ? Math.min(PLAYING_MS, untilEnd + TRACK_END_MARGIN_MS) : PLAYING_MS;
  return Math.max(MIN_MS, capped);
}
