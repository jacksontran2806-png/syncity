// Token persistence. Split out so auth.ts is about the OAuth dance and nothing
// else — this file is the only thing that knows tokens live on disk.

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  obtained_at: number;
  [key: string]: unknown;
}

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'tokens.json');
}

/** base64url, as PKCE requires — plain base64 is rejected. */
export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reads the persisted OAuth tokens, or null if absent/unreadable. */
export function loadTokens(): TokenSet | null {
  try {
    return JSON.parse(fs.readFileSync(tokenPath(), 'utf8'));
  } catch {
    return null;
  }
}

/** Persists OAuth tokens to userData, so a restart does not re-prompt. */
export function saveTokens(tokens: TokenSet): void {
  fs.writeFileSync(tokenPath(), JSON.stringify(tokens, null, 2));
}

/** Forgets the stored session.
 *
 *  Called on sign-out, and forced whenever the client ID changes: tokens are
 *  issued to one Spotify application, so keeping them across a change would
 *  leave the app holding credentials the new application cannot refresh, which
 *  reads as a mysterious "connected but nothing works". */
export function clearTokens(): void {
  try {
    fs.rmSync(tokenPath(), { force: true });
  } catch {
    // Nothing to forget, or the file is already gone.
  }
}
