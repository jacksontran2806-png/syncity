import { useStore } from '../../store';
import { ActiveLine } from './ActiveLine';
import type { LyricLine } from '@shared/types';

/** Lines either side of the active one that Stacked Fade / Blur Focus show. */
const CONTEXT_LINES = 2;
/** Length assumed for the last line, which has no following timestamp to end
 *  it. Only affects how fast that one line's highlight sweeps. */
const FALLBACK_LINE_MS = 4000;

interface Props {
  lyrics: LyricLine[];
  activeIdx: number;
  elapsedMs: number;
  textColor: string;
}

/** Picks the layout for the selected lyric style. All four share the same
 *  timing data and the same ActiveLine — only the surrounding lines differ. */
export function LyricStage({ lyrics, activeIdx, elapsedMs, textColor }: Props): JSX.Element {
  const style = useStore((s) => s.settings.lyricStyle);
  const lineStart = lyrics[activeIdx]!.timeMs;
  const lineEnd = lyrics[activeIdx + 1]?.timeMs ?? lineStart + FALLBACK_LINE_MS;

  const active = (
    <ActiveLine
      index={activeIdx}
      text={lyrics[activeIdx]!.text}
      elapsedMs={elapsedMs}
      lineStart={lineStart}
      lineEnd={lineEnd}
      textColor={textColor}
    />
  );

  // Karaoke Fill / Bounce: one centred line, the next faint below it.
  if (style !== 'stackedFade' && style !== 'blurFocus') {
    return (
      <div className="lyrics-stage">
        {active}
        {lyrics[activeIdx + 1] && <div className="lyrics-next-line">{lyrics[activeIdx + 1]!.text}</div>}
      </div>
    );
  }

  // Stacked Fade / Blur Focus: a window of surrounding lines. Blur Focus pulls
  // focus by sharpness, Stacked Fade by scale — the opacity ramp is shared.
  const from = Math.max(0, activeIdx - CONTEXT_LINES);
  const to = Math.min(lyrics.length - 1, activeIdx + CONTEXT_LINES);
  const rows = [];
  for (let i = from; i <= to; i++) {
    const offset = i - activeIdx;
    rows.push(
      <div
        key={i}
        className={`lyrics-stack-row lyrics-stack-${style} ${offset === 0 ? 'is-active' : ''}`}
        data-offset={offset}
        style={{
          filter: style === 'blurFocus' && offset !== 0 ? `blur(${Math.min(4, Math.abs(offset) * 2)}px)` : undefined,
          opacity: offset === 0 ? 1 : Math.max(0.18, 0.5 - Math.abs(offset) * 0.14),
          transform: style === 'stackedFade' ? `translateY(0) scale(${offset === 0 ? 1 : 0.82})` : undefined,
        }}
      >
        {offset === 0 ? active : lyrics[i]!.text}
      </div>
    );
  }
  return <div className={`lyrics-stage lyrics-stage-${style}`}>{rows}</div>;
}
