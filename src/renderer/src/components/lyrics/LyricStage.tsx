import { useStore } from '../../store';
import { ActiveLine } from './ActiveLine';
import { GiantWordStage } from './GiantWordStage';
import type { LyricLine } from '@shared/types';

/** Lines either side of the active one that Stacked Fade / Blur Focus show. */
const CONTEXT_LINES = 2;
/** Vertical gap between stacked rows in Blur Focus, px. */
const SLIDE_ROW_GAP = 92;

interface Props {
  lyrics: LyricLine[];
  activeIdx: number;
  elapsedMs: number;
  textColor: string;
}

/** Picks the layout for the selected lyric style. */
export function LyricStage({ lyrics, activeIdx, elapsedMs, textColor }: Props): JSX.Element {
  const style = useStore((s) => s.settings.lyricStyle);

  // Giant Word is a whole-song, single-word layout — it doesn't share the
  // per-line windowed rendering the other four styles do, and it's the one
  // style that still tracks individual words (that's its whole point), so
  // it still needs the real elapsed time, not just which line is active.
  if (style === 'giantWord') {
    return <GiantWordStage lyrics={lyrics} elapsedMs={elapsedMs} textColor={textColor} />;
  }

  const active = <ActiveLine index={activeIdx} text={lyrics[activeIdx]!.text} textColor={textColor} />;

  // Karaoke Fill / Bounce: one centred line, the next faint below it.
  if (style !== 'stackedFade' && style !== 'blurFocus') {
    return (
      <div className="lyrics-stage">
        {active}
        {lyrics[activeIdx + 1] && <div className="lyrics-next-line">{lyrics[activeIdx + 1]!.text}</div>}
      </div>
    );
  }

  const from = Math.max(0, activeIdx - CONTEXT_LINES);
  const to = Math.min(lyrics.length - 1, activeIdx + CONTEXT_LINES);

  // Blur Focus: rows are absolutely positioned and keyed by absolute line
  // index, so the SAME DOM node carries a line as it slides from "upcoming"
  // to "active" to "sung" — that's what lets the CSS transition on transform
  // actually animate a slide instead of lines popping into new flex slots.
  if (style === 'blurFocus') {
    const rows = [];
    for (let i = from; i <= to; i++) {
      const offset = i - activeIdx;
      rows.push(
        <div
          key={i}
          className={`lyrics-slide-row ${offset === 0 ? 'is-active' : ''}`}
          style={{
            transform: `translate(-50%, calc(-50% + ${offset * SLIDE_ROW_GAP}px))`,
            filter: offset !== 0 ? `blur(${Math.min(4, Math.abs(offset) * 2)}px)` : undefined,
            opacity: offset === 0 ? 1 : Math.max(0.18, 0.5 - Math.abs(offset) * 0.14),
          }}
        >
          {offset === 0 ? active : lyrics[i]!.text}
        </div>
      );
    }
    return <div className="lyrics-slide-stage">{rows}</div>;
  }

  // Stacked Fade: a window of surrounding lines, active one full scale.
  const rows = [];
  for (let i = from; i <= to; i++) {
    const offset = i - activeIdx;
    rows.push(
      <div
        key={i}
        className={`lyrics-stack-row lyrics-stack-stackedFade ${offset === 0 ? 'is-active' : ''}`}
        style={{
          opacity: offset === 0 ? 1 : Math.max(0.18, 0.5 - Math.abs(offset) * 0.14),
          transform: `scale(${offset === 0 ? 1 : 0.82})`,
        }}
      >
        {offset === 0 ? active : lyrics[i]!.text}
      </div>
    );
  }
  return <div className="lyrics-stage lyrics-stage-stackedFade">{rows}</div>;
}
