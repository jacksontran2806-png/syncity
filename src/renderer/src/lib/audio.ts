// System-audio (loopback) capture, running for the app's whole lifetime —
// feeds the widget pill's compact spectrum visualizer. Best-effort: any
// failure here (capture denied, no loopback device, non-Windows platform)
// just means the visualizer falls back to its own idle animation, never
// throws upward.
//
// NOT independently verified: this sandbox has no display/audio device to
// test against. Windows loopback capture via Electron's
// setDisplayMediaRequestHandler + audio:'loopback' needs confirming on
// real hardware.

const BAND_COUNT = 26;
/** Skip the bottom few bins (near-DC/rumble, mostly noise) and don't bother
 *  with the top of the spectrum (typical music has little energy up there,
 *  bands would just sit flat) — log-spaced across the range in between. */
const MIN_BIN = 2;
const MAX_BIN_FRAC = 0.5;
const ATTACK = 0.5; // lerp factor toward a rising target — snappy
const DECAY = 0.12; // lerp factor toward a falling target — settles smoothly

export interface AudioReactiveHandle {
  stop: () => void;
}

/** Smoothed 0..1 magnitude per band, log-spaced across the spectrum (music's
 *  energy concentrates in the low end; linear bins would leave most bands
 *  looking dead). The decimation and attack/decay smoothing both happen
 *  right here, once, next to the raw ~1024-bin analyser buffer — the caller
 *  gets back a small, already-settled BAND_COUNT-length array instead of the
 *  full spectrum, so only that little array needs to cross into the store
 *  every frame. `bars` is the SAME array instance on every call (mutated in
 *  place, not reallocated) — read it synchronously, don't hold onto it. */
export function startSpectrumBars(onBars: (bars: Float32Array) => void): Promise<AudioReactiveHandle | null> {
  return navigator.mediaDevices
    .getDisplayMedia({ video: { width: 1, height: 1 } as MediaTrackConstraints, audio: true })
    .then((stream) => {
      for (const track of stream.getVideoTracks()) track.stop(); // only need audio

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        for (const track of stream.getTracks()) track.stop();
        return null;
      }

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0; // we do our own attack/decay smoothing
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = new Float32Array(BAND_COUNT);
      const maxBin = Math.max(MIN_BIN + 1, Math.floor(analyser.frequencyBinCount * MAX_BIN_FRAC));
      let rafId = 0;

      const tick = () => {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < BAND_COUNT; i++) {
          // Log-spaced bin range for this band — the classic spectrum-analyzer
          // grouping, so low bands track bass/mid detail and high bands still
          // get a meaningful (if coarser) slice instead of a single bin each.
          const lo = MIN_BIN + Math.floor(Math.pow(maxBin - MIN_BIN, i / BAND_COUNT));
          const hi = MIN_BIN + Math.floor(Math.pow(maxBin - MIN_BIN, (i + 1) / BAND_COUNT));
          const end = Math.max(lo + 1, hi);
          let sum = 0;
          for (let b = lo; b < end; b++) sum += data[b] ?? 0;
          const target = sum / (end - lo) / 255;
          const rate = target > bars[i]! ? ATTACK : DECAY;
          bars[i] = bars[i]! + (target - bars[i]!) * rate;
        }
        onBars(bars);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      const stop = () => {
        cancelAnimationFrame(rafId);
        for (const track of stream.getTracks()) track.stop();
        source.disconnect();
        ctx.close().catch(() => {});
      };

      return { stop };
    })
    .catch((err) => {
      console.warn('[audio] system audio capture unavailable:', err);
      return null;
    });
}
