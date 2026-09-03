import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { IconButton } from './IconButton';
import { useSlideTransition } from '../hooks/useSlideTransition';

function guardMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('forbidden_premium_required')) return 'Needs Spotify Premium';
  if (message.includes('no_active_device')) return 'No active Spotify device';
  if (message.includes('unauthorized')) return 'Reconnect Spotify in settings';
  if (message.includes('redirect_port_in_use')) return 'Port 8888 is busy — quit any other LyriGlow window and retry';
  return `Command failed: ${message}`;
}

export function Widget(): JSX.Element {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const spotifyStatus = useStore((s) => s.spotifyStatus);
  const panel = useStore((s) => s.panel);
  const togglePanel = useStore((s) => s.togglePanel);
  const setViewMode = useStore((s) => s.setViewMode);
  const connectSpotify = useStore((s) => s.connectSpotify);

  const [flash, setFlash] = useState('');
  const [connecting, setConnecting] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const showFlash = (text: string) => {
    setFlash(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), 2800);
  };

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const guarded = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      showFlash(guardMessage(err));
    }
  };

  // Slides the art+meta row sideways on track change instead of hard-cutting.
  const trackLayers = useSlideTransition(nowPlaying, nowPlaying.trackId ?? 'none', 420);

  if (!spotifyStatus.authed) {
    return (
      <div className="widget" data-hitregion>
        <div className="widget-connect">
          <span>LyriGlow</span>
          <button
            type="button"
            className="connect-btn"
            disabled={connecting}
            onClick={async () => {
              setConnecting(true);
              await guarded(connectSpotify);
              setConnecting(false);
            }}
          >
            {connecting
              ? 'Opening browser…'
              : spotifyStatus.clientIdConfigured
                ? 'Connect Spotify'
                : 'Missing SPOTIFY_CLIENT_ID'}
          </button>
        </div>
      </div>
    );
  }

  const playing = !!nowPlaying.playing;

  return (
    <div className="widget" data-hitregion>
      <div className="widget-track-stage">
        {trackLayers.map((layer) => {
          const np = layer.value;
          const title = np.playing ? np.title : np.connected ? 'Nothing playing' : 'Not connected';
          const artist = np.playing ? np.artist : '';
          return (
            <div key={layer.key} className={`widget-track-slide widget-track-slide-${layer.place}`}>
              <div className="widget-art">
                {np.artUrl ? <img src={np.artUrl} alt="" /> : <div className="widget-art-placeholder" />}
              </div>
              <div className="widget-meta">
                <div className="widget-title">{title}</div>
                <div className="widget-artist">{artist}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="widget-transport">
        <IconButton title="Previous" size="lg" onClick={() => guarded(() => window.lyriglow.skipPrevious())}>
          ⏮
        </IconButton>
        <IconButton title={playing ? 'Pause' : 'Play'} size="lg" onClick={() => guarded(() => window.lyriglow.playPause(!playing))}>
          {playing ? '⏸' : '▶'}
        </IconButton>
        <IconButton title="Skip" size="lg" onClick={() => guarded(() => window.lyriglow.skipNext())}>
          ⏭
        </IconButton>
      </div>

      {flash && <div className="widget-flash">{flash}</div>}

      <div className="widget-secondary">
        <IconButton title="Lyrics mode" onClick={() => setViewMode('lyrics')}>
          𝄞
        </IconButton>
        <IconButton title="Album mode" onClick={() => setViewMode('album')}>
          ⛶
        </IconButton>
        <IconButton
          title="Shuffle"
          active={!!nowPlaying.shuffle}
          onClick={() => guarded(() => window.lyriglow.toggleShuffle(!nowPlaying.shuffle))}
        >
          ⤨
        </IconButton>
        <IconButton
          title="Repeat"
          active={nowPlaying.repeatState !== 'off' && !!nowPlaying.repeatState}
          onClick={() => guarded(() => window.lyriglow.toggleRepeat())}
        >
          ⟲
        </IconButton>
        {/* No close button by design — Escape dismisses the overlay (see
            useEscapeDismiss), and the tray owns Show/Hide and Quit. */}
        <IconButton title="Settings" active={panel === 'settings'} onClick={() => togglePanel('settings')}>
          ⚙
        </IconButton>
      </div>
    </div>
  );
}
