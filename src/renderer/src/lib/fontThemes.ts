import type { FontTheme } from '@shared/types';

// The actual typeface stacks behind each FontTheme.
//
// ONE SOURCE OF TRUTH, deliberately: these feed the --font-display /
// --font-body custom properties (App.tsx) that every stylesheet reads, AND
// GiantWordStage's canvas measurement. Those two must agree exactly — the
// giant word is sized by measuring text on a canvas and scaling until it fits
// the screen, so measuring in a different face than it renders in would size
// every word wrong.
//
// Only 'studio' uses the bundled woff2 files (see fonts.css). The rest are
// built from faces Windows ships with, so switching costs no download and
// adds nothing to the bundle. Every stack ends in a generic family, so a
// missing face degrades instead of falling back to Times.

export interface FontThemeSpec {
  /** Track titles, album titles, Giant Word — the loud text. */
  display: string;
  /** Everything else: settings, lyrics lines, transport labels. */
  body: string;
  /** Shown in the Settings dropdown. */
  label: string;
}

const FALLBACK = `-apple-system, 'Segoe UI', system-ui, sans-serif`;

export const FONT_THEMES: Record<FontTheme, FontThemeSpec> = {
  // The app's own look: geometric display face over a neutral grotesque.
  studio: {
    label: 'Studio (Clash Display)',
    display: `'Clash Display', ${FALLBACK}`,
    body: `'General Sans', ${FALLBACK}`,
  },
  // One family throughout — quieter and more uniform than Studio.
  grotesk: {
    label: 'Grotesk (General Sans)',
    display: `'General Sans', ${FALLBACK}`,
    body: `'General Sans', ${FALLBACK}`,
  },
  // High-contrast serif display over a clean body face — magazine-ish.
  editorial: {
    label: 'Editorial (serif)',
    display: `Georgia, Cambria, 'Times New Roman', serif`,
    body: `'General Sans', ${FALLBACK}`,
  },
  // Whatever the OS considers its best UI face.
  system: {
    label: 'System (Segoe UI)',
    display: `'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif`,
    body: `'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`,
  },
  // Technical and deliberate; tabular by nature, so nothing shifts as it ticks.
  mono: {
    label: 'Mono (Cascadia)',
    display: `'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace`,
    body: `'Cascadia Mono', Consolas, ui-monospace, monospace`,
  },
};

/** Falls back to the app's own pairing if a saved theme name is unknown —
 *  a settings file from a newer build must not leave the UI unstyled. */
export function fontThemeSpec(theme: FontTheme): FontThemeSpec {
  return FONT_THEMES[theme] ?? FONT_THEMES.studio;
}
