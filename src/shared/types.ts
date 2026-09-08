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
  receivedAt?: number;
  /** When a rate limit lifts (epoch ms), if the source is currently throttling
   *  us. Paired with error: 'rate_limited'. */
  retryAtMs?: number;
  /** Measured round trip of the poll that produced this, ms. Diagnostic only —
   *  the position above is already corrected by half of it. */
  pollLatencyMs?: number;
  error?: string;
}

// Lyrics view backdrop. What sits behind the words, and whether anything does.
//
// albumCover = the cover, blurred and filled edge to edge, over an opaque
//              base. The desktop does NOT show through: this is the "watch the
//              lyrics" mode.
// clear      = nothing at all. Just the words over whatever is already on
//              screen — a game, a document, the desktop.
// albumBlend = a gradient mixed from the album's palette.
// custom     = one flat colour of the user's choosing.
export type LyricsBackground = 'albumCover' | 'clear' | 'albumBlend' | 'custom';

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
// notch = pinned flush to the top edge, horizontally centred, styled as a
//         screen notch. Opens on hover over the notch itself.
// free  = drag it anywhere; the position persists across restarts and is
//         clamped back on-screen if the display it was on went away.
//
// A third 'default' mode (parked top-centre, not draggable) was removed — it
// was Free without the dragging, so it earned nothing. Saved settings holding
// it migrate to 'free', the closer of the two. See settingsStore.
export type OverlayMode = 'notch' | 'free';

// Chrome fill for the notch/pill and the panels.
//
// neutral = the app's own near-black, the same whatever is playing.
// album   = tinted toward the cover's dominant colour, darkened enough to keep
//           white text readable — the chrome takes on the record's character
//           instead of sitting on top of it.
export type ChromeTint = 'neutral' | 'album';

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

/**
 * Where an in-place update has got to.
 *
 * One shape for every state, so the settings panel renders a single value
 * rather than combining a set of flags. 'unsupported' is a real, expected
 * state, not a failure: the portable build has no installer to apply an
 * update with, and a build running from source must never update itself.
 */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'unsupported' | 'error';
  version?: string;
  /** 0-100 while downloading. */
  percent?: number;
  /** Human-readable, for 'error' and 'unsupported'. */
  message?: string;
  currentVersion: string;
}

/** What the renderer knows about the Spotify connection. */
export interface SpotifyStatus {
  authed: boolean;
  /** Whether ANY client ID is in force — the user's, the environment's, or the
   *  one the build shipped with. */
  clientIdConfigured: boolean;
  /** The user's own, if they have set one. Empty means the build's is in use.
   *  Public identifier, not a secret — see AppSettings.spotifyClientId. */
  clientId: string;
  /** The loopback URL the user has to register on their Spotify app. */
  redirectUri: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
}

export interface AppSettings {
  /** The Spotify application this install authenticates against.
   *
   *  Empty means "use whatever the build shipped with". A downloaded build
   *  carries one, but Spotify caps an app that hasn't passed quota review at
   *  25 authorised listeners — so anyone past that number has to point Syncity
   *  at an app of their own, and this is where that goes. It is a public
   *  identifier, not a secret: the desktop flow is Auth Code + PKCE, which has
   *  no client secret at all. */
  spotifyClientId: string;
  lyricsBackground: LyricsBackground;
  /** Background color for lyricsBackground: 'custom'. */
  lyricsCustomColor: RGB;
  /** How many of the album palette's colors (primary/secondary/tertiary) blend
   *  into the lyricsBackground: 'albumBlend' backdrop. 1 = a single flat tint
   *  (the old behavior), 2-3 = a gradient across that many palette colors, so
   *  the backdrop actually reads as "from the album" instead of near-black. */
  albumBlendColorCount: 1 | 2 | 3;
  lyricStyle: LyricStyle;
  /** Multiplies every lyric size in every view — the active line, the stacked
   *  context rows, the next-line preview and the Giant Word's measured fit.
   *  One control rather than a size per style: the styles already differ in
   *  scale by design, and "make it bigger" is a property of the screen and the
   *  distance the user is sitting at, not of the style they picked. */
  lyricsScale: number;
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
  /** How long the pointer has to rest on the pill, or in the notch's reveal
   *  band, before the widget opens. Both modes read it — see
   *  renderer/lib/hoverTiming for the bounds and why they are what they are. */
  hoverExpandDelayMs: number;
  /** Where the compact widget sits and how it's revealed — see OverlayMode. */
  overlayMode: OverlayMode;
  /** Neutral chrome, or tinted from the album cover — see ChromeTint. */
  chromeTint: ChromeTint;
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
  spotifyClientId: '',
  lyricsBackground: 'albumCover',
  lyricsCustomColor: { r: 18, g: 18, b: 26 },
  albumBlendColorCount: 2,
  lyricStyle: 'karaokeFill',
  lyricsScale: 1,
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
  hoverExpandDelayMs: 1500,
  overlayMode: 'notch',
  chromeTint: 'neutral',
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
