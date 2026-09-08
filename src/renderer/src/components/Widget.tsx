import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { IconButton } from './IconButton';
import { useSlideTransition } from '../hooks/useSlideTransition';

/** "in 4 min" / "in 45s" — coarse on purpose, since the exact second a rate
 *  limit lifts isn't something to promise. */
function retryLabel(retryAtMs: number): string {
  const seconds = Math.max(0, Math.round((retryAtMs - Date.now()) / 1000));
  if (seconds < 60) return `in ${seconds}s`;
  return `in ${Math.ceil(seconds / 60)} min`;
}

function guardMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('forbidden_premium_required')) return 'Needs Spotify Premium';
  if (message.includes('no_active_device')) return 'No active Spotify device';
  if (message.includes('unauthorized')) return 'Reconnect Spotify in settings';
  if (message.includes('redirect_port_in_use')) return 'Port 8888 is busy — quit any other Syncity window and retry';
  return `Command failed: ${message}`;
}

export function Widget(): JSX.Element {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const spotifyStatus = useStore((s) => s.spotifyStatus);
  const panel = useStore((s) => s.panel);
  const togglePanel = useStore((s) => s.togglePanel);
  const setViewMode = useStore((s) => s.setViewMode);
  const connectSpotify = useStore((s) => s.connectSpotify);
  const setPanel = useStore((s) => s.setPanel);
  // Moves the playback anchor the instant it's clicked, so the lyric
  // highlight freezes/resumes on the click rather than on the next poll.
  const setPlaying = useStore((s) => s.setPlaying);

  const expandAnim = useStore((s) => s.settings.widgetExpandAnimation);
  const widgetLocked = useStore((s) => s.settings.widgetLocked);
  const updateSettings = useStore((s) => s.updateSettings);
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
    // With no client ID there is nothing to connect TO, and the button used to
    // say so by naming an environment variable — a dead end for anyone who
    // isn't a developer. It now opens the setup steps in Settings instead.
    const needsSetup = !spotifyStatus.clientIdConfigured;
    return (
      <div className={`widget widget-anim-${expandAnim}-expand`} data-hitregion>
        <div className="widget-connect">
          <span>Syncity</span>
          <button
            type="button"
            className="connect-btn"
            disabled={connecting}
            onClick={async () => {
              if (needsSetup) {
                setPanel('settings');
                return;
              }
              setConnecting(true);
              await guarded(connectSpotify);
              setConnecting(false);
            }}
          >
            {connecting ? 'Opening browser…' : needsSetup ? 'Set up Spotify' : 'Connect Spotify'}
          </button>
        </div>
      </div>
    );
  }

  const playing = !!nowPlaying.playing;

  return (
    <div className={`widget widget-anim-${expandAnim}-expand`} data-hitregion>
      <div className="widget-track-stage">
        {trackLayers.map((layer) => {
          const np = layer.value;
          // A throttled source is NOT "nothing playing" — saying so is what
          // made a rate limit look like a broken app. Say what's actually
          // happening, and when it clears.
          const title = np.playing
            ? np.title
            : np.error === 'rate_limited'
              ? 'Spotify is rate-limiting us'
              : np.connected
                ? 'Nothing playing'
                : 'Not connected';
          const artist = np.playing
            ? np.artist
            : np.error === 'rate_limited' && np.retryAtMs
              ? `Retrying ${retryLabel(np.retryAtMs)}`
              : '';
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
        <IconButton title="Previous" size="lg" onClick={() => guarded(() => window.syncity.skipPrevious())}>
          ⏮
        </IconButton>
        <IconButton title={playing ? 'Pause' : 'Play'} size="lg" onClick={() => guarded(() => setPlaying(!playing))}>
          {playing ? '⏸' : '▶'}
        </IconButton>
        <IconButton title="Skip" size="lg" onClick={() => guarded(() => window.syncity.skipNext())}>
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
        {/* Pins the widget expanded, bypassing auto-hide — for anyone who
            just wants the full menu and never wants to think about the
            pill. Lives here, not in Settings, since it's meant to be the
            immediate way out of auto-hide, not a buried preference. */}
        <IconButton
          title={widgetLocked ? 'Unlock (auto-hide resumes)' : 'Lock expanded'}
          active={widgetLocked}
          onClick={() => updateSettings({ widgetLocked: !widgetLocked })}
        >
          {widgetLocked ? '🔒' : '🔓'}
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
