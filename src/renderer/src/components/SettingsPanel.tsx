import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Choice, Row, Section, Slider, TextButton, Toggle } from './settingsControls';
import { autoTrailLengthPct, type RGB } from '@shared/types';

const LYRIC_NUDGE_MS = 250;

function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex: string): RGB {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const secs = (ms: number): string => `${ms > 0 ? '+' : ''}${(ms / 1000).toFixed(2)}s`;

export function SettingsPanel({ onClose }: { onClose?: () => void }): JSX.Element {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const monitors = useStore((s) => s.monitors);
  const loadMonitors = useStore((s) => s.loadMonitors);
  const [updateFlash, setUpdateFlash] = useState('');

  useEffect(() => void loadMonitors(), [loadMonitors]);

  return (
    <div className="panel settings-panel" data-hitregion>
      {/* Header doubles as the drag handle — it's the one strip of the box with
          no controls in it, so a press here always starts a move. */}
      <div className="settings-header">
        <span className="panel-title">Settings</span>
        {onClose && (
          <button type="button" className="settings-close" title="Close settings (Esc)" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      {/* data-nodrag: this region scrolls, and grabbing its scrollbar must
          scroll the list, not drag the whole window. The header is the handle. */}
      <div className="settings-body" data-nodrag>
        <Section title="Glow">
          <Choice
            label="Animation"
            k="animationMode"
            options={[
              ['none', 'None'],
              ['trail', 'Trail'],
              ['aura', 'Aura'],
            ]}
          />
          <Slider label="Thickness" k="thickness" min={6} max={80} />
        </Section>

        {settings.animationMode === 'trail' && (
          <Section title="Trail">
            <TrailLengthRow />
            <Slider label="Trail speed" k="trailSpeed" min={200} max={3000} step={50} />
            <Slider label="Speed reactivity" k="trailSpeedReactivity" min={0} max={100} scale={100} format={pct} />
            <Slider label="Max speed ×" k="trailMaxSpeedMultiplier" min={100} max={300} step={5} scale={100} format={pct} />
            <Slider label="Texture (slow)" k="trailTextureAmp1" min={0} max={12} step={0.5} />
            <Slider label="Texture (fast)" k="trailTextureAmp2" min={0} max={6} step={0.25} />
          </Section>
        )}

        {settings.animationMode === 'aura' && (
          <Section title="Aura">
            <Slider label="Wave count" k="auraWaveCount" min={1} max={4} />
            <Slider label="Wave height" k="auraWaveHeight" min={10} max={300} step={5} scale={100} format={pct} />
            <Slider label="Wave speed" k="auraWaveSpeed" min={10} max={300} step={5} scale={100} format={pct} />
            <Slider label="Ripple detail" k="auraRippleDetail" min={0} max={8} step={0.5} />
          </Section>
        )}

        <Section title="Color">
          <Toggle label="Override album color" k="colorOverrideEnabled" />
          {settings.colorOverrideEnabled && (
            <Row label="Colors">
              <input
                type="color"
                value={rgbToHex(settings.overridePrimary)}
                onChange={(e) => updateSettings({ overridePrimary: hexToRgb(e.target.value) })}
              />
              <input
                type="color"
                value={rgbToHex(settings.overrideSecondary)}
                onChange={(e) => updateSettings({ overrideSecondary: hexToRgb(e.target.value) })}
              />
            </Row>
          )}
        </Section>

        <Section title="Lyrics">
          <Choice
            label="Background"
            k="lyricsBackground"
            options={[
              ['transparent', 'Transparent'],
              ['albumBlend', 'Album Blend'],
              ['solid', 'Solid'],
            ]}
          />
          {settings.lyricsBackground === 'solid' && (
            <Choice
              label="Solid color"
              k="lyricsSolidColor"
              options={[
                ['black', 'Black'],
                ['white', 'White'],
              ]}
            />
          )}
          <Choice
            label="Lyric style"
            k="lyricStyle"
            options={[
              ['karaokeFill', 'Karaoke Fill'],
              ['bounce', 'Bounce'],
              ['blurFocus', 'Blur Focus'],
              ['stackedFade', 'Stacked Fade'],
            ]}
          />
          <Toggle label="Equal word emphasis" k="equalWordEmphasis" />
          <Toggle label="Full-bleed album art" k="albumFullBleed" />

          {/* Same knob as the lyrics view's sync bar, mirrored here so it's
              findable. Positive holds the lyrics back. */}
          <Row label="Sync offset">
            <TextButton onClick={() => updateSettings({ lyricsOffsetMs: settings.lyricsOffsetMs - LYRIC_NUDGE_MS })}>
              −
            </TextButton>
            <span className="settings-hint">{secs(settings.lyricsOffsetMs)}</span>
            <TextButton onClick={() => updateSettings({ lyricsOffsetMs: settings.lyricsOffsetMs + LYRIC_NUDGE_MS })}>
              +
            </TextButton>
            <TextButton onClick={() => updateSettings({ lyricsOffsetMs: 0 })}>Reset</TextButton>
          </Row>
        </Section>

        <Section title="Window">
          <Row label="Display">
            <select
              value={settings.displayId ?? ''}
              onChange={(e) => window.lyriglow.selectMonitor(Number(e.target.value))}
            >
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.primary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Fullscreen">
            <input
              type="checkbox"
              checked={settings.windowMode === 'fullscreen'}
              onChange={(e) => window.lyriglow.setWindowMode(e.target.checked ? 'fullscreen' : 'windowed')}
            />
            <span className="settings-hint">Ctrl+Alt+F</span>
          </Row>
          <Slider label="Safe-area offset" k="safeAreaOffsetPx" min={0} max={80} />
          <Toggle label="Auto-hide widget" k="autoHideWidget" hint="Ctrl+Alt+L" />
          {/* Applies to the widget and this window together — at 0 the controls
              float with no panel behind them at all. */}
          <Slider label="Panel opacity" k="panelOpacity" min={0} max={100} scale={100} format={pct} />
          {/* No "move mode" toggle: both boxes are always draggable. Drags start
              on empty chrome only, so controls still take their clicks. */}
          <Row label="Box positions">
            <TextButton onClick={() => updateSettings({ widgetPosition: null, settingsPosition: null })}>
              Reset
            </TextButton>
          </Row>
        </Section>

        <Section title="App">
          <Choice
            label="Music source"
            k="musicSource"
            options={[
              ['spotify', 'Spotify'],
              ['appleMusic', 'Apple Music (needs setup)'],
            ]}
          />
          <Toggle label="Launch on startup" k="launchOnStartup" />
          <Toggle label="Check for updates" k="autoUpdateCheckEnabled">
            <TextButton onClick={() => setUpdateFlash('Auto-update isn’t wired up yet')}>Check now</TextButton>
          </Toggle>
          {updateFlash && <div className="settings-flash">{updateFlash}</div>}
        </Section>

        <button type="button" className="quit-btn" onClick={() => window.lyriglow.quit()}>
          Quit LyriGlow
        </button>
      </div>
    </div>
  );
}

/** The one slider whose stored value can be null (null = auto, worked out from
 *  the live display size), so it can't use the plain bound Slider. */
function TrailLengthRow(): JSX.Element {
  const trailLengthPct = useStore((s) => s.settings.trailLengthPct);
  const updateSettings = useStore((s) => s.updateSettings);
  // The overlay window fills the active display, so this is that display's real
  // size — the auto length scales with it rather than assuming 1080p.
  const auto = autoTrailLengthPct(window.innerWidth, window.innerHeight);

  return (
    <Row label="Trail length">
      <input
        type="range"
        min={5}
        max={95}
        value={Math.round(trailLengthPct ?? auto)}
        onChange={(e) => updateSettings({ trailLengthPct: Number(e.target.value) })}
      />
      <span className="settings-hint">{trailLengthPct == null ? 'auto' : `${Math.round(trailLengthPct)}%`}</span>
      <TextButton onClick={() => updateSettings({ trailLengthPct: null })}>Auto</TextButton>
    </Row>
  );
}
