// The album cycle — the page's only motion.
//
// Each entry is a cover colour and the lyric colour Syncity actually derives
// from it: a muted, analogous tint of the artwork rather than its opposite.
// These are the outputs of the app's own scoring (lib/lyricColor.ts) for those
// covers, so what the page demonstrates is what the app does, not an
// impression of it.
const PALETTES = [
  { name: 'Deep purple cover', cover: '#7c5cff', lyric: '#d8c2ff', ground: '#0e0a16', raised: '#171126' },
  { name: 'Warm red cover', cover: '#dc3c28', lyric: '#f4cdc4', ground: '#150a08', raised: '#241310' },
  { name: 'Green cover', cover: '#28b45a', lyric: '#c3e5cf', ground: '#08130d', raised: '#0f2118' },
  { name: 'Blue cover', cover: '#1e5ac8', lyric: '#c4d6f6', ground: '#080e1b', raised: '#101a2c' },
  { name: 'Amber cover', cover: '#f0d228', lyric: '#f6e4b4', ground: '#151005', raised: '#241c0c' },
];

const HOLD_MS = 3600;

const root = document.documentElement;
const swatches = [...document.querySelectorAll('.album')];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// The swatch row is the legend for the cycle, so each one wears the cover
// colour it stands for.
swatches.forEach((el, i) => {
  el.style.setProperty('--album', PALETTES[i].cover);
  el.setAttribute('title', PALETTES[i].name);
  el.setAttribute('aria-label', PALETTES[i].name);
});

let index = 0;
let timer = null;

function show(i) {
  index = i % PALETTES.length;
  const p = PALETTES[index];
  root.style.setProperty('--cover', p.cover);
  root.style.setProperty('--lyric', p.lyric);
  root.style.setProperty('--ground', p.ground);
  root.style.setProperty('--raised', p.raised);
  swatches.forEach((el, n) => el.classList.toggle('is-playing', n === index));
}

function start() {
  stop();
  if (reduced.matches) return;
  timer = setInterval(() => show(index + 1), HOLD_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Clicking a swatch is a request to see that one, so the cycle stops rather
// than dragging the visitor onward a second later.
swatches.forEach((el, i) =>
  el.addEventListener('click', () => {
    stop();
    show(i);
  })
);

// Nothing to animate while the tab is in the background.
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
reduced.addEventListener('change', start);

show(0);
start();
