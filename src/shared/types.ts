export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface AlbumPalette {
  primary: RGB;
  secondary: RGB;
  tertiary: RGB;
}

export interface NowPlaying {
  connected: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  artUrl?: string | null;
  /** Animated cover, when the provider actually has one (Apple Music exposes
   *  it for select editorial content only; Spotify not at all). */
  motionArtUrl?: string | null;
  progressMs?: number;
  durationMs?: number;
  trackId?: string;
  shuffle?: boolean;
  receivedAt?: number;
  /** Measured round trip of the poll that produced this, ms. Diagnostic only —
   *  the position above is already corrected by half of it. */
  pollLatencyMs?: number;
  error?: string;
}

// Lyrics view backdrop.
// transparent = desktop shows through
// albumBlend  = darkened/desaturated tint of the album's dominant color(s) —
//               see AppSettings.albumBlendColorCount for how many of the
//               palette's colors blend into it
// custom      = a flat color the user picks (AppSettings.lyricsCustomColor) —
//               replaces the old fixed black/white "solid" mode entirely,
//               since any color (including plain black or white) is just one
//               pick away in the color wheel now
export type LyricsBackground = 'transparent' | 'albumBlend' | 'custom';

// Per-word/per-line animation treatment. The first four share the same
// timestamp data, ActiveLine, and sizing/contrast rules — only the motion
// differs. giantWord is a distinct layout (one word at a time, own sizing) —
// see GiantWordStage.
export type LyricStyle = 'karaokeFill' | 'bounce' | 'blurFocus' | 'stackedFade' | 'giantWord';

// Where now-playing data comes from. Both sit behind one provider interface in
// the main process so widget/lyrics/palette code is source-agnostic.
export type MusicSource = 'spotify' | 'appleMusic';

// fullscreen = window covers the whole display (bounds, taskbar included) —
// the ambient full-screen overlay the app is built around.
// windowed   = a bounded box, so the overlay is a panel instead of the screen.
//
// NOT the same axis as OverlayMode below: this is the Electron window's own
// size, OverlayMode is where the compact widget sits inside it.
export type WindowMode = 'fullscreen' | 'windowed';

// How the compact widget is placed and revealed inside the overlay.
//
// default = the original behavior: parked top-centre below the safe-area
//           offset, fixed there (nothing to knock out of place).
// notch   = pinned flush to the top edge, horizontally centred, styled as a
//           screen notch. Reveals on hover from anywhere in a taller invisible
//           band around it, not just the pill's own few pixels.
// free    = drag it anywhere; the position persists across restarts and is
//           clamped back on-screen if the display it was on went away.
//
// Dragging belongs to Free mode alone — the other two own their placement.
export type OverlayMode = 'default' | 'notch' | 'free';

// Typeface pairing for the whole app. Each is a display face (track titles,
// Giant Word, album titles) plus a body face (everything else) — see
// lib/fontThemes.ts for the actual stacks. Only 'studio' uses the bundled
// woff2 files; the rest are built from faces Windows ships, so no option
// depends on a network fetch or adds to the bundle.
export type FontTheme = 'studio' | 'grotesk' | 'editorial' | 'system' | 'mono';

// How the widget transitions between its pill (collapsed) and full (expanded)
// states. genie = scale + corner-radius morph with a bit of overshoot, like
// it's growing out of/being sucked back into the pill. scaleFade/slideUp are
// smaller, quieter transitions. none = instant, no animation.
export type WidgetAnimStyle = 'genie' | 'scaleFade' | 'slideUp' | 'none';


/** Floating-box position, stored as a fraction of screen size so it survives a
 *  resolution or display change. Always the box's TOP-LEFT corner — there is no
 *  centering transform in play, because mixing `left: 50%; translateX(-50%)`
 *  with pointer coordinates during a drag is what made the box jump.
 *  null = the box's default placement. */
export interface WidgetPosition {
  xPct: number;
  yPct: number;
}

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
}

