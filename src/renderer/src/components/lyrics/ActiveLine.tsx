import { useMemo } from 'react';
import { useStore } from '../../store';
import { buildDisplayTokens, pickLineEntrance } from '../../lib/lyricsDisplay';

export interface ActiveLineProps {
  index: number;
  text: string;
  textColor: string;
}

// Word-by-word "sung now" highlighting used to live here, driven by
// estimateWordTimings — but LRCLIB only gives line-level timestamps, so that
// highlight was always a guess dressed up as sync, and it read as visibly
// wrong often enough that it's gone. The line just appears now, each word
// popping in on entrance — no claim of tracking the exact word being sung.
export function ActiveLine({ index, text, textColor }: ActiveLineProps): JSX.Element {
  const style = useStore((s) => s.settings.lyricStyle);

  const tokens = useMemo(() => buildDisplayTokens(index, text), [index, text]);
  const entrance = useMemo(() => pickLineEntrance(index, text), [index, text]);

  return (
    <div className="lyrics-breathe">
      <div
        key={index}
        className={['lyrics-active-line', `lyrics-active-line-${entrance}`, `lyrics-style-${style}`].join(' ')}
        style={{ color: textColor }}
      >
        {tokens.map((tok, i) => (
          <span
            key={tok.key}
            className={['lyrics-word', `lyrics-word-${tok.size}`, tok.isEmoji ? 'lyrics-word-emoji' : ''].join(' ')}
            style={{ animationDelay: `${i * 55}ms` }}
          >
            {tok.text}
          </span>
        ))}
      </div>
    </div>
  );
}
