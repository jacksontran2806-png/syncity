import { useMemo } from 'react';
import { useStore } from '../../store';
import { contrastingLyricColor, moodyTintRgb } from '../../colorUtils';
import { AlbumBackdrop } from '../AlbumBackdrop';
import { IconButton } from '../IconButton';
import { useLyricClock } from './useLyricClock';
import { LyricStage } from './LyricStage';
import { LyricSyncBar } from './LyricSyncBar';
import type { RGB } from '@shared/types';

const rgbCss = (c: RGB): string => `rgb(${c.r}, ${c.g}, ${c.b})`;

export function LyricsFullscreen(): JSX.Element {
  const lyrics = useStore((s) => s.lyrics);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const palette = useStore((s) => s.palette);
  const setViewMode = useStore((s) => s.setViewMode);
  const settings = useStore((s) => s.settings);
  const { elapsedMs, activeIdx } = useLyricClock();

  // Background and text colour are derived together, so they can never drift
  // out of contrast with each other.
  const bgRgb: RGB = useMemo(() => {
    if (settings.lyricsBackground === 'solid') {
      return settings.lyricsSolidColor === 'white' ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    }
    if (settings.lyricsBackground === 'albumBlend') return moodyTintRgb(palette.primary);
    // Transparent: what's actually behind the text is the blurred art layer,
    // which sits close to a darkened album tint — contrast against that.
    return moodyTintRgb(palette.primary, 0.12);
  }, [settings.lyricsBackground, settings.lyricsSolidColor, palette.primary]);

  const textColor = useMemo(
    () => rgbCss(contrastingLyricColor(bgRgb, settings.lyricsBackground, palette.primary)),
    [bgRgb, settings.lyricsBackground, palette.primary]
  );

  const hasLyrics = !!lyrics?.length;
  const showStage = hasLyrics && activeIdx >= 0;

  return (
    <div className="lyrics-fullscreen" style={{ color: textColor }}>
      {settings.albumFullBleed && settings.lyricsBackground === 'transparent' && <AlbumBackdrop />}
      {settings.lyricsBackground !== 'transparent' && (
        <div className="lyrics-backdrop" style={{ background: rgbCss(bgRgb) }} />
      )}

      <div className="fullscreen-back">
        <IconButton title="Back to widget" onClick={() => setViewMode('island')}>
          ‹
        </IconButton>
      </div>

      <div className="lyrics-art-wrap">
        {nowPlaying.artUrl ? (
          <img
            className="lyrics-art"
            src={nowPlaying.artUrl}
            alt=""
            style={{
              boxShadow: `0 0 60px 6px rgba(${palette.primary.r}, ${palette.primary.g}, ${palette.primary.b}, 0.33)`,
            }}
          />
        ) : (
          <div className="lyrics-art lyrics-art-placeholder" />
        )}
        <div className="lyrics-nowplaying-title">{nowPlaying.playing ? nowPlaying.title : 'Nothing playing'}</div>
        <div className="lyrics-nowplaying-artist">{nowPlaying.playing ? nowPlaying.artist : ''}</div>
      </div>

      {/* No lyrics for this track (instrumental, or nothing indexed): the stage
          is simply not rendered. No message, no placeholder, no gap — the space
          is ceded to the art and whatever glow mode is running. */}
      {showStage && (
        <LyricStage lyrics={lyrics!} activeIdx={activeIdx} elapsedMs={elapsedMs} textColor={textColor} />
      )}
      {hasLyrics && <LyricSyncBar />}
    </div>
  );
}
