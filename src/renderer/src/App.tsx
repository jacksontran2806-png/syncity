import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useClickThrough } from './hooks/useClickThrough';
import { startBassEnvelope, type AudioReactiveHandle } from './audio';
import { GlowLayer } from './components/GlowLayer';
import { WidgetDock } from './components/WidgetDock';
import { SettingsWindow } from './components/SettingsWindow';
import { AlbumFullscreen } from './components/AlbumFullscreen';
import { LyricsFullscreen } from './components/lyrics/LyricsFullscreen';

export function App(): JSX.Element {
  useClickThrough();

  const setNowPlaying = useStore((s) => s.setNowPlaying);
  const setLyrics = useStore((s) => s.setLyrics);
  const setPalette = useStore((s) => s.setPalette);
  const setAudioLevel = useStore((s) => s.setAudioLevel);
  const setPanel = useStore((s) => s.setPanel);
  const setViewMode = useStore((s) => s.setViewMode);
  const refreshSpotifyStatus = useStore((s) => s.refreshSpotifyStatus);
  const settings = useStore((s) => s.settings);
  const viewMode = useStore((s) => s.viewMode);
  const panel = useStore((s) => s.panel);
  const [expandSignal, setExpandSignal] = useState(0);

  useEffect(() => {
    const offNowPlaying = window.lyriglow.onNowPlaying(setNowPlaying);
    const offLyrics = window.lyriglow.onLyrics(setLyrics);
    const offPalette = window.lyriglow.onPalette(setPalette);
    const offOpenSettings = window.lyriglow.onOpenSettings(() => {
      setViewMode('island');
      setPanel('settings');
    });
    const offExpand = window.lyriglow.onExpandWidget(() => setExpandSignal((n) => n + 1));
    // The fullscreen hotkey changes settings in the main process, so the
    // renderer has to be told rather than finding out on the next poll.
    const offSettings = window.lyriglow.onSettingsChanged((s) => useStore.setState({ settings: s }));

    refreshSpotifyStatus();
    window.lyriglow.getSettings().then((s) => useStore.setState({ settings: s }));

    return () => {
      offNowPlaying();
      offLyrics();
      offPalette();
      offOpenSettings();
      offExpand();
      offSettings();
    };
  }, [setNowPlaying, setLyrics, setPalette, setPanel, setViewMode, refreshSpotifyStatus]);

  // Reports the page's own dimensions to main on load and on every resize, so
  // the log shows window bounds and page size side by side. Two wrong-but-equal
  // numbers still mean a bug, which is why the main-side log also prints the
  // implied native resolution to check against Windows Display Settings.
  useEffect(() => {
    const report = () =>
      void window.lyriglow.reportWindowMetrics({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
      });
    report();
    window.addEventListener('resize', report);
    return () => window.removeEventListener('resize', report);
  }, []);

  // Escape replaces the old close button. It steps back one level at a time —
  // fullscreen view -> widget, open panel -> closed, then hides the overlay.
  // Hiding rather than quitting: it's recoverable from the tray or Ctrl+Alt+L,
  // and Escape killing the app outright would be a nasty surprise.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { viewMode: vm, panel: p } = useStore.getState();
      if (vm !== 'island') setViewMode('island');
      else if (p !== 'none') setPanel('none');
      else window.lyriglow.hideOverlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setViewMode, setPanel]);

  // Trail and Aura both drive the glow off real system-audio loudness
  // (see audio.ts) — only running the capture while it's needed.
  //
  // Depends on the boolean, not the raw mode string: startBassEnvelope() opens
  // a fresh AudioContext + getDisplayMedia() capture every time it's called,
  // which is expensive and briefly interrupts the audio-reactive glow. Keying
  // this effect on settings.animationMode directly meant switching
  // Trail -> Aura while tuning settings tore the capture down and
  // renegotiated it on every single switch, for no reason — none of those
  // transitions need audio to stop. Only a transition to/from 'none' does.
  const audioNeeded = settings.animationMode !== 'none';
  useEffect(() => {
    if (!audioNeeded) {
      setAudioLevel(0);
      return;
    }
    let handle: AudioReactiveHandle | null = null;
    let cancelled = false;
    startBassEnvelope((level) => setAudioLevel(level)).then((h) => {
      if (cancelled) h?.stop();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.stop();
      setAudioLevel(0);
    };
  }, [audioNeeded, setAudioLevel]);

  return (
    // One variable, set once at the root: every piece of app chrome derives its
    // fill, border, shadow, blur and text shadow from it, so they can never
    // disagree about how solid the app is meant to look.
    <div
      className="overlay-root"
      style={{ '--panel-opacity': settings.panelOpacity } as React.CSSProperties}
    >
      <GlowLayer />
      {viewMode === 'island' && <WidgetDock expandSignal={expandSignal} />}
      {/* Peer of the widget, not a child of it — its own box, own position. */}
      {viewMode === 'island' && panel === 'settings' && <SettingsWindow />}
      {viewMode === 'album' && <AlbumFullscreen />}
      {viewMode === 'lyrics' && <LyricsFullscreen />}
    </div>
  );
}
