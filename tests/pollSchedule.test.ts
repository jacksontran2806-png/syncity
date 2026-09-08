// Pins the adaptive poll cadence. The point of the policy is spending
// requests where they buy something — a change we'd otherwise miss — and not
// on re-confirming a song we already know is playing. Getting this wrong is
// what got the app rate-limited in the first place.

import { nextPollDelayMs, BURST_POLLS, type PollState } from '../src/main/pollSchedule';
import { check, done } from './assert';

const base: PollState = {
  playing: false,
  msUntilTrackEnd: null,
  idleStreak: 0,
  errorStreak: 0,
  burstsLeft: 0,
};
const state = (over: Partial<PollState>): PollState => ({ ...base, ...over });

// --- steady playback is the common case; it has to stay responsive ---
// The ceiling here IS the app's worst-case "wrong song on screen" time when
// the user changes tracks in Spotify itself. A 20s baseline saved requests and
// made the app feel broken, so this is pinned from the user's side now: fast
// enough to feel immediate, still bounded so it can't creep back to a hot loop.
const steady = nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 200_000 }));
check('steady playback notices an external track change within ~3s', steady <= 3_000, `${steady}ms`);
check('but is not a hot loop', steady >= 2_000, `${steady}ms`);

// --- but never sleeps through the end of a track ---
const nearEnd = nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 1_000 }));
check('wakes just after a track is due to end', nearEnd > 1_000 && nearEnd < 2_500, `${nearEnd}ms for 1s remaining`);
check(
  'that beats the baseline, so a track boundary is caught even sooner',
  nearEnd < steady,
  `${nearEnd}ms < ${steady}ms`
);
check(
  'a track ending right now cannot spin the loop',
  nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 0 })) >= 1_000,
  `${nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 0 }))}ms`
);
check(
  'unknown duration falls back to the slow baseline',
  nextPollDelayMs(state({ playing: true, msUntilTrackEnd: null })) === steady
);

// --- a change just happened: look sooner, briefly ---
const burst = nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 200_000, burstsLeft: BURST_POLLS }));
check('a burst polls quickly', burst <= 1_500, `${burst}ms`);
check('and outranks the slow steady cadence', burst < steady);

// --- nothing playing: moderate, easing off the longer it stays quiet ---
const idle1 = nextPollDelayMs(state({ idleStreak: 1 }));
const idle2 = nextPollDelayMs(state({ idleStreak: 2 }));
const idle9 = nextPollDelayMs(state({ idleStreak: 9 }));
// Pressing play in Spotify while watching the overlay is the case this covers:
// the first idle polls are the ones a person is actually waiting on.
check('first idle poll is prompt enough to watch', idle1 <= 3_000, `${idle1}ms`);
check('idle backs off as silence continues', idle2 > idle1, `${idle1} -> ${idle2}`);
check('and holds at a ceiling rather than growing forever', idle9 === nextPollDelayMs(state({ idleStreak: 99 })));
check('the ceiling is not absurd', idle9 <= 60_000, `${idle9}ms`);

// --- failures back off, and outrank everything else ---
const err1 = nextPollDelayMs(state({ errorStreak: 1 }));
const err3 = nextPollDelayMs(state({ errorStreak: 3 }));
check('an error backs off', err1 >= 5_000, `${err1}ms`);
check('repeated errors back off further', err3 > err1, `${err1} -> ${err3}`);
check('errors hold at a ceiling', nextPollDelayMs(state({ errorStreak: 50 })) <= 60_000);
check(
  'an error outranks a pending burst — stale beliefs do not get to speed us up',
  nextPollDelayMs(state({ errorStreak: 2, burstsLeft: BURST_POLLS, playing: true })) > 1_500
);

// --- request budget ---
// Still bounded, just no longer bought at the cost of a visibly stale song.
// The real rate-limit defence is now the 429 handler's Retry-After window
// (nowPlayingLoop's quietUntil), not a permanently slow cadence.
const perHourSteady = 3_600_000 / steady;
check(
  'steady playback stays under ~1500 requests/hour',
  perHourSteady <= 1_500,
  `${Math.round(perHourSteady)}/hr`
);
const perHourIdle = 3_600_000 / idle9;
check(
  'an app left open and idle costs an order of magnitude less',
  perHourIdle * 10 <= perHourSteady,
  `${Math.round(perHourIdle)}/hr idle vs ${Math.round(perHourSteady)}/hr playing`
);

done();
