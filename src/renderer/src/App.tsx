import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useClickThrough } from './hooks/useClickThrough';
import { startSpectrumBars, type AudioReactiveHandle } from './lib/audio';
import { fontThemeSpec } from './lib/fontThemes';
import { WidgetDock } from './components/WidgetDock';
import { SettingsWindow } from './components/SettingsWindow';
import { AlbumFullscreen } from './components/AlbumFullscreen';
import { LyricsFullscreen } from './components/lyrics/LyricsFullscreen';

export function App(): JSX.Element {
  useClickThrough();

  const setNowPlaying = useStore((s) => s.setNowPlaying);
  const setLyrics = useStore((s) => s.setLyrics);
  const setPalette = useStore((s) => s.setPalette);
  const setAudioBars = useStore((s) => s.setAudioBars);
  const setPanel = useStore((s) => s.setPanel);
  const setViewMode = useStore((s) => s.setViewMode);
  const refreshSpotifyStatus = useStore((s) => s.refreshSpotifyStatus);
  const settings = useStore((s) => s.settings);
  const viewMode = useStore((s) => s.viewMode);
  const panel = useStore((s) => s.panel);
  const [expandSignal, setExpandSignal] = useState(0);

  useEffect(() => {
    const offNowPlaying = window.syncity.onNowPlaying(setNowPlaying);
    const offLyrics = window.syncity.onLyrics(setLyrics);
    const offPalette = window.syncity.onPalette(setPalette);
    const offOpenSettings = window.syncity.onOpenSettings(() => {
      setViewMode('island');
      setPanel('settings');
    });
    const offExpand = window.syncity.onExpandWidget(() => setExpandSignal((n) => n + 1));
    // The fullscreen hotkey changes settings in the main process, so the
    // renderer has to be told rather than finding out on the next poll.
    const offSettings = window.syncity.onSettingsChanged((s) => useStore.setState({ settings: s }));

    refreshSpotifyStatus();
    window.syncity.getSettings().then((s) => useStore.setState({ settings: s }));

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
      void window.syncity.reportWindowMetrics({
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
  //
  // Two sources, one cascade. The keydown listener only ever fires when this
  // window happens to hold focus, which for a click-through overlay is almost
  // never — that's why Escape did nothing in Lyrics/Album mode. Main binds a
  // global Escape while a fullscreen view is up and sends 'ui:escape' here
  // (see hotkeys.ts setEscapeCapture).
  useEffect(() => {
    const stepBack = () => {
      const { viewMode: vm, panel: p } = useStore.getState();
      if (vm !== 'island') setViewMode('island');
      else if (p !== 'none') setPanel('none');
      else window.syncity.hideOverlay();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // e.repeat: OS key-repeat re-fires keydown for a held key. Without this
      // guard a single held Escape can walk the cascade more than one step
      // (view -> island -> panel closed -> hide) instead of just one.
      if (e.key !== 'Escape' || e.repeat) return;
      stepBack();
    };
    window.addEventListener('keydown', onKeyDown);
    const offEscape = window.syncity.onEscape(stepBack);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      offEscape();
    };
  }, [setViewMode, setPanel]);

  // Main only holds the global Escape binding while a fullscreen view is
  // actually up, so it isn't swallowing the key from every other app the rest
  // of the time.
  useEffect(() => {
    window.syncity.setFullscreenView(viewMode !== 'island');
  }, [viewMode]);

  // Runs for the app's whole lifetime, not gated on any mode or view — the
  // widget pill's spectrum visualizer can be on screen any time, so capture
  // just stays up in the background rather than starting/stopping around
  // whatever else is happening. See audio.ts for why this is cheap: the
  // decimation and smoothing happen there, so only a small settled array
  // crosses into the store each frame, not the raw analyser buffer.
  useEffect(() => {
    let handle: AudioReactiveHandle | null = null;
    let cancelled = false;
    startSpectrumBars((bars) => setAudioBars(bars)).then((h) => {
      if (cancelled) h?.stop();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, [setAudioBars]);

  return (
    // One variable, set once at the root: every piece of app chrome derives its
    // fill, border, shadow, blur and text shadow from it, so they can never
    // disagree about how solid the app is meant to look.
    <div
      className="overlay-root"
      style={{
        '--panel-opacity': settings.panelOpacity,
        '--pill-width': `${settings.pillWidth}px`,
        '--pill-height': `${settings.pillHeight}px`,
        // Every sheet reads these rather than naming a family directly, so one
        // setting re-skins the whole app. GiantWordStage reads the same values
        // back off the DOM for its canvas measurement — see fontThemes.ts.
        '--font-display': fontThemeSpec(settings.fontTheme).display,
        '--font-body': fontThemeSpec(settings.fontTheme).body,
      } as React.CSSProperties}
    >
      {viewMode === 'island' && <WidgetDock expandSignal={expandSignal} />}
      {/* Peer of the widget, not a child of it — its own box, own position. */}
      {viewMode === 'island' && panel === 'settings' && <SettingsWindow />}
      {viewMode === 'album' && <AlbumFullscreen />}
      {viewMode === 'lyrics' && <LyricsFullscreen />}
    </div>
  );
}
