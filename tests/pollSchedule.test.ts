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

// --- steady playback is the common case, and should be cheap ---
const steady = nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 200_000 }));
check('steady playback polls slowly', steady >= 15_000, `${steady}ms`);
check(
  'and far less often than the old fixed 2s cadence',
  steady >= 2_000 * 5,
  `${steady}ms vs 2000ms before`
);

// --- but never sleeps through the end of a track ---
const nearEnd = nextPollDelayMs(state({ playing: true, msUntilTrackEnd: 3_000 }));
check('wakes just after a track is due to end', nearEnd > 3_000 && nearEnd < 6_000, `${nearEnd}ms for 3s remaining`);
check(
  'that beats the slow baseline, so track changes are still caught promptly',
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
check('first idle poll is reasonably prompt', idle1 <= 10_000, `${idle1}ms`);
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

// --- request budget: the whole reason this exists ---
const perHourSteady = 3_600_000 / steady;
check(
  'steady playback costs well under 300 requests/hour',
  perHourSteady < 300,
  `${Math.round(perHourSteady)}/hr (was 1800/hr at the original 2s)`
);
const perHourIdle = 3_600_000 / idle9;
check('sitting idle settles even lower', perHourIdle < perHourSteady, `${Math.round(perHourIdle)}/hr`);

done();
