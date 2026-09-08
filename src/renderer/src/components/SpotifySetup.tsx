import { useState } from 'react';
import { useStore } from '../store';

/**
 * Connecting Spotify. For a new install this is the whole of setup, and it is
 * written as such rather than as a repair.
 *
 * WHY EVERY USER DOES THIS: Syncity signs in through a Spotify application,
 * and an application that hasn't passed Spotify's quota review admits only the
 * users its owner has typed into the dashboard by name and email — 25 of them,
 * chosen individually. So a shipped application cannot cover the people who
 * download the app; it can only cover the handful its author added by hand.
 * Shipping one anyway meant a stranger's first press failed with "user not
 * registered", which reads as a broken app rather than a step not yet taken.
 *
 * Registering their own costs three minutes and nothing, and is better on its
 * own terms: their own listener allowance, their own rate limit rather than a
 * shared one, and their listening never travelling through an application
 * somebody else controls. The copy says that instead of apologising.
 *
 * The redirect URI is copyable because typing it wrong is the step everybody
 * gets wrong, and the error Spotify shows for it explains nothing.
 */
export function SpotifySetup(): JSX.Element {
  const status = useStore((s) => s.spotifyStatus);
  const connectSpotify = useStore((s) => s.connectSpotify);
  const disconnectSpotify = useStore((s) => s.disconnectSpotify);
  const updateSettings = useStore((s) => s.updateSettings);

  const [draftId, setDraftId] = useState(status.clientId);
  const [connecting, setConnecting] = useState(false);
  const [note, setNote] = useState('');
  // Open whenever there is nothing to connect with — which for a new install
  // is immediately, because these steps ARE the setup. Once a client ID is
  // saved they fold away, since nobody needs to read them twice.
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
    flash(draftId.trim() ? 'Saved — now press Connect Spotify' : 'Cleared');
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
            {status.authed ? 'Connected' : status.clientIdConfigured ? 'Not connected' : 'Not set up'}
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

      {status.clientIdConfigured && (
        <div className="settings-row">
          <span className="settings-label" />
          <div className="settings-control">
            <button type="button" className="text-btn" onClick={() => setShowSteps((v) => !v)}>
              {showSteps ? 'Hide setup' : 'Change Spotify app'}
            </button>
            {note && <span className="settings-hint">{note}</span>}
          </div>
        </div>
      )}

      {showSteps && (
        <div className="spotify-steps">
          <p className="spotify-note">
            Syncity connects through a Spotify app registered in your own name. It takes about three
            minutes, costs nothing, and means your listening is only ever between your computer and
            Spotify.
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
              {note && !status.clientIdConfigured && <div className="settings-hint">{note}</div>}
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
