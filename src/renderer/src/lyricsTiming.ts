// Word-level timing, approximated.
//
// HONEST LIMITATION: LRCLIB — the free provider this app uses — returns
// LINE-level timestamps only, one per line. No free provider ships word-level
// timing; that granularity sits behind commercial licensing (Musixmatch's
// word-by-word / Rich Sync needs a paid partner agreement, not their free
// tier). So exact per-word sync is not available here and is not faked.
//
// What IS better than nothing: split each line's known duration in proportion
// to how long each word plausibly takes to sing. Syllable count tracks that
// far better than character count ("through" is 7 characters and 1 syllable;
// "away" is 4 characters and 2).
//
// SWAPPING IN A REAL PROVIDER LATER: replace estimateWordTimings() and nothing
// else. Its output shape is the contract the UI consumes — a word-level
// provider drops straight in here, no rearchitecture.

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/** Vowel-cluster heuristic. Not linguistically exact — deliberately cheap and
 *  good enough to weight one word against another. */
export function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  if (w.length <= 3) return 1;

  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '') // silent trailing e / -ed / -es
    .replace(/^y/, '');
  // A whole vowel run counts once, so diphthongs and triphthongs ("eau" in
  // beautiful) aren't double-counted. Still approximate — it will read
  // "everything" as 4 rather than 3 — but it only has to rank words against
  // each other, not be phonetically correct.
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function estimateWordTimings(words: string[], lineStart: number, lineEnd: number): WordTiming[] {
  if (!words.length) return [];
  const duration = Math.max(1, lineEnd - lineStart);
  const weights = words.map(estimateSyllables);
  const totalWeight = weights.reduce((s, x) => s + x, 0) || words.length;

  let cursor = lineStart;
  return words.map((word, i) => {
    const wDur = (weights[i]! / totalWeight) * duration;
    const timing = { word, start: cursor, end: cursor + wDur };
    cursor += wDur;
    return timing;
  });
}

/** Index of the word being sung at `elapsed`, or -1 before the line starts.
 *  Returns words.length once the line is fully sung. */
export function activeWordIndex(timings: WordTiming[], elapsed: number): number {
  if (!timings.length) return -1;
  if (elapsed < timings[0]!.start) return -1;
  for (let i = 0; i < timings.length; i++) {
    if (elapsed < timings[i]!.end) return i;
  }
  return timings.length;
}
