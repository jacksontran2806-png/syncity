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

/**
 * How much of a line's duration each word gets.
 *
 * THE SWAP POINT. Word timing here is an ESTIMATE distributed across a line —
 * LRCLIB gives line-level timestamps only, so nothing below the line is real
 * sync. Replace this one function (and nothing else) to change the model, or
 * delete the estimate entirely if a word-timed source is ever wired in.
 *
 * Weighted by syllables rather than by character count, which is the more
 * obvious choice but a worse proxy for how long a word is actually sung:
 * "through" is seven characters and one syllable, "away" is four characters
 * and two. Singing time tracks syllables, not letters. For the character-count
 * model instead, this becomes `(word) => word.length || 1`.
 */
const wordWeight = estimateSyllables;

/** Splits a line's known duration across its words in proportion to
 *  wordWeight. Contiguous and exactly spanning [lineStart, lineEnd]. */
export function estimateWordTimings(words: string[], lineStart: number, lineEnd: number): WordTiming[] {
  if (!words.length) return [];
  const duration = Math.max(1, lineEnd - lineStart);
  const weights = words.map(wordWeight);
  const totalWeight = weights.reduce((s, x) => s + x, 0) || words.length;

  let cursor = lineStart;
  return words.map((word, i) => {
    const wDur = (weights[i]! / totalWeight) * duration;
    const timing = { word, start: cursor, end: cursor + wDur };
    cursor += wDur;
    return timing;
  });
}

/**
 * The line being sung at `elapsedMs`, or -1 before the first one starts.
 *
 * "Active" means the last line whose timestamp has passed — it stays active
 * through any silence after it, right up until the next line begins. That's
 * what keeps the just-sung line on screen through a pause between lines
 * instead of blanking the stage; the instrumental detector below is what
 * decides when a gap is long enough to say something about.
 *
 * Lines are sorted by the parser, so this walks until the first timestamp in
 * the future and stops.
 */
export function activeLineIndex(lines: LineLike[], elapsedMs: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.timeMs <= elapsedMs) idx = i;
    else break;
  }
  return idx;
}

export interface LineLike {
  timeMs: number;
  text: string;
}

/** Typical pace, ms per syllable, for capping a line's word window (see
 *  cappedLineEnd). Deliberately on the slower side of normal singing —
 *  this only ever SHRINKS the window when the raw gap has obvious trailing
 *  silence in it, never stretches a genuinely fast line further. */
const TYPICAL_MS_PER_SYLLABLE = 260;

/** A line's estimated sung end: syllable count × a typical pace, capped to
 *  never exceed the raw gap to the next line (or the given fallback).
 *
 * The raw gap to the next line almost always includes some trailing
 * silence/breath before the next line actually starts — LRC timestamps mark
 * when a line BEGINS, not when the previous one finishes. Stretching the
 * current line's words across that whole gap (including the silent part)
 * systematically pushes each word's estimated end later than it's actually
 * sung, compounding across the line — which is what read as Giant Word
 * "always running a little behind, especially by the end of a line". Capping
 * the window to a plausible sung duration keeps the estimate inside the part
 * of the gap that's actually singing, and also identifies genuine
 * instrumental gaps: whatever's left over between this and the raw next-line
 * timestamp is silence (see the instrumental-gap detector in LyricStage). */
export function cappedLineEnd(text: string, lineStart: number, rawEnd: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  const totalSyllables = words.reduce((s, w) => s + estimateSyllables(w), 0);
  const naturalEnd = lineStart + totalSyllables * TYPICAL_MS_PER_SYLLABLE;
  return Math.min(rawEnd, naturalEnd);
}

/** Flattens every line into one whole-song word-timing array, for lyric
 *  styles (Giant Word) that focus on a single word regardless of which line
 *  it belongs to. Each line's words are weighted exactly as estimateWordTimings
 *  already does — this only concatenates across lines, using the next line's
 *  timestamp as the current line's end (or +fallbackMs for the last line,
 *  matching LyricStage's own convention for an unbounded final line), capped
 *  per cappedLineEnd so a line's words don't stretch across trailing silence. */
export function buildWordTimeline(lyrics: LineLike[], fallbackMs = 4000): WordTiming[] {
  const out: WordTiming[] = [];
  for (let i = 0; i < lyrics.length; i++) {
    const line = lyrics[i]!;
    const rawEnd = lyrics[i + 1]?.timeMs ?? line.timeMs + fallbackMs;
    const lineEnd = cappedLineEnd(line.text, line.timeMs, rawEnd);
    const words = line.text.split(/\s+/).filter(Boolean);
    out.push(...estimateWordTimings(words, line.timeMs, lineEnd));
  }
  return out;
}

/** How long a gap has to be before it's treated as an instrumental section
 *  worth showing an indicator for, rather than just normal breathing room
 *  between two lines. */
const INSTRUMENTAL_GAP_MS = 6000;

/** Progress (0..1) through a currently-active instrumental gap, or null if
 *  `elapsed` isn't in one. Covers both an intro before the first line and a
 *  mid-song gap between two lines — anywhere the sung-duration estimate
 *  (cappedLineEnd) leaves enough real silence to be worth flagging. */
export function detectInstrumentalGap(lyrics: LineLike[], activeIdx: number, elapsedMs: number): number | null {
  if (!lyrics.length) return null;

  if (activeIdx < 0) {
    const firstStart = lyrics[0]!.timeMs;
    if (firstStart <= INSTRUMENTAL_GAP_MS) return null;
    return Math.max(0, Math.min(1, elapsedMs / firstStart));
  }

  const line = lyrics[activeIdx];
  const next = lyrics[activeIdx + 1];
  if (!line || !next) return null; // last line — no known "next" to fill toward

  const lineEnd = cappedLineEnd(line.text, line.timeMs, next.timeMs);
  const gap = next.timeMs - lineEnd;
  if (gap <= INSTRUMENTAL_GAP_MS || elapsedMs < lineEnd) return null;
  return Math.max(0, Math.min(1, (elapsedMs - lineEnd) / gap));
}

/** Index of the word being sung at `elapsed`, or -1 if nothing currently is —
 *  before the first word, OR in a gap between two words/lines (an
 *  instrumental section, now that cappedLineEnd can leave real gaps in the
 *  timeline). Previously this only checked `elapsed < timings[i].end`, which
 *  matched the NEXT word the instant its end passed elapsed even if its
 *  start hadn't arrived yet — Giant Word would jump to the upcoming word
 *  during an instrumental gap instead of waiting for it. Returns
 *  timings.length once every word has been sung. */
export function activeWordIndex(timings: WordTiming[], elapsed: number): number {
  if (!timings.length) return -1;
  for (let i = 0; i < timings.length; i++) {
    const timing = timings[i]!;
    if (elapsed < timing.start) return -1;
    if (elapsed < timing.end) return i;
  }
  return timings.length;
}
