import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AppSettings, type DisplayInfo, type GlowPalette, type LyricLine, type NowPlaying } from '@shared/types';

export type PanelId = 'none' | 'settings';
// island = the dynamic-island-style compact widget (default)
// album  = fullscreen centered album art, glow outline running the perimeter
// lyrics = fullscreen karaoke-style lyrics
export type ViewMode = 'island' | 'album' | 'lyrics';

interface LyriGlowState {
  nowPlaying: NowPlaying;
  lyrics: LyricLine[] | null;
  palette: GlowPalette;
  settings: AppSettings;
  panel: PanelId;
  viewMode: ViewMode;
  audioLevel: number; // smoothed bass envelope, 0..1
  spotifyStatus: { authed: boolean; clientIdConfigured: boolean };
  monitors: DisplayInfo[];

  setNowPlaying: (np: NowPlaying) => void;
  setLyrics: (lines: LyricLine[] | null) => void;
  setPalette: (palette: GlowPalette) => void;
  setPanel: (panel: PanelId) => void;
  togglePanel: (panel: Exclude<PanelId, 'none'>) => void;
  setViewMode: (mode: ViewMode) => void;
  setAudioLevel: (level: number) => void;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  refreshSpotifyStatus: () => Promise<void>;
  connectSpotify: () => Promise<void>;
  loadMonitors: () => Promise<void>;
}

const DEFAULT_PALETTE: GlowPalette = {
  primary: { r: 124, g: 92, b: 255 },
  secondary: { r: 79, g: 172, b: 254 },
  tertiary: { r: 255, g: 92, b: 205 },
};

export const useStore = create<LyriGlowState>((set, get) => ({
  nowPlaying: { connected: false },
  lyrics: null,
  palette: DEFAULT_PALETTE,
  settings: DEFAULT_SETTINGS,
  panel: 'none',
  viewMode: 'island',
  audioLevel: 0,
  spotifyStatus: { authed: false, clientIdConfigured: true },
  monitors: [],

  setNowPlaying: (np) => set({ nowPlaying: np }),
  setLyrics: (lines) => set({ lyrics: lines }),
  setPalette: (palette) => set({ palette }),
  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? 'none' : panel })),
  setViewMode: (mode) => set({ viewMode: mode, panel: 'none' }),
  setAudioLevel: (level) => set({ audioLevel: level }),

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
