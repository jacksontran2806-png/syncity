// Shown instead of a blank screen whenever there's no lyric on screen but
// music is actually playing: no LRC match for the track at all, or the short
// window before the first line starts (too brief to count as a flagged
// instrumental gap) — a gentle pulsing note so "nothing to show" doesn't read
// as "nothing is happening". Distinct from InstrumentalDots: that one counts
// down a KNOWN, longer gap inside a synced track; this is the fallback for
// everything that isn't that.

export function NoLyricsIndicator(): JSX.Element {
  return (
    <div className="no-lyrics-icon" aria-hidden="true">
      🎵
    </div>
  );
}
