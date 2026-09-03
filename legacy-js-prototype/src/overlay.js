const root = document.documentElement.style;
const blobsEl = document.getElementById('blobs');

// 8 anchor points around the perimeter — corners + edge-mids. Each drifts on
// its own independent timing so the glow never reads as one uniform shape.
const ANCHORS = [
  { x: '0%', y: '0%' }, { x: '50%', y: '0%' }, { x: '100%', y: '0%' },
  { x: '0%', y: '50%' }, { x: '100%', y: '50%' },
  { x: '0%', y: '100%' }, { x: '50%', y: '100%' }, { x: '100%', y: '100%' },
];

const blobs = ANCHORS.map((anchor, i) => {
  const wrap = document.createElement('div');
  wrap.className = 'blob-wrap';
  wrap.style.setProperty('--x', anchor.x);
  wrap.style.setProperty('--y', anchor.y);
  wrap.style.setProperty('--dur', `${8 + (i % 5) * 2.3}s`);
  wrap.style.setProperty('--delay', `${-(i * 1.7)}s`);

  const pulse = document.createElement('div');
  pulse.className = 'blob-pulse';

  const blob = document.createElement('div');
  blob.className = 'blob';
  blob.style.setProperty('--hue', `${(i % 2) * 18 - 9}deg`);

  pulse.appendChild(blob);
  wrap.appendChild(pulse);
  blobsEl.appendChild(wrap);
  return { wrap, pulse, blob, phase: (i / ANCHORS.length) * Math.PI * 2 };
});

let settings = { thickness: 28, intensity: 0.8, animation: 'breathe' };
let colors = null; // {primary:{r,g,b}, secondary:{r,g,b}}
let phase = 0;
let idleHue = Math.random();

// audio-reactive level, smoothed. Falls back to a gentle synthetic idle pulse
// when no system-audio level has arrived recently (capture failed/denied/no track).
let audioLevel = 0;
let targetAudioLevel = 0;
let lastAudioAt = 0;

window.glow.onAudio((level) => {
  targetAudioLevel = Math.max(0, Math.min(1, level));
  lastAudioAt = performance.now();
});

function rgbStr({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

function render(now) {
  const { thickness, intensity, animation } = settings;

  let primary, secondary;
  if (colors) {
    ({ primary, secondary } = colors);
  } else {
    idleHue = (idleHue + 0.0006) % 1;
    primary = hslToRgb(idleHue, 0.65, 0.55);
    secondary = hslToRgb((idleHue + 0.35) % 1, 0.65, 0.5);
  }

  let baseOpacity = intensity;
  if (animation === 'breathe') {
    phase += 0.01;
    baseOpacity = intensity * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(phase)));
  } else if (animation === 'pulse') {
    phase += 0.045;
    baseOpacity = intensity * (0.35 + 0.65 * Math.abs(Math.sin(phase)));
  }

  // real audio if we've heard from the capture recently; otherwise a soft
  // synthetic heartbeat so it's never dead flat even without mic/loopback access
  const audioFresh = now - lastAudioAt < 1500;
  const effectiveTarget = audioFresh ? targetAudioLevel : 0.18 + 0.1 * (0.5 + 0.5 * Math.sin(now / 900));
  audioLevel += (effectiveTarget - audioLevel) * (audioFresh ? 0.35 : 0.06);

  root.setProperty('--c1', rgbStr(primary));
  root.setProperty('--c2', rgbStr(secondary));
  root.setProperty('--glow-opacity', Math.min(1, baseOpacity + audioLevel * 0.25).toFixed(3));
  root.setProperty('--blur', `${thickness * 2.1}px`);

  blobs.forEach((b, i) => {
    b.blob.style.setProperty('--blob-color', i % 2 === 0 ? rgbStr(primary) : rgbStr(secondary));
    // per-blob jitter so a loud moment doesn't snap every blob in lockstep
    const jitter = 1 + audioLevel * (0.22 + 0.1 * Math.sin(now / 260 + b.phase));
    b.pulse.style.setProperty('--pulse', jitter.toFixed(3));
  });

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

window.glow.onColor((c) => {
  colors = c;
});

window.glow.onSettings((s) => {
  settings = { ...settings, ...s };
});

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
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
