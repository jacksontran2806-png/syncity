import type { NowPlayingProvider, ProviderTrack } from './types';

// Apple Music, via MusicKit JS.
//
// NOT FUNCTIONAL YET, and deliberately not faked. Making this real needs
// things that can't be shipped in code alone:
//   1. An Apple Developer Program membership, a MusicKit identifier, and a
//      private key (.p8). The developer token is an ES256 JWT signed with
//      that key — it has to be minted from credentials the developer holds,
//      it cannot be embedded in an open build.
//   2. Apple ID authorization at runtime, and an active Apple Music
//      subscription on that account. Apple gives no read-only/free tier for
//      playback state.
//   3. MusicKit JS runs in a browser context, so it belongs in a renderer or
//      hidden window, not in this main-process module — wiring it up means
//      routing its calls back over IPC.
//
// Motion artwork: Apple's public API does NOT expose animated covers for
// arbitrary tracks, only select editorial content. When it does exist it
// arrives as editorialVideo/motionArtwork on the item and gets mapped onto
// NowPlaying.motionArtUrl; otherwise the UI falls back to a Ken-Burns push on
// the static art (see AlbumBackdrop.tsx) rather than pretending video exists.

const NOT_CONFIGURED = 'apple_music_not_configured';

function unavailable(): never {
  throw new Error(NOT_CONFIGURED);
}

/** Apple Music behind the same interface as Spotify. Currently a stub: every
 *  call reports unavailable until the MusicKit integration lands. */
export function createAppleMusicProvider(developerToken?: string): NowPlayingProvider {
  return {
    id: 'appleMusic',
    displayName: 'Apple Music',
    isConfigured: () => !!developerToken,
    isAuthed: () => false,
    login: async () => unavailable(),
    getCurrentlyPlaying: async (): Promise<ProviderTrack> => null,
    skipNext: async () => unavailable(),
    skipPrevious: async () => unavailable(),
    playPause: async () => unavailable(),
  };
}
