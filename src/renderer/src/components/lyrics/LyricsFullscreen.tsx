import { useMemo } from 'react';
import { useStore } from '../../store';
import { albumBlendCss, moodyTintRgb, rgbCss } from '../../lib/colorUtils';
import { blurredBackdropRgb, paletteLyricColor } from '../../lib/lyricColor';
import { detectInstrumentalGap } from '../../lib/lyricsTiming';
import { AlbumBackdrop } from '../AlbumBackdrop';
import { IconButton } from '../IconButton';
import { useLyricClock } from '../../hooks/useLyricClock';
import { LyricStage } from './LyricStage';
import { LyricSyncBar } from './LyricSyncBar';
import { InstrumentalDots } from './InstrumentalDots';
import { NoLyricsIndicator } from './NoLyricsIndicator';
import type { RGB } from '@shared/types';

export function LyricsFullscreen(): JSX.Element {
  const lyrics = useStore((s) => s.lyrics);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const palette = useStore((s) => s.palette);
  const setViewMode = useStore((s) => s.setViewMode);
  const settings = useStore((s) => s.settings);
  const { elapsedMs, activeIdx } = useLyricClock();

  // Background and text colour are derived together, so they can never drift
  // out of contrast with each other. bgRgb is always a single flat color —
  // the reference the lyric colour is measured against — even when the actual
  // painted background (bgCss, below) is a multi-color gradient.
  const bgRgb: RGB = useMemo(() => {
    if (settings.lyricsBackground === 'custom') return settings.lyricsCustomColor;
    if (settings.lyricsBackground === 'albumBlend') return moodyTintRgb(palette.primary);
    // Transparent: what's behind the text is the blurred cover under a scrim.
    // That's an AVERAGE of the whole cover, so it's estimated from the whole
    // palette (see blurredBackdropRgb) — the old near-black stand-in made a
    // bright album look safe on paper and unreadable on screen.
    return blurredBackdropRgb(palette);
  }, [settings.lyricsBackground, settings.lyricsCustomColor, palette]);

  // What actually gets painted: Album Blend spreads the palette's colors into
  // a gradient (see albumBlendColorCount) instead of the flat single-color
  // tint bgRgb alone would give.
  const bgCss: string = useMemo(() => {
    if (settings.lyricsBackground === 'albumBlend') {
      return albumBlendCss([palette.primary, palette.secondary, palette.tertiary], settings.albumBlendColorCount);
    }
    return rgbCss(bgRgb);
  }, [settings.lyricsBackground, settings.albumBlendColorCount, palette.primary, palette.secondary, palette.tertiary, bgRgb]);

  // Sourced FROM the artwork's palette and scored for harmony, contrast,
  // saturation and lightness together — see lib/lyricColor. The colour
  // transitions rather than snapping when the album changes (lyrics.css).
  const lyricColor = useMemo(
    () => paletteLyricColor(palette, bgRgb, settings.lyricsBackground),
    [palette, bgRgb, settings.lyricsBackground]
  );
  const textColor = rgbCss(lyricColor.color);

  const hasLyrics = !!lyrics?.length;
  // A real instrumental gap (intro, or a long break between two lines) gets a
  // small countdown indicator — see .instrumental-dots — but the stage itself
  // (the last sung line) stays on screen the whole time. It used to swap out
  // entirely during a gap, which for a short line followed by a long gap
  // (common) meant the actual lyric was gone for most of the song.
  const gapProgress = hasLyrics ? detectInstrumentalGap(lyrics!, activeIdx, elapsedMs) : null;
  const showDots = hasLyrics && gapProgress !== null;
  const showStage = hasLyrics && activeIdx >= 0;
  // Anything neither the dots nor the stage cover — no lyrics data at all, or
  // the short stretch before the first line starts (too short to count as a
  // flagged instrumental gap) — used to read as a bare blank screen. The note
  // is the fallback for all of it: it shows exactly when nothing else is on
  // screen and hides the instant either one takes over.
  const showNote = !showDots && !showStage && !!nowPlaying.playing;

  return (
    <div
      className="lyrics-fullscreen"
      style={{ color: textColor, textShadow: lyricColor.shadow ?? undefined }}
    >
      {settings.albumFullBleed && settings.lyricsBackground === 'transparent' && <AlbumBackdrop />}
      {settings.lyricsBackground !== 'transparent' && (
        <div className="lyrics-backdrop" style={{ background: bgCss }} />
      )}

      <div className="fullscreen-back">
        <IconButton title="Back to widget" onClick={() => setViewMode('island')}>
          ‹
        </IconButton>
      </div>

      {/* No album art/title block in this view by design — the lyrics
          themselves are the focus, centered in the screen with nothing
          above them pushing them off-center. */}

      {/* Fills every case where neither the stage nor the countdown dots have
          anything to show — no lyrics data at all, or the short window before
          the first line starts — so the screen never just goes blank while
          music's actually playing. Paused stays blank rather than implying
          playback that isn't happening. */}
      {showNote && <NoLyricsIndicator />}
      {showDots && <InstrumentalDots progress={gapProgress!} textColor={textColor} />}
      {showStage && (
        <LyricStage lyrics={lyrics!} activeIdx={activeIdx} elapsedMs={elapsedMs} textColor={textColor} />
      )}
      {hasLyrics && <LyricSyncBar />}
    </div>
  );
}
