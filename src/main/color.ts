import Vibrant from 'node-vibrant';
import type { GlowPalette, RGB } from '../shared/types';

const FALLBACK: GlowPalette = {
  primary: { r: 124, g: 92, b: 255 },
  secondary: { r: 79, g: 172, b: 254 },
  tertiary: { r: 255, g: 92, b: 205 },
};

function vec3ToRgb(v: [number, number, number]): RGB {
  return { r: Math.round(v[0]), g: Math.round(v[1]), b: Math.round(v[2]) };
}

export async function extractGlowPalette(imageUrl: string): Promise<GlowPalette> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`art_fetch_${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());

  const palette = await Vibrant.from(buf).getPalette();

  const primarySwatch = palette.Vibrant ?? palette.LightVibrant ?? palette.Muted ?? palette.DarkVibrant ?? palette.DarkMuted ?? palette.LightMuted;
  const secondarySwatch = palette.DarkVibrant ?? palette.DarkMuted ?? palette.Muted ?? primarySwatch;
  const tertiarySwatch = palette.LightVibrant ?? palette.LightMuted ?? palette.Muted ?? primarySwatch;

  if (!primarySwatch) return FALLBACK;

  return {
    primary: vec3ToRgb(primarySwatch.rgb),
    secondary: vec3ToRgb((secondarySwatch ?? primarySwatch).rgb),
    tertiary: vec3ToRgb((tertiarySwatch ?? primarySwatch).rgb),
  };
}
