import { useEffect } from 'react';
import { useStore } from '../store';
import { isPageActive, onPageActiveChange } from '../lib/pageActive';
import { startSpectrumBars, type AudioReactiveHandle } from '../lib/audio';

/**
 * Runs system-audio capture only while something is actually going to draw it.
 *
 * Capture used to start at launch and stay up for the app's whole lifetime: a
 * getDisplayMedia stream, an AudioContext, an analyser and a 60fps read loop,
 * held open whether or not the spectrum was on screen and whether or not any
 * audio was playing. For a tray app that sits open all day that is the single
 * most expensive idle thing in the renderer, and the pill is the ONLY consumer
 * — it isn't mounted at all while the widget is expanded, while a fullscreen
 * view is up, or while the overlay is hidden.
 *
 * Three conditions have to hold: the pill's canvas is mounted, the page is
 * visible, and playback is actually running. Bars from a paused track are all
 * zero anyway, and the pill's idle breathing (see PillWave) is what fills that
 * gap — it already handles an empty `audioBars`, since capture can also be
 * denied outright.
 *
 * Teardown is deliberately lazy. Starting capture goes through
 * desktopCapturer.getSources() in main, which enumerates screens, so tearing
 * down the instant the pointer touches the pill would pay that cost again a
 * second later when it leaves. LINGER_MS covers hover-expand-collapse and
 * skipping between tracks; only a genuine stop outlives it.
 */
const LINGER_MS = 10_000;

const NO_BARS = new Float32Array(0);

export function useSpectrumCapture(): void {
  useEffect(() => {
    let handle: AudioReactiveHandle | null = null;
    let starting = false;
    let disposed = false;
    let lingerTimer: ReturnType<typeof setTimeout> | undefined;

    const wanted = (): boolean => {
      const { spectrumVisible, nowPlaying } = useStore.getState();
      return spectrumVisible && !!nowPlaying.playing && isPageActive();
    };

    const start = (): void => {
      if (handle || starting) return;
      starting = true;
      void startSpectrumBars((bars) => useStore.getState().setAudioBars(bars)).then((h) => {
        starting = false;
        // The answer can have changed while the permission round-trip was in
        // flight — a hover that expanded the widget, or a track that ended.
        if (disposed || !wanted()) {
          h?.stop();
          return;
        }
        handle = h;
      });
    };

    const stop = (): void => {
      handle?.stop();
      handle = null;
      // Hand the pill an empty array rather than leaving the last captured
      // frame in the store: stale bars would freeze mid-height instead of
      // falling back to the idle animation.
      if (useStore.getState().audioBars.length) useStore.setState({ audioBars: NO_BARS });
    };

    const sync = (): void => {
      if (wanted()) {
        clearTimeout(lingerTimer);
        lingerTimer = undefined;
        start();
        return;
      }
      if (!handle && !starting) return;
      if (lingerTimer) return;
      lingerTimer = setTimeout(() => {
        lingerTimer = undefined;
        if (!wanted()) stop();
      }, LINGER_MS);
    };

    // Identity-compared rather than subscribed wholesale: the store is written
    // to on every captured frame (audioBars), and re-evaluating this on each
    // of those would undo the point of the exercise.
    let lastVisible = useStore.getState().spectrumVisible;
    let lastNowPlaying = useStore.getState().nowPlaying;
    const unsubscribe = useStore.subscribe((state) => {
      if (state.spectrumVisible === lastVisible && state.nowPlaying === lastNowPlaying) return;
      lastVisible = state.spectrumVisible;
      lastNowPlaying = state.nowPlaying;
      sync();
    });
    const offVisible = onPageActiveChange(sync);

    sync();

    return () => {
      disposed = true;
      unsubscribe();
      offVisible();
      clearTimeout(lingerTimer);
      stop();
    };
  }, []);
}
