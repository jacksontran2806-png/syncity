// Pins the LRC parsing rules and the "is this actually the same recording?"
// duration check. Both are pure (see src/main/lrc.ts) precisely so they can be
// exercised here without a network or an Electron app object.

import { parseLrc, pickBestHit, DURATION_TOLERANCE_S } from '../src/main/lrc';
import { check, done } from './assert';

// --- timestamp shapes that all appear in real LRCLIB payloads ---
const shapes = parseLrc(
  [
    '[00:01.00]two digit centiseconds',
    '[00:02.5]one digit fraction',
    '[00:03.250]three digit milliseconds',
    '[00:04]no fraction at all',
    '[1:05.00]single digit minute',
  ].join('\n')
);
check('every timestamp shape parses', shapes.length === 5, `got ${shapes.length}`);
check('centiseconds: [00:01.00] -> 1000ms', shapes[0]!.timeMs === 1000, `${shapes[0]!.timeMs}`);
check('one-digit fraction: [00:02.5] -> 2500ms', shapes[1]!.timeMs === 2500, `${shapes[1]!.timeMs}`);
check('milliseconds: [00:03.250] -> 3250ms', shapes[2]!.timeMs === 3250, `${shapes[2]!.timeMs}`);
check('no fraction: [00:04] -> 4000ms', shapes[3]!.timeMs === 4000, `${shapes[3]!.timeMs}`);
check('single-digit minute: [1:05.00] -> 65000ms', shapes[4]!.timeMs === 65000, `${shapes[4]!.timeMs}`);

// --- metadata headers must not become lyric lines ---
const withHeaders = parseLrc(
  ['[ar:Some Artist]', '[al:Some Album]', '[length:03:12]', '[by:transcriber]', '[00:10.00]first real line'].join('\n')
);
check(
  'metadata headers are dropped, real lines kept',
  withHeaders.length === 1 && withHeaders[0]!.text === 'first real line',
  JSON.stringify(withHeaders)
);

// --- one line, several timestamps (a repeated chorus) ---
const chorus = parseLrc('[00:12.30][02:41.10][03:58.00]same chorus line');
check('a line with 3 timestamps yields 3 entries', chorus.length === 3, `got ${chorus.length}`);
check(
  'each repeat keeps the same text',
  chorus.every((c) => c.text === 'same chorus line'),
  JSON.stringify(chorus.map((c) => c.text))
);
check(
  'repeats land at their own times',
  chorus[0]!.timeMs === 12300 && chorus[1]!.timeMs === 161100 && chorus[2]!.timeMs === 238000,
  chorus.map((c) => c.timeMs).join(', ')
);

// --- ordering: output is sorted even when the source isn't ---
const unsorted = parseLrc(['[00:30.00]third', '[00:10.00]first', '[00:20.00]second'].join('\n'));
check(
  'lines come back in time order',
  unsorted.map((l) => l.text).join(',') === 'first,second,third',
  unsorted.map((l) => l.text).join(',')
);

// --- empty-text stamps are KEPT: they mark where singing stops, which is what
//     the instrumental-gap detector downstream reads ---
const withGapMarker = parseLrc(['[00:10.00]a line', '[00:14.00]', '[00:40.00]after the break'].join('\n'));
check('an empty timestamped line is kept', withGapMarker.length === 3, `got ${withGapMarker.length}`);
check('and it carries empty text', withGapMarker[1]!.text === '', JSON.stringify(withGapMarker[1]));

// --- junk in, empty array out (never a throw) ---
check('unparseable text yields no lines', parseLrc('just some prose\nno timestamps here').length === 0);
check('empty string yields no lines', parseLrc('').length === 0);

// --- duration matching: the ~2s rule ---
const hits = [
  { syncedLyrics: '[00:01.00]live cut', duration: 250 },
  { syncedLyrics: '[00:01.00]album cut', duration: 181 },
  { syncedLyrics: '[00:01.00]extended', duration: 400 },
];
check(
  'closest duration within tolerance wins',
  pickBestHit(hits, 180)?.syncedLyrics?.includes('album cut') === true,
  JSON.stringify(pickBestHit(hits, 180))
);
check(
  'nothing within tolerance -> null, rather than a wrong recording',
  pickBestHit(hits, 300) === null,
  JSON.stringify(pickBestHit(hits, 300))
);
check(
  `a hit exactly ${DURATION_TOLERANCE_S}s away still counts`,
  pickBestHit([{ syncedLyrics: 'x', duration: 182 }], 180) !== null
);
check(
  `a hit ${DURATION_TOLERANCE_S + 1}s away does not`,
  pickBestHit([{ syncedLyrics: 'x', duration: 183 }], 180) === null
);
check(
  'hits without synced lyrics are ignored entirely',
  pickBestHit([{ syncedLyrics: null, duration: 180 }, { duration: 180 }], 180) === null
);
check(
  'with no duration to compare, the first synced hit is taken',
  pickBestHit([{ syncedLyrics: null, duration: 1 }, { syncedLyrics: 'keep me', duration: 999 }], null)
    ?.syncedLyrics === 'keep me'
);
check('no hits at all -> null', pickBestHit([], 180) === null);
check(
  'a hit with no duration field is not preferred over a real match',
  pickBestHit([{ syncedLyrics: 'unknown length' }, { syncedLyrics: 'exact', duration: 180 }], 180)?.syncedLyrics ===
    'exact'
);

done();
