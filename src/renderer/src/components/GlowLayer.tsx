import { GlowCanvas } from './glow/GlowCanvas';
import { useStore } from '../store';

/** Dispatcher only. Trail, Aura and Lava all run through the one canvas
 *  driver; None renders nothing. */
export function GlowLayer(): JSX.Element {
  const mode = useStore((s) => s.settings.animationMode);
  if (mode === 'none') return <></>;
  return <GlowCanvas mode={mode} />;
}
