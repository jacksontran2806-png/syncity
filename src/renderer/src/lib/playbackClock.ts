// Where playback actually is, between polls.
//
// THE MODEL: an "anchor" is one known-good (position, wall-clock instant)
// pair plus whether the track was moving at that instant. Position at any
// later moment is the anchor plus however much wall time has passed since —
// so the UI runs off the local clock at frame rate instead of waiting on a
// 2s network poll, and a poll only ever RE-anchors rather than being the
// thing the highlight is driven by.
//
// WHY Date.now() AND NOT performance.now(): the anchor is stamped in the MAIN
// process (nowPlayingLoop, at the instant Spotify's answer lands) and consumed
// in the renderer. performance.now() is measured from a per-process origin, so
// the two would be comparing different zero points. Date.now() is the same
// wall clock in both, which is what makes a cross-process anchor meaningful.
// The tradeoff is that a system clock change mid-song shows up as a jump —
// self-correcting on the next poll, and far rarer than the every-2s cost of
// getting this wrong.

export interface PlaybackAnchor {
  /** Track position in ms, true as of `atMs`. */
  progressMs: number;
  /** Wall clock (Date.now()) at which `progressMs` was true. */
  atMs: number;
  /** Whether the track was advancing at that instant. A paused anchor holds
   *  its position instead of extrapolating. */
  playing: boolean;
}

export const ZERO_ANCHOR: PlaybackAnchor = { progressMs: 0, atMs: 0, playing: false };

/**
 * Track position at `nowMs`, extrapolated from the anchor.
 *
 * Paused anchors return their position unchanged — that's what freezes the
 * highlight exactly where the music stopped, rather than letting it run on.
 * Never returns a negative position: a correction can momentarily place the
 * anchor slightly ahead of where a fresh frame thinks it is.
 */
export function progressAt(anchor: PlaybackAnchor, nowMs: number): number {
  if (!anchor.playing) return Math.max(0, anchor.progressMs);
  return Math.max(0, anchor.progressMs + (nowMs - anchor.atMs));
}

/**
 * Re-anchors from a playback poll.
 *
 * `progressMs`/`atMs` come from the main process, which has already added half
 * the measured round-trip to the position (see nowPlayingLoop) — by the time
 * the answer arrived, the track had moved on by roughly the trip home.
 *
 * A poll that carries no position (the provider omits it when nothing is
 * playing) keeps the position we already had and just applies the new playing
 * state, so pausing freezes in place instead of snapping to zero.
 */
export function anchorFromPoll(
  previous: PlaybackAnchor,
  poll: { progressMs?: number; receivedAt?: number; playing?: boolean },
  nowMs: number
): PlaybackAnchor {
  const playing = !!poll.playing;
  if (poll.progressMs == null || poll.receivedAt == null) {
    return { progressMs: progressAt(previous, nowMs), atMs: nowMs, playing };
  }
  return { progressMs: poll.progressMs, atMs: poll.receivedAt, playing };
}

/**
 * Re-anchors from something the app did itself — a play or pause issued from
 * our own transport.
 *
 * No latency correction here, deliberately: this is the moment the user acted,
 * not a report about a moment that already passed. Applying it immediately is
 * the whole point — waiting for the next poll to notice a pause would leave
 * the highlight running for up to a full poll interval.
 *
 * Optimistic by nature: if the command turns out to fail (no active device,
 * Premium required), the repoll that follows every transport command puts the
 * anchor back within a few hundred ms.
 */
export function anchorFromLocalEvent(previous: PlaybackAnchor, playing: boolean, nowMs: number): PlaybackAnchor {
  return { progressMs: progressAt(previous, nowMs), atMs: nowMs, playing };
}
