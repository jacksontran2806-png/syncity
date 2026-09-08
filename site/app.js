// The album cycle — the page's only motion.
//
// Each entry is a cover colour and the lyric colour Syncity actually derives
// from it: a muted, analogous tint of the artwork rather than its opposite.
// These are the outputs of the app's own scoring (lib/lyricColor.ts) for those
// covers, so what the page demonstrates is what the app does, not an
// impression of it.
const PALETTES = [
  { name: 'Deep purple cover', cover: '#7c5cff', lyric: '#d8c2ff' },
  { name: 'Warm red cover', cover: '#dc3c28', lyric: '#f4cdc4' },
  { name: 'Green cover', cover: '#28b45a', lyric: '#c3e5cf' },
  { name: 'Blue cover', cover: '#1e5ac8', lyric: '#c4d6f6' },
  { name: 'Amber cover', cover: '#f0d228', lyric: '#f6e4b4' },
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
  // Only the two the demo owns. The page's ground and chrome belong to the
  // brand and stay where they are.
  root.style.setProperty('--cover', p.cover);
  root.style.setProperty('--lyric', p.lyric);
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
