export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface GlowPalette {
  primary: RGB;
  secondary: RGB;
  tertiary: RGB;
}

export type RepeatState = 'off' | 'context' | 'track';

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
  repeatState?: RepeatState;
  shuffle?: boolean;
  receivedAt?: number;
  error?: string;
}

// none  = no glow at all (default)
// trail = a directed beam of energy whipping around the perimeter
// aura  = traveling ripple waves along the perimeter
//
// Two modes that used to live here are gone, both deleted outright rather
// than replaced: 'ambience' (a static CSS conic-gradient ring — GradientMode
// went with it, it was the ring's only consumer) and 'lava' (metaball blobs).
// See settingsStore.ts for the migration off both saved values.
export type AnimationMode = 'none' | 'trail' | 'aura';

// Lyrics view backdrop.
// transparent = desktop shows through
// albumBlend  = darkened/desaturated tint of the album's dominant color
// solid       = flat black or white, no album influence ("get out of my way")
export type LyricsBackground = 'transparent' | 'albumBlend' | 'solid';
export type SolidColor = 'black' | 'white';

// Per-word/per-line animation treatment. All four share the same timestamp
// data and the same sizing/contrast rules — only the motion differs.
export type LyricStyle = 'karaokeFill' | 'bounce' | 'blurFocus' | 'stackedFade';

// Where now-playing data comes from. Both sit behind one provider interface in
// the main process so glow/widget/lyrics code is source-agnostic.
export type MusicSource = 'spotify' | 'appleMusic';

// fullscreen = window covers the whole display (bounds, taskbar included) —
// the ambient screen-edge glow the app is built around.
// windowed   = a bounded box, so the glow frames a panel instead of the screen.
export type WindowMode = 'fullscreen' | 'windowed';


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
  animationMode: AnimationMode;
  thickness: number; // px, glow depth from the top edge
  // Trail mode only. Length is a % of the total perimeter so it scales across
  // resolutions; null = auto (one screen width + half a screen height, worked
  // out from the live display size at runtime — see autoTrailLengthPct).
  trailLengthPct: number | null;
  trailSpeed: number; // px/sec the trail head travels at rest, before audio boost
  trailSpeedReactivity: number; // how hard bass pushes the speed up
  trailMaxSpeedMultiplier: number; // hard cap: speed never exceeds base * this
  trailTextureAmp1: number; // px, slow living-skin ripple
  trailTextureAmp2: number; // px, fast flicker
  auraWaveCount: number; // integer multiplier on the 3/5/8 base harmonics
  auraWaveHeight: number; // scales all wave amplitudes together
  auraWaveSpeed: number; // scales all wave phase speeds together
  auraRippleDetail: number; // px of noise on top of the sines; 0 = pure wave
  lyricsBackground: LyricsBackground;
  lyricsSolidColor: SolidColor;
  lyricStyle: LyricStyle;
  /** Overrides per-word size/weight variation in every lyric style: all words
   *  identical, progress shown purely by the highlight wipe. */
  equalWordEmphasis: boolean;
  /** Manual lyric sync trim, ms. Subtracted from playback position before
   *  picking the active line/word: POSITIVE holds the lyrics back (use when the
   *  highlight runs ahead of the vocal), negative pushes them earlier.
   *  Bluetooth/DAC output latency and per-track LRC offsets both land here —
   *  neither is knowable from the API, so the user gets a knob. */
  lyricsOffsetMs: number;
  albumFullBleed: boolean; // full-screen blurred album art behind the view
  musicSource: MusicSource;
  windowMode: WindowMode;
  autoHideWidget: boolean;
  /** Both floating boxes are always draggable — there is no "move mode" to
   *  turn on. Drags start only on empty chrome, never on a control. */
  widgetPosition: WidgetPosition | null;
  settingsPosition: WidgetPosition | null;
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

/** Default trail length, as a % of the perimeter.
 *
 * A % of the perimeter is ALREADY resolution-independent — that was the whole
 * point of using a percentage. An earlier version of this function instead
 * converted a target pixel length (screen width + half the screen height)
 * into a %, on the theory that raw percentages "only look right on 1080p".
 * They don't need converting: for (w + h/2) / (2*(w+h)), every plausible
 * monitor aspect ratio lands between ~25% and ~50% (16:9 gives ~37.5%,
 * always, regardless of the actual resolution) — so the conversion added
 * complexity without adding resolution-independence, AND it put the default
 * miles outside the 5-15%-of-perimeter band a "comet, not a ring" trail
 * needs (confirmed by testing: at ~37%, well over a third of the screen edge
 * was lit at once). A flat constant already scales correctly and lands in
 * the right band, so that's what this is now. `w`/`h` are unused but kept in
 * the signature — this is still "the auto value for this display" from every
 * caller's point of view, and changing that shape would ripple needlessly. */
export function autoTrailLengthPct(_w: number, _h: number): number {
  return 10;
}

/** Windowed-mode box. Explicit width/height, so the window opens as a bounded
 *  box instead of growing into an unbounded column. */
export const WINDOWED_SIZE = { width: 900, height: 700 };

export interface LyricLine {
  timeMs: number;
  text: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  animationMode: 'none',
  thickness: 26,
  trailLengthPct: null,
  trailSpeed: 1300,
  trailSpeedReactivity: 0.4,
  trailMaxSpeedMultiplier: 1.6,
  trailTextureAmp1: 4,
  trailTextureAmp2: 1.5,
  auraWaveCount: 1,
  auraWaveHeight: 1,
  auraWaveSpeed: 1,
  auraRippleDetail: 1.5,
  lyricsBackground: 'transparent',
  lyricsSolidColor: 'black',
  lyricStyle: 'karaokeFill',
  equalWordEmphasis: false,
  lyricsOffsetMs: 0,
  albumFullBleed: true,
  musicSource: 'spotify',
  windowMode: 'fullscreen',
  autoHideWidget: false,
  widgetPosition: null,
  settingsPosition: null,
  panelOpacity: 0.55,
  colorOverrideEnabled: false,
  overridePrimary: { r: 124, g: 92, b: 255 },
  overrideSecondary: { r: 79, g: 172, b: 254 },
  displayId: null,
  launchOnStartup: false,
  autoUpdateCheckEnabled: true,
  safeAreaOffsetPx: 0,
};
