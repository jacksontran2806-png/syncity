import {
  estimateSyllables,
  estimateWordTimings,
  activeWordIndex,
  detectInstrumentalGap,
  cappedLineEnd,
} from '../src/renderer/src/lib/lyricsTiming';
import { check, done } from './assert';

// --- syllable weighting beats an even split ---
const syl: [string, number][] = [
  ['through', 1], ['away', 2], ['beautiful', 3], ['I', 1], ['running', 2], ['fire', 1], ['everything', 4],
];
let sylOk = true;
for (const [w, expect] of syl) {
  const got = estimateSyllables(w);
  if (got !== expect) {
    sylOk = false;
    console.log(`      "${w}" -> ${got}, expected ${expect}`);
  }
}
check('syllable estimator', sylOk);

const timings = estimateWordTimings(['I', 'ran', 'through', 'everything'], 1000, 5000);
const durs = timings.map((t) => t.end - t.start);
check('word timings span the whole line', Math.abs(timings[timings.length - 1]!.end - 5000) < 0.001);
check('word timings are contiguous', timings.every((t, i) => i === 0 || Math.abs(t.start - timings[i - 1]!.end) < 1e-9));
check(
  'longer words get more time than short ones',
  durs[3]! > durs[0]! * 2,
  `"I"=${durs[0]!.toFixed(0)}ms "everything"=${durs[3]!.toFixed(0)}ms (even split would be ${(4000 / 4).toFixed(0)}ms each)`
);

// --- 6. activeWordIndex must not jump to the next word before it starts —
//        the bug behind Giant Word "pre-moving" during any gap between two
//        words (a real instrumental section, once cappedLineEnd can leave
//        one, but really any gap at all). ---
const gappedTimings = [
  { word: 'a', start: 0, end: 500 },
  { word: 'b', start: 4000, end: 4500 }, // a big silent gap before "b"
];
check(
  'activeWordIndex returns -1 inside a gap, not the upcoming word',
  activeWordIndex(gappedTimings, 2000) === -1,
  `got ${activeWordIndex(gappedTimings, 2000)}`
);
check('activeWordIndex still finds the word once its start arrives', activeWordIndex(gappedTimings, 4200) === 1);
check('activeWordIndex still finds the first word normally', activeWordIndex(gappedTimings, 250) === 0);
check('activeWordIndex still reports fully-sung past the end', activeWordIndex(gappedTimings, 9999) === 2);

// --- 7. cappedLineEnd shrinks a window with obvious trailing silence, never
//        stretches a line that's already tight against the raw gap. ---
const longSilentGap = cappedLineEnd('hi', 0, 10000); // 1 syllable, huge raw gap
check('a short line with a long raw gap gets capped well under the raw end', longSilentGap < 2000, `got ${longSilentGap}`);
const tightGap = cappedLineEnd('a somewhat longer line of several words here', 0, 1200);
check('a line with barely enough raw gap is not stretched past it', tightGap <= 1200, `got ${tightGap}`);

// --- 8. detectInstrumentalGap: intro + mid-song, both bounded [0,1] and
//        exactly null outside a genuine gap. ---
const introLyrics = [{ timeMs: 12000, text: 'first line' }];
check('long intro before the first line is flagged', detectInstrumentalGap(introLyrics, -1, 6000) === 0.5);
check('short intro is never flagged', detectInstrumentalGap([{ timeMs: 1000, text: 'x' }], -1, 500) === null);

const midLyrics = [
  { timeMs: 0, text: 'hi' }, // 1 syllable, ends almost immediately
  { timeMs: 10000, text: 'second line' },
];
const midGapAt = detectInstrumentalGap(midLyrics, 0, 5000);
check('a long mid-song gap is flagged with a 0..1 progress', midGapAt !== null && midGapAt >= 0 && midGapAt <= 1, `got ${midGapAt}`);
check('right at the line start, not yet in the gap', detectInstrumentalGap(midLyrics, 0, 0) === null);
check('the last line never reports a gap (no known next line)', detectInstrumentalGap(midLyrics, 1, 999999) === null);

done();
