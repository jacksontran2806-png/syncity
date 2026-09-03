import { useMemo } from 'react';
import { useStore } from '../../store';
import { buildDisplayTokens, pickLineEntrance } from '../../lyricsDisplay';
import { activeWordIndex, estimateWordTimings } from '../../lyricsTiming';

export interface ActiveLineProps {
  index: number;
  text: string;
  elapsedMs: number;
  lineStart: number;
  lineEnd: number;
  textColor: string;
}

/** The line currently being sung, word-highlighted. Every lyric style renders
 *  its active line through this — the style only changes the CSS treatment. */
export function ActiveLine({ index, text, elapsedMs, lineStart, lineEnd, textColor }: ActiveLineProps): JSX.Element {
  const style = useStore((s) => s.settings.lyricStyle);
  const equalEmphasis = useStore((s) => s.settings.equalWordEmphasis);

  const tokens = useMemo(() => buildDisplayTokens(index, text), [index, text]);
  const entrance = useMemo(() => pickLineEntrance(index, text), [index, text]);

  // Highlight time is split across the line in proportion to each word's
  // estimated syllable count, not evenly — see lyricsTiming.ts for why that's
  // the honest ceiling with a line-level provider.
  const words = useMemo(() => tokens.filter((t) => !t.isEmoji).map((t) => t.text), [tokens]);
  const timings = useMemo(() => estimateWordTimings(words, lineStart, lineEnd), [words, lineStart, lineEnd]);
  const currentWord = activeWordIndex(timings, elapsedMs);

  // Emoji tokens are decoration, not sung, so they don't consume a word slot.
  let wordIdx = -1;

  return (
    <div className="lyrics-breathe">
      <div
        key={index}
        className={[
          'lyrics-active-line',
          `lyrics-active-line-${entrance}`,
          `lyrics-style-${style}`,
          equalEmphasis ? 'lyrics-equal-emphasis' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ color: textColor }}
      >
        {tokens.map((tok, i) => {
          if (!tok.isEmoji) wordIdx++;
          const my = wordIdx;
          return (
            <span
              key={tok.key}
              className={[
                'lyrics-word',
                `lyrics-word-${tok.size}`,
                tok.isEmoji ? 'lyrics-word-emoji' : '',
                my < currentWord ? 'is-sung' : '',
                my === currentWord ? 'is-current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              {tok.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
