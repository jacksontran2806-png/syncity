import { useState } from 'react';
import { useStore } from '../store';

/**
 * Connecting Spotify, including the escape hatch when the build's own Spotify
 * application is full.
 *
 * WHY THIS EXISTS AS A UI AT ALL: Spotify caps an application that hasn't
 * passed quota review at 25 authorised listeners, and there is no way for this
 * app to raise that on a user's behalf. Past that number the only fix is for
 * the user to register a Spotify application of their own — three minutes,
 * free, no review — and point Syncity at it. That used to mean hand-writing a
 * .env file into %APPDATA%, which is a wall for anyone who doesn't already
 * know what a .env file is. The whole flow lives here instead, with the
 * redirect URI copyable, because typing it wrong is the one step everybody
 * gets wrong and the resulting Spotify error page explains nothing.
 */
export function SpotifySetup(): JSX.Element {
  const status = useStore((s) => s.spotifyStatus);
  const connectSpotify = useStore((s) => s.connectSpotify);
  const disconnectSpotify = useStore((s) => s.disconnectSpotify);
  const updateSettings = useStore((s) => s.updateSettings);

  const [draftId, setDraftId] = useState(status.clientId);
  const [connecting, setConnecting] = useState(false);
  const [note, setNote] = useState('');
  // Opens on its own when there is no client ID at all — that is the one case
  // where the user cannot get anywhere without these steps.
  const [showSteps, setShowSteps] = useState(!status.clientIdConfigured);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(''), 2600);
  };

  const connect = async () => {
    setConnecting(true);
    try {
      await connectSpotify();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setConnecting(false);
    }
  };

  const saveClientId = async () => {
    await updateSettings({ spotifyClientId: draftId.trim() });
    flash(draftId.trim() ? 'Saved — now press Connect Spotify' : 'Cleared — using the built-in app');
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      flash('Redirect URI copied');
    } catch {
      flash('Copy failed — select it and copy manually');
    }
  };

  return (
    <div className="spotify-setup">
      <div className="settings-row">
        <span className="settings-label">Spotify</span>
        <div className="settings-control">
          <span className={`spotify-dot ${status.authed ? 'is-on' : ''}`} />
          <span className="settings-hint">
            {status.authed ? 'Connected' : status.clientIdConfigured ? 'Not connected' : 'Needs setup'}
          </span>
          {status.authed ? (
            <button type="button" className="text-btn" onClick={() => void disconnectSpotify()}>
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className="connect-btn"
              disabled={connecting || !status.clientIdConfigured}
              onClick={() => void connect()}
            >
              {connecting ? 'Opening browser…' : 'Connect Spotify'}
            </button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-label" />
        <div className="settings-control">
          <button type="button" className="text-btn" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? 'Hide setup' : 'Use my own Spotify app'}
          </button>
          {note && <span className="settings-hint">{note}</span>}
        </div>
      </div>

      {showSteps && (
        <div className="spotify-steps">
          {/* Said plainly, because the alternative is a user concluding the app
              is broken when it is Spotify's listener cap doing exactly what it
              is designed to do. */}
          <p className="spotify-note">
            Syncity ships with a Spotify app that only 25 people can use at once. If Connect fails
            with <em>“user not registered”</em>, register your own — it is free and takes about three
            minutes.
          </p>

          <ol>
            <li>
              <button type="button" className="text-btn" onClick={() => void window.syncity.spotifyOpenDashboard()}>
                Open the Spotify dashboard ↗
              </button>{' '}
              and press <strong>Create app</strong>.
            </li>
            <li>
              Name it anything. Tick <strong>Web API</strong>.
            </li>
            <li>
              Paste this exactly into <strong>Redirect URIs</strong>:
              <div className="spotify-copy">
                <code>{status.redirectUri}</code>
                <button type="button" className="text-btn" onClick={() => void copyRedirect()}>
                  Copy
                </button>
              </div>
            </li>
            <li>Save, then open the app’s Settings and copy its Client ID.</li>
            <li>
              Paste it here:
              <div className="spotify-copy">
                <input
                  type="text"
                  className="spotify-input"
                  placeholder="Client ID"
                  spellCheck={false}
                  value={draftId}
                  onChange={(e) => setDraftId(e.target.value)}
                />
                <button type="button" className="text-btn" onClick={() => void saveClientId()}>
                  Save
                </button>
              </div>
            </li>
          </ol>

          <p className="spotify-note spotify-note--quiet">
            A Client ID is a public identifier, not a password — Syncity signs in with PKCE, which
            has no client secret. Changing it signs you out, since the old session belonged to the
            other app.
          </p>
        </div>
      )}
    </div>
  );
}