export interface AppSettings {
  lyricsBackground: LyricsBackground;
  /** Background color for lyricsBackground: 'custom'. */
  lyricsCustomColor: RGB;
  /** How many of the album palette's colors (primary/secondary/tertiary) blend
   *  into the lyricsBackground: 'albumBlend' backdrop. 1 = a single flat tint
   *  (the old behavior), 2-3 = a gradient across that many palette colors, so
   *  the backdrop actually reads as "from the album" instead of near-black. */
  albumBlendColorCount: 1 | 2 | 3;
  lyricStyle: LyricStyle;
  /** Manual lyric sync trim, ms. Subtracted from playback position before
   *  picking the active line/word: POSITIVE holds the lyrics back (use when the
   *  highlight runs ahead of the vocal), negative pushes them earlier.
   *  Bluetooth/DAC output latency and per-track LRC offsets both land here —
   *  neither is knowable from the API, so the user gets a knob. */
  lyricsOffsetMs: number;
  albumFullBleed: boolean; // full-screen blurred album art behind the view
  /** A flat custom color behind Album fullscreen mode, independent of
   *  albumFullBleed — lets the view have a deliberate solid color instead of
   *  whatever's behind the window when full-bleed art is off. */
  albumCustomBgEnabled: boolean;
  albumCustomColor: RGB;
  musicSource: MusicSource;
  windowMode: WindowMode;
  autoHideWidget: boolean;
  /** Pins the widget expanded, bypassing auto-hide entirely. Lives as a
   *  button on the widget itself (not buried in Settings) for anyone who
   *  just wants the full menu and never wants to think about the pill. */
  widgetLocked: boolean;
  widgetExpandAnimation: WidgetAnimStyle;
  widgetCollapseAnimation: WidgetAnimStyle;
  /** Typeface pairing for the whole app — see FontTheme. */
  fontTheme: FontTheme;
  /** Where the compact widget sits and how it's revealed — see OverlayMode. */
  overlayMode: OverlayMode;
  /** The widget's free-mode position (OverlayMode 'free'). Ignored by the
   *  other two modes, which compute their own placement, but kept so
   *  switching back to Free restores where it used to be. Settings box is
   *  always draggable regardless of mode. Drags start only on empty chrome,
   *  never on a control. */
  widgetPosition: WidgetPosition | null;
  settingsPosition: WidgetPosition | null;
  /** Collapsed pill size, px. Defaults match the pill's original fixed
   *  120x28 — raising these just gives the compact menu more room (bigger art
   *  thumbnail, wider waveform) without affecting the expanded widget. */
  pillWidth: number;
  pillHeight: number;
  /** How solid the widget and the settings window are, 0..1. 1 = flat opaque
   *  chrome, 0 = the panel body disappears entirely and only its contents
   *  remain over the desktop. Drives background, border, shadow, backdrop blur
   *  and a compensating text shadow together — fading the fill alone leaves a
   *  visible outlined rectangle floating over nothing. */
  panelOpacity: number;
  colorOverrideEnabled: boolean;
  overridePrimary: RGB;
  overrideSecondary: RGB;
  displayId: number | null;
  launchOnStartup: boolean;
  autoUpdateCheckEnabled: boolean;
  safeAreaOffsetPx: number;
}

/** Windowed-mode box. Explicit width/height, so the window opens as a bounded
 *  box instead of growing into an unbounded column. */
export const WINDOWED_SIZE = { width: 900, height: 700 };

export interface LyricLine {
  timeMs: number;
  text: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  lyricsBackground: 'transparent',
  lyricsCustomColor: { r: 18, g: 18, b: 26 },
  albumBlendColorCount: 2,
  lyricStyle: 'karaokeFill',
  lyricsOffsetMs: 0,
  albumFullBleed: true,
  albumCustomBgEnabled: false,
  albumCustomColor: { r: 18, g: 18, b: 26 },
  musicSource: 'spotify',
  windowMode: 'fullscreen',
  autoHideWidget: false,
  widgetLocked: false,
  widgetExpandAnimation: 'genie',
  widgetCollapseAnimation: 'genie',
  fontTheme: 'studio',
  overlayMode: 'default',
  widgetPosition: null,
  settingsPosition: null,
  pillWidth: 120,
  pillHeight: 28,
  panelOpacity: 0.55,
  colorOverrideEnabled: false,
  overridePrimary: { r: 124, g: 92, b: 255 },
  overrideSecondary: { r: 79, g: 172, b: 254 },
  displayId: null,
  launchOnStartup: false,
  autoUpdateCheckEnabled: true,
  safeAreaOffsetPx: 4,
};
