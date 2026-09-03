import type { NowPlaying, RepeatState } from '../../shared/types';

export type ProviderTrack =
  | (Omit<NowPlaying, 'connected' | 'playing'> & {
      isPlaying: boolean;
      primaryArtist: string | null;
      shuffle: boolean;
    })
  | null;

/** Everything the glow/widget/lyrics code needs from a music source. Nothing
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
  setRepeat(state: RepeatState): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
}
