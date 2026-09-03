const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const npEl = document.getElementById('nowplaying');
const thicknessEl = document.getElementById('thickness');
const intensityEl = document.getElementById('intensity');
const animationEl = document.getElementById('animation');
const overrideEnabledEl = document.getElementById('overrideEnabled');
const overrideColorEl = document.getElementById('overrideColor');
const monitorSelectEl = document.getElementById('monitorSelect');
const lyricsBtn = document.getElementById('lyricsBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const repeatBtn = document.getElementById('repeatBtn');

const REPEAT_LABEL = { off: 'Loop: Off', context: 'Loop: All', track: 'Loop: One' };

async function guardedTransport(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.message.includes('forbidden_premium_required')) {
      npEl.textContent = 'Playback control needs Spotify Premium.';
    } else if (err.message.includes('no_active_device')) {
      npEl.textContent = 'No active Spotify device — open Spotify and play something first.';
    } else if (err.message.includes('unauthorized')) {
      npEl.textContent = 'Missing permission for playback control — click Reconnect above.';
      statusEl.textContent = 'Reconnect needed (new permission)';
      statusEl.className = 'bad';
    } else {
      npEl.textContent = `Playback command failed: ${err.message}`;
    }
  }
}

prevBtn.addEventListener('click', () => guardedTransport(() => window.api.skipPrevious()));
nextBtn.addEventListener('click', () => guardedTransport(() => window.api.skipNext()));
repeatBtn.addEventListener('click', async () => {
  const result = await guardedTransport(() => window.api.toggleRepeat());
  if (result) repeatBtn.textContent = REPEAT_LABEL[result.repeatState] || 'Loop';
});

async function refreshStatus() {
  const status = await window.api.spotifyStatus();
  if (status.authed) {
    statusEl.textContent = 'Connected to Spotify';
    statusEl.className = 'ok';
    connectBtn.textContent = 'Reconnect';
  } else if (!status.clientIdConfigured) {
    statusEl.textContent = 'SPOTIFY_CLIENT_ID missing — copy .env.example to .env and fill it in, then restart';
    statusEl.className = 'bad';
  } else {
    statusEl.textContent = 'Not connected';
    statusEl.className = 'bad';
  }
}

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Opening browser…';
  try {
    await window.api.spotifyConnect();
  } catch (err) {
    statusEl.textContent = `Connect failed: ${err.message}`;
    statusEl.className = 'bad';
  }
  connectBtn.disabled = false;
  refreshStatus();
});

window.api.onNowPlaying((np) => {
  if (!np || !np.connected) {
    npEl.textContent = '';
    return;
  }
  if (!np.playing) {
    npEl.textContent = 'Connected — nothing playing right now.';
    return;
  }
  npEl.textContent = `♪ ${np.title} — ${np.artist}`;
  if (np.repeatState) repeatBtn.textContent = REPEAT_LABEL[np.repeatState] || 'Loop';
});

function pushSettings() {
  window.api.settingsUpdate({
    thickness: Number(thicknessEl.value),
    intensity: Number(intensityEl.value) / 100,
    animation: animationEl.value,
  });
}
thicknessEl.addEventListener('input', pushSettings);
intensityEl.addEventListener('input', pushSettings);
animationEl.addEventListener('change', pushSettings);

function pushOverride() {
  if (!overrideEnabledEl.checked) {
    window.api.setColorOverride(null);
    return;
  }
  const hex = overrideColorEl.value;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  window.api.setColorOverride({ r, g, b });
}
overrideEnabledEl.addEventListener('change', pushOverride);
overrideColorEl.addEventListener('input', pushOverride);

async function loadMonitors() {
  const monitors = await window.api.monitorList();
  monitorSelectEl.innerHTML = '';
  for (const m of monitors) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.label}${m.primary ? ' (primary)' : ''}`;
    opt.selected = m.selected;
    monitorSelectEl.appendChild(opt);
  }
}
monitorSelectEl.addEventListener('change', () => {
  window.api.monitorSelect(Number(monitorSelectEl.value));
});

lyricsBtn.addEventListener('click', () => window.api.toggleLyrics());

refreshStatus();
loadMonitors();
startAudioReactivity();

// Captures desktop (loopback) audio so the glow overlay can react to actual
// playback loudness. Best-effort: any failure here (capture denied, no
// loopback device, unsupported platform) just means the overlay falls back
// to its non-audio idle animation — never surfaced as an error to the user.
async function startAudioReactivity() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1, height: 1 },
      audio: true,
    });
  } catch (err) {
    console.warn('[audio] system audio capture unavailable:', err.message);
    return;
  }

  for (const track of stream.getVideoTracks()) track.stop(); // only need audio

  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    console.warn('[audio] capture stream had no audio track');
    return;
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let lastSent = 0;

  function tick() {
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const centered = (data[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    // rough perceptual scaling — typical music RMS sits well under 1.0
    const level = Math.min(1, rms * 3.2);

    const now = performance.now();
    if (now - lastSent > 40) { // ~25fps over IPC is plenty
      window.api.sendAudioLevel(level);
      lastSent = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
