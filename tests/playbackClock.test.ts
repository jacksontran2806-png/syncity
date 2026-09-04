// Pins the playback anchor: the (position, instant) pair the lyric highlight
// runs on between polls, plus the line lookup it feeds.
//
// The point of the anchor is that a 2s poll interval never becomes 2s-granular
// highlighting, and that a local play/pause takes effect on the click rather
// than on the next poll. Both are asserted here with an explicit clock, so
// nothing depends on real timing.

import { progressAt, anchorFromPoll, anchorFromLocalEvent, ZERO_ANCHOR } from '../src/renderer/src/lib/playbackClock';
import { activeLineIndex } from '../src/renderer/src/lib/lyricsTiming';
import { check, done } from './assert';

const T0 = 1_700_000_000_000; // an arbitrary fixed "now"

// --- extrapolation between polls ---
const playing = { progressMs: 30_000, atMs: T0, playing: true };
check('at the anchor instant, position is the anchor', progressAt(playing, T0) === 30_000, `${progressAt(playing, T0)}`);
check(
  'one second later the position has advanced one second',
  progressAt(playing, T0 + 1000) === 31_000,
  `${progressAt(playing, T0 + 1000)}`
);
check(
  'frame-rate resolution: 16ms later reads 16ms further in',
  progressAt(playing, T0 + 16) === 30_016,
  `${progressAt(playing, T0 + 16)}`
);

// --- paused anchors hold, they don't run on ---
const paused = { progressMs: 30_000, atMs: T0, playing: false };
check('a paused anchor holds its position', progressAt(paused, T0 + 5000) === 30_000, `${progressAt(paused, T0 + 5000)}`);
check('never negative', progressAt({ progressMs: -50, atMs: T0, playing: false }, T0) === 0);

// --- a poll re-anchors outright, so error can't accumulate ---
const afterPoll = anchorFromPoll(playing, { progressMs: 45_000, receivedAt: T0 + 15_000, playing: true }, T0 + 15_010);
check('a poll replaces the anchor with the reported position', afterPoll.progressMs === 45_000, `${afterPoll.progressMs}`);
check('and anchors it to when that value arrived', afterPoll.atMs === T0 + 15_000, `${afterPoll.atMs}`);
check(
  'a wildly drifted local clock is corrected by the next poll, not blended',
  progressAt(afterPoll, T0 + 15_000) === 45_000
);

// A poll carrying no position (nothing playing) must not snap to zero — it
// keeps where we were and just applies the new playing state.
const pausedByPoll = anchorFromPoll(playing, { playing: false }, T0 + 4000);
check('a positionless poll keeps the position it had', pausedByPoll.progressMs === 34_000, `${pausedByPoll.progressMs}`);
check('and marks it stopped', pausedByPoll.playing === false);
check('so it then holds still', progressAt(pausedByPoll, T0 + 60_000) === 34_000);

// --- local events: applied at the moment of the click, no latency guess ---
const pausedLocally = anchorFromLocalEvent(playing, false, T0 + 2500);
check(
  'pausing locally freezes at the position as of that instant',
  pausedLocally.progressMs === 32_500,
  `${pausedLocally.progressMs}`
);
check('and does not keep advancing', progressAt(pausedLocally, T0 + 90_000) === 32_500);

const resumed = anchorFromLocalEvent(pausedLocally, true, T0 + 10_000);
check('resuming continues from where it stopped', resumed.progressMs === 32_500, `${resumed.progressMs}`);
check(
  'and advances from the moment of resuming, not from the pause',
  progressAt(resumed, T0 + 11_000) === 33_500,
  `${progressAt(resumed, T0 + 11_000)}`
);

check('the zero anchor is stopped at zero', progressAt(ZERO_ANCHOR, T0) === 0);

// --- the line lookup the clock drives ---
const lines = [
  { timeMs: 0, text: 'first' },
  { timeMs: 10_000, text: 'second' },
  { timeMs: 20_000, text: 'third' },
];
check('before the first line starts, nothing is active', activeLineIndex(lines, -1) === -1);
check('exactly on a line start, that line is active', activeLineIndex(lines, 10_000) === 1);
check('between two lines, the earlier one stays active', activeLineIndex(lines, 15_000) === 1);
check('past the last line it stays active', activeLineIndex(lines, 999_999) === 2);
check('no lines at all -> -1', activeLineIndex([], 5000) === -1);

// The whole point, end to end: one poll, then pure local extrapolation lands
// on the right line without another network round trip.
const anchored = anchorFromPoll(ZERO_ANCHOR, { progressMs: 9_500, receivedAt: T0, playing: true }, T0);
check(
  'half a second after a poll at 9.5s, the 10s line has become active',
  activeLineIndex(lines, progressAt(anchored, T0 + 500)) === 1,
  `elapsed=${progressAt(anchored, T0 + 500)}`
);
check(
  'and 400ms after that poll it is still the earlier line',
  activeLineIndex(lines, progressAt(anchored, T0 + 400)) === 0
);

done();
