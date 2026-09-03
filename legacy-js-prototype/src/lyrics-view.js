const bg = document.getElementById('bg');
const art = document.getElementById('art');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const listEl = document.getElementById('lyricsList');
const emptyEl = document.getElementById('empty');

const prevViewBtn = document.getElementById('prevViewBtn');
const nextViewBtn = document.getElementById('nextViewBtn');
const repeatViewBtn = document.getElementById('repeatViewBtn');
const transportMsg = document.getElementById('transportMsg');

let lines = null;
let lastNp = null;
let receivedAt = 0;
let msgTimer = null;

function flashMessage(text) {
  transportMsg.textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { transportMsg.textContent = ''; }, 3000);
}

async function guardedTransport(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.message.includes('forbidden_premium_required')) flashMessage('Playback control needs Spotify Premium.');
    else if (err.message.includes('no_active_device')) flashMessage('No active Spotify device.');
    else if (err.message.includes('unauthorized')) flashMessage('Click Reconnect in the control panel (new permission needed).');
    else flashMessage(`Command failed: ${err.message}`);
  }
}

prevViewBtn.addEventListener('click', () => guardedTransport(() => window.lyricsApi.skipPrevious()));
nextViewBtn.addEventListener('click', () => guardedTransport(() => window.lyricsApi.skipNext()));
repeatViewBtn.addEventListener('click', () => guardedTransport(() => window.lyricsApi.toggleRepeat()));

window.lyricsApi.onColor(({ primary, secondary }) => {
  const root = document.documentElement.style;
  root.setProperty('--c1', `rgb(${primary.r}, ${primary.g}, ${primary.b})`);
  root.setProperty('--c2', `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`);
});

window.lyricsApi.onNowPlaying((np) => {
  lastNp = np;
  receivedAt = Date.now();

  if (!np || !np.connected) {
    titleEl.textContent = 'Not connected';
    artistEl.textContent = 'Connect Spotify from the control panel';
    art.style.display = 'none';
    bg.style.backgroundImage = '';
    return;
  }
  if (!np.playing) {
    titleEl.textContent = 'Nothing playing';
    artistEl.textContent = 'Start a track on Spotify';
    return;
  }
  titleEl.textContent = np.title;
  artistEl.textContent = np.artist;
  if (np.artUrl) {
    art.src = np.artUrl;
    art.style.display = 'block';
    bg.style.backgroundImage = `url(${np.artUrl})`;
  }
  if (np.repeatState) {
    repeatViewBtn.classList.toggle('active', np.repeatState !== 'off');
    repeatViewBtn.textContent = np.repeatState === 'track' ? '⟲¹' : '⟲';
  }
});

window.lyricsApi.onLyrics((newLines) => {
  lines = newLines;
  listEl.innerHTML = '';
  if (!lines || !lines.length) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  for (const line of lines) {
    const div = document.createElement('div');
    div.className = 'line';
    div.textContent = line.text || ' ';
    listEl.appendChild(div);
  }
});

function tick() {
  if (lines && lines.length && lastNp && lastNp.playing) {
    const elapsed = lastNp.progressMs + (Date.now() - receivedAt);
    let activeIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeMs <= elapsed) activeIdx = i;
      else break;
    }
    const children = listEl.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle('active', i === activeIdx);
    }
    if (activeIdx >= 0) {
      const activeEl = children[activeIdx];
      const box = document.getElementById('lyricsBox');
      const offset = activeEl.offsetTop - box.clientHeight / 2 + activeEl.clientHeight / 2;
      listEl.style.transform = `translateY(${-offset}px)`;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
