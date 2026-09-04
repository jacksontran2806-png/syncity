import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AppSettings, type DisplayInfo, type AlbumPalette, type LyricLine, type NowPlaying } from '@shared/types';
import { anchorFromLocalEvent, anchorFromPoll, ZERO_ANCHOR, type PlaybackAnchor } from './lib/playbackClock';

export type PanelId = 'none' | 'settings';
// island = the dynamic-island-style compact widget (default)
// album  = fullscreen centered album art, centered on its own backdrop
// lyrics = fullscreen karaoke-style lyrics
export type ViewMode = 'island' | 'album' | 'lyrics';

interface LyriGlowState {
  nowPlaying: NowPlaying;
  /** The clock the lyric highlight actually runs on. Polls re-anchor it; the
   *  rAF loop in useLyricClock reads it every frame. See lib/playbackClock. */
  anchor: PlaybackAnchor;
  lyrics: LyricLine[] | null;
  palette: AlbumPalette;
  settings: AppSettings;
  panel: PanelId;
  viewMode: ViewMode;
  audioBars: Float32Array; // smoothed 0..1 magnitude per band, see audio.ts
  spotifyStatus: { authed: boolean; clientIdConfigured: boolean };
  monitors: DisplayInfo[];

  setNowPlaying: (np: NowPlaying) => void;
  /** Play/pause issued from our own transport. Moves the anchor now rather
   *  than waiting for a poll to notice, then sends the command. Throws if the
   *  command fails, so callers can surface it — the following repoll puts the
   *  anchor right again. */
  setPlaying: (play: boolean) => Promise<void>;
  setLyrics: (lines: LyricLine[] | null) => void;
  setPalette: (palette: AlbumPalette) => void;
  setPanel: (panel: PanelId) => void;
  togglePanel: (panel: Exclude<PanelId, 'none'>) => void;
  setViewMode: (mode: ViewMode) => void;
  setAudioBars: (bars: Float32Array) => void;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  refreshSpotifyStatus: () => Promise<void>;
  connectSpotify: () => Promise<void>;
  loadMonitors: () => Promise<void>;
}

const DEFAULT_PALETTE: AlbumPalette = {
  primary: { r: 124, g: 92, b: 255 },
  secondary: { r: 79, g: 172, b: 254 },
  tertiary: { r: 255, g: 92, b: 205 },
};

export const useStore = create<LyriGlowState>((set, get) => ({
  nowPlaying: { connected: false },
  anchor: ZERO_ANCHOR,
  lyrics: null,
  palette: DEFAULT_PALETTE,
  settings: DEFAULT_SETTINGS,
  panel: 'none',
  viewMode: 'island',
  audioBars: new Float32Array(0),
  spotifyStatus: { authed: false, clientIdConfigured: true },
  monitors: [],

  // Every poll re-anchors the clock. Nothing else in the app reads
  // progressMs/receivedAt directly any more — the anchor is the one place
  // "where are we in this song" is answered.
  setNowPlaying: (np) =>
    set((s) => ({ nowPlaying: np, anchor: anchorFromPoll(s.anchor, np, Date.now()) })),

  setPlaying: async (play) => {
    set((s) => ({ anchor: anchorFromLocalEvent(s.anchor, play, Date.now()) }));
    await window.lyriglow.playPause(play);
  },

  setLyrics: (lines) => set({ lyrics: lines }),
  setPalette: (palette) => set({ palette }),
  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? 'none' : panel })),
  setViewMode: (mode) => set({ viewMode: mode, panel: 'none' }),
  setAudioBars: (bars) => set({ audioBars: bars }),

  updateSettings: async (partial) => {
    const updated = await window.lyriglow.updateSettings(partial);
    set({ settings: updated });
  },

  refreshSpotifyStatus: async () => {
    const status = await window.lyriglow.spotifyStatus();
    set({ spotifyStatus: status });
  },

  connectSpotify: async () => {
    await window.lyriglow.spotifyConnect();
    await get().refreshSpotifyStatus();
  },

  loadMonitors: async () => {
    const monitors = await window.lyriglow.listMonitors();
    set({ monitors });
  },
}));
