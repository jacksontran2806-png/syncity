import { SpotifyClient } from '../spotify/client';
import type { NowPlayingProvider } from './types';

/** Thin adapter — SpotifyClient already matches the provider shape, this just
 *  adds the identity/config bits the abstraction needs. */
export function createSpotifyProvider(clientId: string | undefined, redirectUri: string): NowPlayingProvider {
  const client = new SpotifyClient(clientId, redirectUri);
  return {
    id: 'spotify',
    displayName: 'Spotify',
    isConfigured: () => !!clientId,
    isAuthed: () => client.isAuthed(),
    login: () => client.login(),
    getCurrentlyPlaying: () => client.getCurrentlyPlaying(),
    skipNext: () => client.skipNext(),
    skipPrevious: () => client.skipPrevious(),
    playPause: (play) => client.playPause(play),
  };
}
