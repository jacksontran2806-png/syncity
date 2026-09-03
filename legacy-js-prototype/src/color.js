// Album art -> a vibrant two-color pair for a gradient glow (matches the
// "Gradient: 2 Colors" style aesthetic apps in this space use, rather than
// one muddy averaged color). Pure JS (Jimp), no native deps.
const Jimp = require('jimp');

const HUE_BINS = 16;

async function extractGlowColors(imageUrl) {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`art_fetch_${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const img = await Jimp.read(buf);
  img.resize(32, 32);

  const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));

  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    // downweight near-black/near-white/washed-out pixels so glow reads as color, not gray
    const brightnessWeight = Math.max(0, 1 - Math.abs(l - 0.55) * 1.5);
    const weight = Math.max(0.03, s) * brightnessWeight;
    const bin = Math.min(HUE_BINS - 1, Math.floor(h * HUE_BINS));
    bins[bin].weight += weight;
    bins[bin].r += r * weight;
    bins[bin].g += g * weight;
    bins[bin].b += b * weight;
  });

  const ranked = bins
    .map((bin, i) => ({ ...bin, index: i }))
    .filter((bin) => bin.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  if (!ranked.length) {
    // fully flat/black art — fall back to a neutral vibrant default rather than black glow
    return { primary: { r: 130, g: 90, b: 230 }, secondary: { r: 90, g: 60, b: 180 } };
  }

  const primaryBin = ranked[0];
  const primary = vibrantize(primaryBin.r / primaryBin.weight, primaryBin.g / primaryBin.weight, primaryBin.b / primaryBin.weight);

  // secondary = strongest bin that's meaningfully separated in hue from primary
  const minSeparation = 3; // ~67.5deg across 16 bins
  const secondaryBin = ranked.find((bin) => {
    const dist = Math.min(Math.abs(bin.index - primaryBin.index), HUE_BINS - Math.abs(bin.index - primaryBin.index));
    return dist >= minSeparation && bin.weight > primaryBin.weight * 0.12;
  });

  let secondary;
  if (secondaryBin) {
    secondary = vibrantize(secondaryBin.r / secondaryBin.weight, secondaryBin.g / secondaryBin.weight, secondaryBin.b / secondaryBin.weight);
  } else {
    // monochrome art — synthesize a companion hue so the gradient still has motion
    const [h, s, l] = rgbToHsl(primary.r, primary.g, primary.b);
    const [r, g, b] = hslToRgb((h + 0.12) % 1, s, l);
    secondary = { r, g, b };
  }

  return { primary, secondary };
}

function vibrantize(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const boostedS = clamp01(s * 1.7 + 0.15);
  const targetL = clamp(l, 0.42, 0.62);
  const [nr, ng, nb] = hslToRgb(h, boostedS, targetL);
  return { r: nr, g: ng, b: nb };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

module.exports = { extractGlowColors };
