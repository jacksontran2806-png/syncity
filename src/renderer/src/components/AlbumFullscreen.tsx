import { useStore } from '../store';
import { useSlideTransition } from '../hooks/useSlideTransition';
import { AlbumBackdrop } from './AlbumBackdrop';
import { IconButton } from './IconButton';

export function AlbumFullscreen(): JSX.Element {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const palette = useStore((s) => s.palette);
  const setViewMode = useStore((s) => s.setViewMode);
  const albumFullBleed = useStore((s) => s.settings.albumFullBleed);

  const layers = useSlideTransition(nowPlaying, nowPlaying.trackId ?? 'none', 500);
  const glowColor = `rgb(${palette.primary.r}, ${palette.primary.g}, ${palette.primary.b})`;

  const guarded = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      // Album mode is meant to be quiet/ambient — playback errors here just
      // no-op rather than throwing a flash message over the artwork.
    }
  };

  return (
    <div className="album-fullscreen">
      {albumFullBleed && <AlbumBackdrop />}

      <div className="fullscreen-back">
        <IconButton title="Back to widget" onClick={() => setViewMode('island')}>
          ‹
        </IconButton>
      </div>

      <div className="album-stage">
        {layers.map((layer) => {
          const np = layer.value;
          return (
            <div key={layer.key} className={`album-slide album-slide-${layer.place}`}>
              {np.artUrl ? (
                <img
                  className="album-art-big"
                  src={np.artUrl}
                  alt=""
                  style={{ boxShadow: `0 0 100px 10px ${glowColor}44` }}
                />
              ) : (
                <div className="album-art-big album-art-big-placeholder" />
              )}
              <div className="album-title">{np.playing ? np.title : 'Nothing playing'}</div>
              <div className="album-artist">{np.playing ? np.artist : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="album-transport" data-hitregion>
        <IconButton title="Previous" size="lg" onClick={() => guarded(() => window.lyriglow.skipPrevious())}>
          ⏮
        </IconButton>
        <IconButton
          title={nowPlaying.playing ? 'Pause' : 'Play'}
          size="lg"
          onClick={() => guarded(() => window.lyriglow.playPause(!nowPlaying.playing))}
        >
          {nowPlaying.playing ? '⏸' : '▶'}
        </IconButton>
        <IconButton title="Skip" size="lg" onClick={() => guarded(() => window.lyriglow.skipNext())}>
          ⏭
        </IconButton>
      </div>
    </div>
  );
}
