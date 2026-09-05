import type { NowPlaying } from '../../shared/types';

/**
 * The source is refusing requests for a while (HTTP 429).
 *
 * Carries the provider's own retry window rather than a guess, because the
 * only way out of a rate limit is to stop asking — and continuing to poll
 * through one generally extends it. Distinct from a generic failure so the
 * poll loop can go quiet for exactly as long as it's told to, and so the UI
 * can say "throttled" instead of "nothing playing", which is what made this
 * look like a broken app rather than a backed-off one.
 */
export class RateLimitError extends Error {
  constructor(readonly retryAfterS: number) {
    super(`rate_limited_${retryAfterS}s`);
    this.name = 'RateLimitError';
  }
}

export type ProviderTrack =
  | (Omit<NowPlaying, 'connected' | 'playing'> & {
      isPlaying: boolean;
      primaryArtist: string | null;
      shuffle: boolean;
    })
  | null;

/** Everything the widget/lyrics/palette code needs from a music source. Nothing
 *  above this line knows whether it's talking to Spotify or Apple Music —
 *  SpotifyClient already satisfies this shape structurally. */
export interface NowPlayingProvider {
  readonly id: 'spotify' | 'appleMusic';
  readonly displayName: string;
  /** False when the source can't be used at all yet (missing credentials). */
  isConfigured(): boolean;
  isAuthed(): boolean;
  login(): Promise<void>;
  getCurrentlyPlaying(): Promise<ProviderTrack>;
  skipNext(): Promise<void>;
  skipPrevious(): Promise<void>;
  playPause(play: boolean): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
}
