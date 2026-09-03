import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

const ART_CROSSFADE_MS = 600;

interface ArtLayer {
  key: number;
  url: string | null;
  motionUrl: string | null;
}

/** Full-bleed album art behind everything: cover-cropped (never letterboxed),
 *  heavily blurred, with a black scrim so the widget and lyrics stay readable
 *  on top of even a bright, busy cover. */
export function AlbumBackdrop(): JSX.Element {
  const artUrl = useStore((s) => s.nowPlaying.artUrl ?? null);
  const motionUrl = useStore((s) => s.nowPlaying.motionArtUrl ?? null);
  const [layers, setLayers] = useState<ArtLayer[]>([{ key: 0, url: artUrl, motionUrl }]);
  const [visible, setVisible] = useState<Set<number>>(new Set([0]));
  const counter = useRef(0);

  useEffect(() => {
    setLayers((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.url === artUrl && last.motionUrl === motionUrl) return prev;
      return [...prev.slice(-1), { key: ++counter.current, url: artUrl, motionUrl }];
    });
  }, [artUrl, motionUrl]);

  useEffect(() => {
    const newest = layers[layers.length - 1];
    if (!newest || visible.has(newest.key)) return;
    const raf = requestAnimationFrame(() => setVisible((p) => new Set(p).add(newest.key)));
    const prune = setTimeout(() => setLayers((p) => (p.length > 1 ? p.slice(-1) : p)), ART_CROSSFADE_MS + 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(prune);
    };
  }, [layers, visible]);

  return (
    <div className="album-backdrop">
      {layers.map((layer) => (
        <div
          key={layer.key}
          className="album-backdrop-layer"
          style={{ opacity: visible.has(layer.key) ? 1 : 0 }}
        >
          {layer.motionUrl ? (
            // Motion artwork exists for a small slice of editorial content
            // only — when it's there, use it.
            <video className="album-backdrop-media" src={layer.motionUrl} autoPlay loop muted playsInline />
          ) : layer.url ? (
            // Otherwise a slow Ken-Burns push on the static art, rather than
            // faking video that doesn't exist for the track.
            <img className="album-backdrop-media album-backdrop-kenburns" src={layer.url} alt="" />
          ) : null}
        </div>
      ))}
      <div className="album-backdrop-scrim" />
    </div>
  );
}
