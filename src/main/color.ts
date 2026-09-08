import { nativeImage } from 'electron';
import { extractSwatches } from './swatches';
import type { AlbumPalette, RGB } from '../shared/types';

const FALLBACK: AlbumPalette = {
  primary: { r: 124, g: 92, b: 255 },
  secondary: { r: 79, g: 172, b: 254 },
  tertiary: { r: 255, g: 92, b: 205 },
};

/** Enough pixels to be representative, few enough that the histogram is
 *  instant. Spotify's art arrives at 640×640 — 40,000× more samples than the
 *  answer needs, and the decode is the expensive half either way. */
const SAMPLE_WIDTH = 64;

/** Pulls a three-colour palette out of the album art. Falls back to the app's
 *  default purple/blue/pink when the art yields no usable swatch. Throws only
 *  if the artwork itself can't be fetched.
 *
 *  Decoding goes through Electron's own nativeImage rather than a JS image
 *  library: Chromium is already linked into this process and already knows
 *  every format the artwork can arrive in, so the only thing left to ship is
 *  the colour scoring in swatches.ts. */
export async function extractAlbumPalette(imageUrl: string): Promise<AlbumPalette> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`art_fetch_${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());

  // An undecodable buffer comes back as an EMPTY image rather than as a throw,
  // and resize() on it would hand back an empty bitmap with no explanation.
  const image = nativeImage.createFromBuffer(buf);
  if (image.isEmpty()) return FALLBACK;

  // Width only: the height follows the aspect ratio, so a non-square cover
  // isn't squashed into one before its colours are counted.
  const small = image.resize({ width: SAMPLE_WIDTH, quality: 'good' });
  const palette = extractSwatches(small.getBitmap());

  const primarySwatch = palette.Vibrant ?? palette.LightVibrant ?? palette.Muted ?? palette.DarkVibrant ?? palette.DarkMuted ?? palette.LightMuted;
  const secondarySwatch = palette.DarkVibrant ?? palette.DarkMuted ?? palette.Muted ?? primarySwatch;
  const tertiarySwatch = palette.LightVibrant ?? palette.LightMuted ?? palette.Muted ?? primarySwatch;

  if (!primarySwatch) return FALLBACK;

  return {
    primary: primarySwatch,
    secondary: secondarySwatch ?? primarySwatch,
    tertiary: tertiarySwatch ?? primarySwatch,
  } satisfies Record<keyof AlbumPalette, RGB>;
}
