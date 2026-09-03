import { useEffect, useRef, useState } from 'react';

export interface SlideLayer<T> {
  key: number;
  value: T;
  place: 'entering' | 'active' | 'leaving';
}

// Generic "slide to the next track" transition: whenever dedupeKey changes, the
// previous value keeps rendering (marked 'leaving') while the new one mounts
// (marked 'entering' for one frame, then 'active'), and gets pruned once the
// transition has had time to finish. Consumers just map `place` to a CSS
// transform/opacity — used for the widget's art+meta row and the fullscreen
// album view so track changes slide instead of hard-cutting.
export function useSlideTransition<T>(value: T, dedupeKey: string | number, durationMs = 450): SlideLayer<T>[] {
  const [layers, setLayers] = useState<SlideLayer<T>[]>([{ key: 0, value, place: 'active' }]);
  const lastDedupe = useRef(dedupeKey);
  const counter = useRef(0);

  useEffect(() => {
    if (lastDedupe.current === dedupeKey) return;
    lastDedupe.current = dedupeKey;
    const nextKey = ++counter.current;
    setLayers((prev) => [
      ...prev.map((l) => ({ ...l, place: 'leaving' as const })),
      { key: nextKey, value, place: 'entering' },
    ]);

    const raf = requestAnimationFrame(() => {
      setLayers((prev) => prev.map((l) => (l.key === nextKey ? { ...l, place: 'active' } : l)));
    });
    const cleanup = setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.key === nextKey));
    }, durationMs + 80);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(cleanup);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupeKey]);

  return layers;
}
