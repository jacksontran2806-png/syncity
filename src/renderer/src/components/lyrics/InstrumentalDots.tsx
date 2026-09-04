// Shown during a real instrumental gap (intro, or a long break between two
// lines) instead of stale or blank lyrics. Three dots fill in over the gap,
// timed to land fully lit exactly as the next line/word starts — a visible
// countdown to "singing resumes", not just a generic "loading" spinner.

interface Props {
  progress: number; // 0..1
  textColor: string;
}

const DOT_COUNT = 3;

export function InstrumentalDots({ progress, textColor }: Props): JSX.Element {
  return (
    <div className="instrumental-dots" style={{ color: textColor }}>
      {Array.from({ length: DOT_COUNT }, (_, i) => {
        const fill = Math.max(0, Math.min(1, progress * DOT_COUNT - i));
        return (
          <span
            key={i}
            className="instrumental-dot"
            style={{ opacity: 0.22 + fill * 0.78, transform: `scale(${0.6 + fill * 0.4})` }}
          />
        );
      })}
    </div>
  );
}
