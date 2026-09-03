// System-audio (loopback) capture + a bass-band envelope follower, used by
// Music Sync mode. Best-effort: any failure here (capture denied, no
// loopback device, non-Windows platform) just means Music Sync silently
// behaves like Idle — never surfaced as an error, never throws upward.
//
// NOT independently verified: this sandbox has no display/audio device to
// test against. Windows loopback capture via Electron's
// setDisplayMediaRequestHandler + audio:'loopback' needs confirming on
// real hardware.

const BASS_LO_HZ = 20;
const BASS_HI_HZ = 250;
const ATTACK_MS = 150;
const RELEASE_MS = 400;

export interface AudioReactiveHandle {
  stop: () => void;
}

export function startBassEnvelope(onLevel: (level: number) => void): Promise<AudioReactiveHandle | null> {
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
      analyser.smoothingTimeConstant = 0; // we do our own attack/release smoothing
      source.connect(analyser);

      const binWidth = ctx.sampleRate / analyser.fftSize;
      const loBin = Math.max(0, Math.floor(BASS_LO_HZ / binWidth));
      const hiBin = Math.min(analyser.frequencyBinCount - 1, Math.ceil(BASS_HI_HZ / binWidth));
      const data = new Uint8Array(analyser.frequencyBinCount);

      let envelope = 0;
      let lastFrame = performance.now();
      let rafId = 0;

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = loBin; i <= hiBin; i++) sum += data[i];
        const raw = sum / (hiBin - loBin + 1) / 255; // 0..1

        const now = performance.now();
        const dt = Math.max(1, now - lastFrame);
        lastFrame = now;
        const tau = raw > envelope ? ATTACK_MS : RELEASE_MS;
        const coeff = 1 - Math.exp(-dt / tau);
        envelope += (raw - envelope) * coeff;

        onLevel(Math.max(0, Math.min(1, envelope)));
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
