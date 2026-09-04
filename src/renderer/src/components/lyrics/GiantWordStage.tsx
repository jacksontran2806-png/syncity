import { useMemo, useRef } from 'react';
import { buildWordTimeline, activeWordIndex } from '../../lib/lyricsTiming';
import type { LyricLine } from '@shared/types';

// One word at a time, sized to dominate the screen, with the previous and
// next words peeking small above/below. A "globe motion" transition (rotateX
// + translateY) sells the sense of each word curving into view from below
// and rotating away over the top, rather than a flat slide/fade.
//
// Own layout, own sizing — deliberately bypasses ActiveLine/LyricStage's
// per-line windowed rendering since Giant Word's entire point is one
// dominant word, not a line of them.

interface Props {
  lyrics: LyricLine[];
  elapsedMs: number;
  textColor: string;
}

const TARGET_WIDTH_FRAC = 0.8; // middle of the spec's 75-85% band
const MAX_HEIGHT_VH = 60;
const CONTEXT_SCALE = 0.25;

/** Scales up from a probe font size until the word's measured width matches
 *  the target width, then the caller clamps against the max-height ceiling. */
function fitFontSizePx(ctx: CanvasRenderingContext2D, text: string, targetWidthPx: number): number {
  const probe = 100;
  // Must be the SAME family the word actually renders in, or every word is
  // sized against the metrics of a font nobody sees. Read live off
  // .overlay-root — that's the element App.tsx sets the variable on, and a
  // custom property is only visible on that element and its descendants.
  const root = document.querySelector('.overlay-root') ?? document.documentElement;
  const family =
    getComputedStyle(root).getPropertyValue('--font-display').trim() || `'Clash Display', sans-serif`;
  ctx.font = `700 ${probe}px ${family}`;
  const measured = ctx.measureText(text).width || 1;
  return (targetWidthPx / measured) * probe;
}

export function GiantWordStage({ lyrics, elapsedMs, textColor }: Props): JSX.Element | null {
  const timeline = useMemo(() => buildWordTimeline(lyrics), [lyrics]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
  // activeWordIndex correctly returns -1 during an instrumental gap now
  // (not just before the very first word) — hold the last word on screen
  // through a short gap rather than jumping ahead to the next one early or
  // blanking out. LyricStage shows its own instrumental indicator over long
  // gaps; this is just "don't do anything visibly wrong" for short ones.
  const lastIdxRef = useRef(-1);

  const rawIdx = activeWordIndex(timeline, elapsedMs);
  if (rawIdx >= 0) lastIdxRef.current = rawIdx;
  const idx = rawIdx >= 0 ? rawIdx : lastIdxRef.current;
  if (!timeline.length || idx < 0) return null;

  const ctx = canvasRef.current.getContext('2d');
  const targetWidthPx = window.innerWidth * TARGET_WIDTH_FRAC;
  const maxHeightPx = (window.innerHeight * MAX_HEIGHT_VH) / 100;
  const fontSize = ctx
    ? Math.min(fitFontSizePx(ctx, timeline[idx]!.word, targetWidthPx), maxHeightPx)
    : Math.min(targetWidthPx / 4, maxHeightPx);

  // Fixed 3-slot window, keyed by absolute timeline index so the SAME DOM
  // node carries a word from incoming -> current -> outgoing as idx advances
  // — that's what lets the CSS transition animate the role change instead of
  // popping between disconnected elements.
  const slots = [idx - 1, idx, idx + 1].filter((n) => n >= 0 && n < timeline.length);

  return (
    <div className="giant-word-stage">
      {slots.map((n) => {
        const role = n < idx ? 'outgoing' : n > idx ? 'incoming' : 'current';
        const size = role === 'current' ? fontSize : fontSize * CONTEXT_SCALE;
        return (
          <div
            key={n}
            className={`giant-word giant-word--${role}`}
            style={{ fontSize: size, color: textColor }}
          >
            {timeline[n]!.word}
          </div>
        );
      })}
    </div>
  );
}
