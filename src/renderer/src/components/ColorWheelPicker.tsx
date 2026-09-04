import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hslToRgb, rgbCss, rgbToHex, rgbToHsl } from '../lib/colorUtils';
import type { RGB } from '@shared/types';

// An in-page hue/saturation wheel + lightness slider, NOT a native
// <input type="color">. Two reasons:
//
// 1. The native color dialog is a separate OS-level window, and this app's
//    overlay is frame:false + transparent + alwaysOnTop (see main/windows.ts)
//    — an always-on-top borderless window fights the native dialog for
//    focus/z-order, so clicking a native color input here could open a
//    dialog that's stuck behind the overlay or never takes input. Staying
//    inside our own DOM sidesteps that entirely.
// 2. Settings lives in a scrolling list (.settings-body, overflow-y: auto —
//    which per the CSS overflow spec forces overflow-x to auto too, so
//    anything overflowing the box gets clipped/scrolled, not just the
//    vertical axis). The popover is portaled to <body> and positioned with
//    `fixed` viewport coordinates so it floats free of that clipping.

interface Props {
  value: RGB;
  onChange: (rgb: RGB) => void;
  label: string;
}

const WHEEL_SIZE = 140;
const POPOVER_MARGIN = 8;

export function ColorWheelPicker({ value, onChange, label }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const swatchRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { h, s, l } = useMemo(() => rgbToHsl(value), [value]);

  // Anchored to the swatch at open time, clamped so the ~180px-tall popover
  // never runs off the (fixed-size) overlay viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = swatchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverW = WHEEL_SIZE + 24;
    const popoverH = 220;
    let left = rect.left;
    let top = rect.bottom + POPOVER_MARGIN;
    left = Math.min(left, window.innerWidth - popoverW - POPOVER_MARGIN);
    left = Math.max(POPOVER_MARGIN, left);
    if (top + popoverH > window.innerHeight) top = rect.top - popoverH - POPOVER_MARGIN;
    setPos({ left, top });
  }, [open]);

  // Painted once per open (it's static — only the thumb and lightness slider
  // move, never the wheel itself) rather than every render.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const size = WHEEL_SIZE;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist > r) continue; // left transparent (alpha already 0)
        const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
        const sat = Math.min(1, dist / r);
        const rgb = hslToRgb((hue + 360) % 360, sat, 0.5);
        img.data[i] = rgb.r;
        img.data[i + 1] = rgb.g;
        img.data[i + 2] = rgb.b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [open]);

  // Wheel picks hue + saturation at a fixed 50% lightness (matching how it's
  // painted above); the slider below controls lightness independently so the
  // wheel's own colors never have to change.
  const pickFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const r = rect.width / 2;
      const dx = clientX - (rect.left + r);
      const dy = clientY - (rect.top + r);
      const dist = Math.min(r, Math.sqrt(dx * dx + dy * dy));
      const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
      const sat = r === 0 ? 0 : dist / r;
      onChange(hslToRgb((hue + 360) % 360, sat, l));
    },
    [l, onChange]
  );

  const onWheelPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickFromPoint(e.clientX, e.clientY);
  };
  const onWheelPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return;
    pickFromPoint(e.clientX, e.clientY);
  };

  // Close on a click outside the popover, or Escape — same conventions as
  // every other dismissible surface in the app.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (swatchRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const thumbAngleRad = (h * Math.PI) / 180;
  const thumbR = s * (WHEEL_SIZE / 2);
  const thumbX = WHEEL_SIZE / 2 + thumbR * Math.cos(thumbAngleRad);
  const thumbY = WHEEL_SIZE / 2 + thumbR * Math.sin(thumbAngleRad);

  return (
    <div className="color-wheel-picker">
      <button
        ref={swatchRef}
        type="button"
        className="color-wheel-swatch"
        style={{ background: rgbCss(value) }}
        title={label}
        onClick={() => setOpen((o) => !o)}
      />
      {open &&
        createPortal(
          <div
            className="color-wheel-popover"
            ref={popoverRef}
            data-hitregion
            data-nodrag
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="color-wheel-wrap">
              <canvas
                ref={canvasRef}
                width={WHEEL_SIZE}
                height={WHEEL_SIZE}
                className="color-wheel-canvas"
                onPointerDown={onWheelPointerDown}
                onPointerMove={onWheelPointerMove}
              />
              <div className="color-wheel-thumb" style={{ left: thumbX, top: thumbY, background: rgbCss(value) }} />
            </div>
            <input
              type="range"
              className="color-wheel-lightness"
              min={0}
              max={100}
              value={Math.round(l * 100)}
              onChange={(e) => onChange(hslToRgb(h, s, Number(e.target.value) / 100))}
            />
            <span className="color-wheel-hex">{rgbToHex(value)}</span>
          </div>,
          document.body
        )}
    </div>
  );
}
