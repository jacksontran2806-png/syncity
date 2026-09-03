// Spotify Auth Code + PKCE flow, no client secret needed.
// Prototype scope: user-read-currently-playing, user-read-playback-state,
// user-modify-playback-state (skip/back/repeat — Premium-only on Spotify's
// side; free accounts get a 403 from these endpoints, not a bug here).
// NOTE: app runs in Spotify "Development Mode" (25 allowlisted users cap) until
// Spotify approves a quota extension request. Do not treat this as solved for
// a public release — see chat writeup.

const http = require('http');
const crypto = require('crypto');
const { shell, app } = require('electron');
const path = require('path');
const fs = require('fs');

const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

function tokenPath() {
  return path.join(app.getPath('userData'), 'tokens.json');
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(tokenPath(), 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(tokenPath(), JSON.stringify(tokens, null, 2));
}

class SpotifyClient {
  constructor(clientId, redirectUri) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.tokens = loadTokens();
  }

  isAuthed() {
    return !!(this.tokens && this.tokens.refresh_token);
  }

  buildAuthorizeUrl() {
    const verifier = base64url(crypto.randomBytes(64));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    this._verifier = verifier;
    const state = base64url(crypto.randomBytes(16));
    this._state = state;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: SCOPES,
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async login() {
    const authUrl = this.buildAuthorizeUrl();
    const url = new URL(this.redirectUri);
    const port = url.port || 8888;

    const codePromise = new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== url.pathname) {
          res.writeHead(404);
          res.end();
          return;
        }
        const err = reqUrl.searchParams.get('error');
        const returnedState = reqUrl.searchParams.get('state');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (err) {
          res.end('<html><body style="font-family:sans-serif;background:#111;color:#eee">Auth denied. Close this tab.</body></html>');
          server.close();
          reject(new Error(err));
          return;
        }
        if (returnedState !== this._state) {
          res.end('<html><body>State mismatch.</body></html>');
          server.close();
          reject(new Error('state_mismatch'));
          return;
        }
        res.end('<html><body style="font-family:sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div>Connected to Spotify. You can close this tab.</div></body></html>');
        server.close();
        resolve(reqUrl.searchParams.get('code'));
      });
      server.listen(port, '127.0.0.1');
    });

    await shell.openExternal(authUrl);
    const code = await codePromise;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: this._verifier,
    });
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!resp.ok) throw new Error(`token exchange failed: ${resp.status} ${await resp.text()}`);
    const tokens = await resp.json();
    tokens.obtained_at = Date.now();
    this.tokens = tokens;
    saveTokens(tokens);
    return tokens;
  }

  async ensureFreshToken() {
    if (!this.tokens) throw new Error('not_authed');
    const age = (Date.now() - (this.tokens.obtained_at || 0)) / 1000;
    if (age < (this.tokens.expires_in || 3600) - 60) return this.tokens.access_token;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
      client_id: this.clientId,
    });
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!resp.ok) throw new Error(`refresh failed: ${resp.status}`);
    const fresh = await resp.json();
    fresh.obtained_at = Date.now();
    if (!fresh.refresh_token) fresh.refresh_token = this.tokens.refresh_token;
    this.tokens = fresh;
    saveTokens(fresh);
    return fresh.access_token;
  }

  // Returns null when nothing playing / paused / no track — never throws for those cases.
  // Uses /v1/me/player (not /currently-playing) because we need repeat_state for the loop toggle.
  async getCurrentlyPlaying() {
    const token = await this.ensureFreshToken();
    const resp = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 204) return null; // nothing playing / no active device
    if (resp.status === 401) throw new Error('unauthorized');
    if (!resp.ok) throw new Error(`spotify_api_${resp.status}`);
    const data = await resp.json();
    if (!data || !data.item) return null;
    const images = data.item.album?.images || [];
    return {
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms,
      trackId: data.item.id,
      title: data.item.name,
      artist: (data.item.artists || []).map((a) => a.name).join(', '),
      primaryArtist: data.item.artists?.[0]?.name || null,
      album: data.item.album?.name,
      artUrl: images[0]?.url || null,
      repeatState: data.repeat_state, // 'off' | 'context' | 'track'
    };
  }

  async _playerCommand(method, path) {
    const token = await this.ensureFreshToken();
    const resp = await fetch(`https://api.spotify.com/v1/me/player/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) throw new Error('unauthorized');
    if (resp.status === 403) throw new Error('forbidden_premium_required');
    if (resp.status === 404) throw new Error('no_active_device');
    if (!resp.ok && resp.status !== 204) throw new Error(`spotify_api_${resp.status}`);
  }

  skipNext() {
    return this._playerCommand('POST', 'next');
  }

  skipPrevious() {
    return this._playerCommand('POST', 'previous');
  }

  // cycles the classic Spotify order: off -> context -> track -> off
  setRepeat(state) {
    return this._playerCommand('PUT', `repeat?state=${state}`);
  }
}

module.exports = { SpotifyClient };
