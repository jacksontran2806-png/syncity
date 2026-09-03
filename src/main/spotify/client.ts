// Spotify Web API calls. Auth lives in auth.ts; this file assumes a token.
//
// CAUTION: /v1/audio-features and /v1/audio-analysis are blocked for any app
// registered after 2024-11-27 (confirmed against Spotify's own changelog) —
// that's why the reactive glow modes use live audio capture instead of
// Spotify's precomputed beat grid.

import { SpotifyAuth } from './auth';
import type { NowPlaying, RepeatState } from '../../shared/types';

const API = 'https://api.spotify.com/v1';

interface SpotifyPlayerResponse {
  is_playing: boolean;
  progress_ms: number;
  repeat_state: string;
  shuffle_state: boolean;
  item: {
    id: string;
    name: string;
    duration_ms: number;
    artists?: { name: string }[];
    album?: { name: string; images?: { url: string }[] };
  } | null;
}

export type CurrentTrack = Omit<NowPlaying, 'connected' | 'playing'> & {
  isPlaying: boolean;
  primaryArtist: string | null;
  shuffle: boolean;
};

export class SpotifyClient {
  private auth: SpotifyAuth;

  constructor(clientId: string | undefined, redirectUri: string) {
    this.auth = new SpotifyAuth(clientId, redirectUri);
  }

  isAuthed(): boolean {
    return this.auth.isAuthed();
  }

  login(): Promise<void> {
    return this.auth.login();
  }

  /** Returns null when nothing is playing / paused / no active device — it
   *  never throws for those. Uses /me/player rather than /currently-playing
   *  because repeat_state and shuffle_state are needed too. */
  async getCurrentlyPlaying(): Promise<CurrentTrack | null> {
    const resp = await fetch(`${API}/me/player`, {
      headers: { Authorization: `Bearer ${await this.auth.accessToken()}` },
    });
    if (resp.status === 204) return null; // nothing playing
    if (resp.status === 401) throw new Error('unauthorized');
    if (!resp.ok) throw new Error(`spotify_api_${resp.status}`);

    const data = (await resp.json()) as SpotifyPlayerResponse | null;
    if (!data?.item) return null;

    const artists = data.item.artists ?? [];
    return {
      isPlaying: data.is_playing,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms,
      trackId: data.item.id,
      title: data.item.name,
      artist: artists.map((a) => a.name).join(', '),
      primaryArtist: artists[0]?.name ?? null,
      album: data.item.album?.name,
      artUrl: data.item.album?.images?.[0]?.url ?? null,
      repeatState: data.repeat_state as RepeatState,
      shuffle: !!data.shuffle_state,
    };
  }

  /** Transport commands share one error mapping — the widget turns these codes
   *  into the messages the user actually sees (see Widget.tsx guardMessage). */
  private async command(method: string, subpath: string): Promise<void> {
    const resp = await fetch(`${API}/me/player/${subpath}`, {
      method,
      headers: { Authorization: `Bearer ${await this.auth.accessToken()}` },
    });
    if (resp.status === 401) throw new Error('unauthorized');
    if (resp.status === 403) throw new Error('forbidden_premium_required');
    if (resp.status === 404) throw new Error('no_active_device');
    if (!resp.ok && resp.status !== 204) throw new Error(`spotify_api_${resp.status}`);
  }

  skipNext = (): Promise<void> => this.command('POST', 'next');
  skipPrevious = (): Promise<void> => this.command('POST', 'previous');
  playPause = (play: boolean): Promise<void> => this.command('PUT', play ? 'play' : 'pause');
  /** Caller cycles the classic Spotify order: off -> context -> track -> off. */
  setRepeat = (state: RepeatState): Promise<void> => this.command('PUT', `repeat?state=${state}`);
  setShuffle = (enabled: boolean): Promise<void> => this.command('PUT', `shuffle?state=${enabled}`);
}
