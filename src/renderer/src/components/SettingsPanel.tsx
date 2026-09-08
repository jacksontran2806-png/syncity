import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Choice, Row, Section, Slider, TextButton, Toggle } from './SettingsControls';
import { ColorWheelPicker } from './ColorWheelPicker';
import { SpotifySetup } from './SpotifySetup';
import { FONT_THEMES } from '../lib/fontThemes';
import type { FontTheme } from '@shared/types';

const LYRIC_NUDGE_MS = 250;

/** Built from the theme table itself, so adding a pairing there is enough to
 *  make it appear here — no second list to keep in step. */
const FONT_OPTIONS = (Object.keys(FONT_THEMES) as FontTheme[]).map(
  (key) => [key, FONT_THEMES[key].label] as const
);

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
        {/* First, and deliberately: nothing else in this panel does anything
            until Spotify is connected. */}
        <Section title="Connection">
          <SpotifySetup />
        </Section>

        <Section title="Color">
          <Toggle label="Override album color" k="colorOverrideEnabled" />
          {settings.colorOverrideEnabled && (
            <Row label="Colors">
              <ColorWheelPicker
                label="Primary color"
                value={settings.overridePrimary}
                onChange={(overridePrimary) => updateSettings({ overridePrimary })}
              />
              <ColorWheelPicker
                label="Secondary color"
                value={settings.overrideSecondary}
                onChange={(overrideSecondary) => updateSettings({ overrideSecondary })}
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
              ['custom', 'Custom color'],
            ]}
          />
          {settings.lyricsBackground === 'custom' && (
            <Row label="Background color">
              {/* Lyric text color is still chosen from the album's palette and
                  scored for readability against this pick (see
                  lib/lyricColor) — any color stays readable. */}
              <ColorWheelPicker
                label="Lyrics background color"
                value={settings.lyricsCustomColor}
                onChange={(lyricsCustomColor) => updateSettings({ lyricsCustomColor })}
              />
            </Row>
          )}
          {settings.lyricsBackground === 'albumBlend' && (
            <Slider
              label="Blend colors"
              k="albumBlendColorCount"
              min={1}
              max={3}
              step={1}
              format={(v) => (v <= 1 ? '1 (flat tint)' : `${v} (gradient)`)}
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
              ['giantWord', 'Giant Word'],
            ]}
          />
          <Toggle label="Full-bleed album art" k="albumFullBleed" />
          {/* Independent of full-bleed art: a flat custom color behind Album
              fullscreen mode — the art (if also on) still paints over it. */}
          <Toggle label="Album mode: custom background" k="albumCustomBgEnabled" />
          {settings.albumCustomBgEnabled && (
            <Row label="Album background color">
              <ColorWheelPicker
                label="Album background color"
                value={settings.albumCustomColor}
                onChange={(albumCustomColor) => updateSettings({ albumCustomColor })}
              />
            </Row>
          )}

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
              onChange={(e) => window.syncity.selectMonitor(Number(e.target.value))}
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
              onChange={(e) => window.syncity.setWindowMode(e.target.checked ? 'fullscreen' : 'windowed')}
            />
            <span className="settings-hint">Ctrl+Alt+F</span>
          </Row>
          {/* Where the compact widget lives and how it opens. Dragging belongs
              to Free alone — Default parks it, Notch pins it to the top edge. */}
          <Choice
            label="Overlay mode"
            k="overlayMode"
            options={[
              ['notch', 'Notch (top edge)'],
              ['free', 'Free (draggable)'],
            ]}
          />
          {/* Chrome fill: the app's own near-black, or tinted from the cover
              so the notch and panels take on the record's colour. */}
          <Choice
            label="Chrome colour"
            k="chromeTint"
            options={[
              ['neutral', 'Neutral'],
              ['album', 'Album colour'],
            ]}
          />
          {/* Where Free mode parks the widget before it has ever been dragged.
              Notch sits flush against the edge by definition, so the offset has
              nothing to apply to there. */}
          {settings.overlayMode === 'free' && (
            <Slider label="Distance from top" k="safeAreaOffsetPx" min={0} max={80} />
          )}
          {/* Free mode: place the whole widget anywhere on the screen, by
              number rather than by dragging it. Stored as a fraction of the
              viewport, so it survives a resolution change (see WidgetPosition).
              Dragging writes the same setting — the two stay in sync. */}
          {settings.overlayMode === 'free' && <PositionRows />}
          {/* The collapsed pill's own footprint — separate from the expanded
              widget, which sizes itself to its contents. Click, hover, or drag
              all still work the same regardless of size. */}
          <Slider label="Compact menu width" k="pillWidth" min={80} max={320} step={4} />
          <Slider label="Compact menu height" k="pillHeight" min={20} max={64} step={2} />
          {/* Typeface pairing for the whole app — display face and body face
              together. See lib/fontThemes.ts for what each one resolves to. */}
          <Choice
            label="Font"
            k="fontTheme"
            options={FONT_OPTIONS}
          />
          <Toggle label="Auto-hide widget" k="autoHideWidget" hint="Ctrl+Alt+L" />
          {settings.autoHideWidget && (
            <>
              <Choice
                label="Expand animation"
                k="widgetExpandAnimation"
                options={[
                  ['genie', 'Genie'],
                  ['scaleFade', 'Scale + fade'],
                  ['slideUp', 'Slide up'],
                  ['none', 'None (instant)'],
                ]}
              />
              <Choice
                label="Collapse animation"
                k="widgetCollapseAnimation"
                options={[
                  ['genie', 'Genie'],
                  ['scaleFade', 'Scale + fade'],
                  ['slideUp', 'Slide up'],
                  ['none', 'None (instant)'],
                ]}
              />
            </>
          )}
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
              ['appleMusic', 'Apple Music (coming soon)'],
            ]}
          />
          <Toggle label="Launch on startup" k="launchOnStartup" />
          <Toggle label="Check for updates" k="autoUpdateCheckEnabled">
            <TextButton onClick={() => setUpdateFlash('Auto-update isn’t wired up yet')}>Check now</TextButton>
          </Toggle>
          {updateFlash && <div className="settings-flash">{updateFlash}</div>}
        </Section>

        <button type="button" className="quit-btn" onClick={() => window.syncity.quit()}>
          Quit Syncity
        </button>
      </div>
    </div>
  );
}

/** Percentage placement for Free mode — the same widgetPosition dragging
 *  writes, so the sliders track a drag and a drag tracks the sliders. Bound
 *  by hand rather than through <Slider>, which binds one top-level numeric
 *  key and can't reach into the {xPct, yPct} pair. */
function PositionRows(): JSX.Element {
  const position = useStore((s) => s.settings.widgetPosition);
  const updateSettings = useStore((s) => s.updateSettings);

  // Before the first drag there's no stored position; show where the default
  // placement actually puts it (centred, near the top) rather than 0,0.
  const xPct = position?.xPct ?? 0.5;
  const yPct = position?.yPct ?? 0;
  const move = (next: { xPct?: number; yPct?: number }) =>
    void updateSettings({ widgetPosition: { xPct, yPct, ...next } });

  return (
    <>
      <Row label="Position X">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(xPct * 100)}
          onChange={(e) => move({ xPct: Number(e.target.value) / 100 })}
        />
        <span className="settings-hint">{pct(xPct)}</span>
      </Row>
      <Row label="Position Y">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(yPct * 100)}
          onChange={(e) => move({ yPct: Number(e.target.value) / 100 })}
        />
        <span className="settings-hint">{pct(yPct)}</span>
      </Row>
    </>
  );
}
