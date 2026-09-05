// Spotify Auth Code + PKCE flow, no client secret needed.
//
// Scopes: user-read-currently-playing, user-read-playback-state,
// user-modify-playback-state (skip/back — Premium-only on
// Spotify's side; free accounts get a 403 from these endpoints).
//
// CAUTION — not verified as production-ready: this app runs in Spotify's
// "Development Mode" (25 allowlisted users) until a Quota Extension request is
// approved. Do not distribute beyond yourself/testers without that approval.

import http from 'node:http';
import crypto from 'node:crypto';
import { shell } from 'electron';
import { base64url, loadTokens, saveTokens, type TokenSet } from './tokens';

const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const DEFAULT_PORT = 8888;
/** Refresh this many seconds before the token actually expires. */
const REFRESH_MARGIN_S = 60;

const PAGE = (body: string): string =>
  `<html><body style="font-family:sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div>${body}</div></body></html>`;

/** Owns the tokens and the login flow. The API client asks it for a valid
 *  access token and knows nothing about how one is obtained. */
export class SpotifyAuth {
  private tokens: TokenSet | null;
  private verifier = '';
  private state = '';
  private loginInFlight: Promise<void> | null = null;

  constructor(
    private clientId: string | undefined,
    private redirectUri: string
  ) {
    this.tokens = loadTokens();
  }

  isAuthed(): boolean {
    return !!this.tokens?.refresh_token;
  }

  /** Guards against a second click while a login is already waiting on the
   *  OAuth callback — without this, each click spun up its own loopback server
   *  on the same port, and the second one's bind failure was an unhandled
   *  'error' event that crashed the whole main process. */
  login(): Promise<void> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.doLogin().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  /** A valid access token, refreshing first if it's close to expiry. */
  async accessToken(): Promise<string> {
    if (!this.tokens) throw new Error('not_authed');
    const ageS = (Date.now() - this.tokens.obtained_at) / 1000;
    if (ageS < this.tokens.expires_in - REFRESH_MARGIN_S) return this.tokens.access_token;

    const fresh = await this.postToken({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
      client_id: this.clientId ?? '',
    });
    // A refresh response may omit refresh_token, meaning "keep using the one
    // you have". Dropping it here would log the user out on the next refresh.
    if (!fresh.refresh_token) fresh.refresh_token = this.tokens.refresh_token;
    this.store(fresh);
    return fresh.access_token;
  }

  private store(tokens: TokenSet): void {
    tokens.obtained_at = Date.now();
    this.tokens = tokens;
    saveTokens(tokens);
  }

  private async postToken(body: Record<string, string>): Promise<TokenSet> {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!resp.ok) throw new Error(`token request failed: ${resp.status} ${await resp.text()}`);
    return (await resp.json()) as TokenSet;
  }

  private buildAuthorizeUrl(): string {
    this.verifier = base64url(crypto.randomBytes(64));
    this.state = base64url(crypto.randomBytes(16));
    const challenge = base64url(crypto.createHash('sha256').update(this.verifier).digest());

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId ?? '',
      scope: SCOPES,
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state: this.state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Opens the browser and waits on a one-shot loopback server for the
   *  redirect that carries the authorization code. */
  private awaitCallbackCode(authUrl: string): Promise<string> {
    const url = new URL(this.redirectUri);
    const port = Number(url.port || DEFAULT_PORT);

    return new Promise<string>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== url.pathname) {
          res.writeHead(404);
          res.end();
          return;
        }

        const finish = (body: string, err?: Error) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(PAGE(body));
          server.close();
          if (err) reject(err);
          else resolve(reqUrl.searchParams.get('code') ?? '');
        };

        const denied = reqUrl.searchParams.get('error');
        if (denied) return finish('Auth denied. Close this tab.', new Error(denied));
        // CSRF check: the state we sent must come back unchanged.
        if (reqUrl.searchParams.get('state') !== this.state) {
          return finish('State mismatch.', new Error('state_mismatch'));
        }
        finish('Connected to Spotify. You can close this tab.');
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        reject(
          err.code === 'EADDRINUSE'
            ? new Error(
                `redirect_port_in_use: something else (maybe a stuck previous attempt) is already listening on 127.0.0.1:${port}`
              )
            : err
        );
      });

      server.listen(port, '127.0.0.1', () => {
        shell.openExternal(authUrl).catch(reject);
      });
    });
  }

  private async doLogin(): Promise<void> {
    if (!this.clientId) throw new Error('SPOTIFY_CLIENT_ID not set — see .env.example');
    const code = await this.awaitCallbackCode(this.buildAuthorizeUrl());
    this.store(
      await this.postToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        code_verifier: this.verifier,
      })
    );
  }
}
