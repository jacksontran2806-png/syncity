// Turns a lyric line into Apple-Music-style display tokens: each word gets a
// randomized (but stable per-line, via a seeded PRNG) size, and some words
// get an emoji appended based on a keyword match or occasional flavor pick.
// Deliberately not audio/NLP-driven — it's a display flourish, not analysis.

export type WordSize = 'sm' | 'md' | 'lg' | 'xl';

export interface DisplayToken {
  key: string;
  text: string;
  size: WordSize;
  isEmoji?: boolean;
}

const EMOJI_MAP: Record<string, string> = {
  love: '❤️', heart: '💔', night: '🌙', fire: '🔥', dance: '💃', dancing: '🕺',
  star: '⭐', stars: '✨', sun: '☀️', rain: '🌧️', cry: '😢', crying: '😭',
  dream: '💭', dreaming: '💭', money: '💰', crazy: '🤪', mad: '😤',
  king: '👑', queen: '👑', gold: '✨', diamond: '💎', high: '🚀',
  running: '🏃', run: '🏃', gone: '💨', alone: '🥀', smile: '😊',
  kiss: '😘', angel: '😇', devil: '😈', party: '🎉', drunk: '🥴',
  drink: '🥃', vibe: '🎧', vibes: '🎧', world: '🌍', forever: '♾️',
  yeah: '🔥', baby: '👶', dark: '🌑', light: '💡',
};

const SIZES: WordSize[] = ['sm', 'md', 'lg', 'xl'];
const SIZE_WEIGHTS = [0.22, 0.36, 0.28, 0.14];
const FLAVOR_EMOJI = ['✨', '🔥', '💫', '🎶', '🌟'];

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// mulberry32 — tiny, deterministic, good enough for visual variety
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSize(rand: () => number): WordSize {
  const r = rand();
  let acc = 0;
  for (let i = 0; i < SIZES.length; i++) {
    acc += SIZE_WEIGHTS[i];
    if (r <= acc) return SIZES[i];
  }
  return 'md';
}

export type LineEntrance = 'slide-left' | 'slide-right' | 'slide-up' | 'magic';
const ENTRANCES: LineEntrance[] = ['slide-left', 'slide-right', 'slide-up', 'magic'];

// Deterministic per-line so it doesn't jitter on re-render, but independent
// of word-size seeding (different hash prefix) so entrance style and word
// sizes don't visibly correlate line to line.
export function pickLineEntrance(lineIndex: number, text: string): LineEntrance {
  const rand = mulberry32(hashSeed(`entrance:${lineIndex}:${text}`));
  return ENTRANCES[Math.floor(rand() * ENTRANCES.length)];
}

export function buildDisplayTokens(lineIndex: number, text: string): DisplayToken[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rand = mulberry32(hashSeed(`${lineIndex}:${text}`));
  const tokens: DisplayToken[] = [];

  words.forEach((word, i) => {
    tokens.push({ key: `${lineIndex}-${i}`, text: word, size: pickSize(rand) });

    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    const matched = EMOJI_MAP[clean];
    if (matched && rand() < 0.7) {
      tokens.push({ key: `${lineIndex}-${i}-e`, text: matched, size: pickSize(rand), isEmoji: true });
    } else if (rand() < 0.06) {
      const pick = FLAVOR_EMOJI[Math.floor(rand() * FLAVOR_EMOJI.length)];
      tokens.push({ key: `${lineIndex}-${i}-f`, text: pick, size: 'sm', isEmoji: true });
    }
  });

  return tokens;
}
