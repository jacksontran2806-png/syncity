// Settings controls bound directly to a settings key.
//
// Every row used to spell out its own <input>, its own value read, its own
// onChange, and its own cast — six lines each, twenty times over, with the key
// name repeated three times per row and nothing but convention keeping them in
// agreement. These bind to the key instead: the key is written once, the store
// read and write are the component's problem, and TypeScript rejects a control
// pointed at a key of the wrong type.

import { useStore } from '../store';
import type { AppSettings } from '@shared/types';

/** Settings keys whose value is assignable to T — lets Slider only accept
 *  number keys and Toggle only boolean ones. */
type KeysOfType<T> = { [K in keyof AppSettings]: AppSettings[K] extends T ? K : never }[keyof AppSettings];

export function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-control">{children}</div>
    </div>
  );
}

/** Groups rows under a heading. The panel is long; this is what makes it
 *  scannable, and it mirrors how the JSX below is ordered. */
export function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <>
      <div className="settings-section">{title}</div>
      {children}
    </>
  );
}

interface SliderProps {
  label: string;
  k: KeysOfType<number>;
  min: number;
  max: number;
  step?: number;
  /** Display multiplier for keys stored as a fraction but shown as a
   *  percentage (0.55 stored -> 55 on the slider). */
  scale?: number;
  /** Renders the stored value next to the slider. */
  format?: (value: number) => string;
  /** Extra controls in the same row — an Auto or Reset button. */
  children?: React.ReactNode;
}

export function Slider({ label, k, min, max, step = 1, scale = 1, format, children }: SliderProps): JSX.Element {
  const value = useStore((s) => s.settings[k]);
  const update = useStore((s) => s.updateSettings);
  // Only round when scaling — rounding a raw value would defeat a sub-1 step.
  const shown = scale === 1 ? value : Math.round(value * scale);

  return (
    <Row label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => void update({ [k]: Number(e.target.value) / scale } as Partial<AppSettings>)}
      />
      {format && <span className="settings-hint">{format(value)}</span>}
      {children}
    </Row>
  );
}

export function Toggle({
  label,
  k,
  hint,
  children,
}: {
  label: string;
  k: KeysOfType<boolean>;
  hint?: string;
  children?: React.ReactNode;
}): JSX.Element {
  const checked = useStore((s) => s.settings[k]);
  const update = useStore((s) => s.updateSettings);
  return (
    <Row label={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => void update({ [k]: e.target.checked } as Partial<AppSettings>)}
      />
      {hint && <span className="settings-hint">{hint}</span>}
      {children}
    </Row>
  );
}

/** Select bound to a string-union key. `options` is [value, label] pairs, and
 *  the value side is checked against the key's own union type. */
export function Choice<K extends KeysOfType<string>>({
  label,
  k,
  options,
}: {
  label: string;
  k: K;
  options: readonly (readonly [AppSettings[K], string])[];
}): JSX.Element {
  const value = useStore((s) => s.settings[k]);
  const update = useStore((s) => s.updateSettings);
  return (
    <Row label={label}>
      <select
        value={String(value)}
        onChange={(e) => void update({ [k]: e.target.value } as Partial<AppSettings>)}
      >
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button type="button" className="text-btn" onClick={onClick}>
      {children}
    </button>
  );
}
