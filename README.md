# Syncity

A lyrics and now-playing overlay for Spotify, on Windows. It sits above
everything, click-through until you reach for it, and colours itself from the
album art.

- **Dynamic-island widget** — a compact pill that expands on hover, with
  transport controls and a live spectrum from your system audio.
- **Synced lyrics** — LRCLIB-sourced, on a local playback clock that keeps the
  highlight steady between polls, with a trim control for output latency.
- **Fullscreen lyrics and album views**, both drawn against the blurred cover.
- **Album-derived colour** — text colour is chosen *from* the artwork's palette
  and scored for harmony and readability, not set against it.

## Install

Grab the installer or the portable build from `dist/`, or see
[docs/install.md](docs/install.md) for the details — first run, tray icon,
Spotify sign-in, and how to point it at your own Spotify app.

## Develop

```bash
npm install
cp .env.example .env      # add your Spotify client ID
npm run dev
```

| Command | |
| --- | --- |
| `npm run dev` | Run from source with hot reload |
| `npm test` | The suite — colour, lyric timing, poll cadence, drag maths, stacking |
| `npm run typecheck` | Both TypeScript projects |
| `npm run build` | Typecheck and bundle into `out/` |
| `npm run dist` | Windows installer + portable exe into `dist/` |
| `npm run icons` | Redraw the app and tray icons |

Playback control requires Spotify Premium. Reading what is playing does not.
Apple Music support is stubbed but not functional — see
[docs/apple-music-setup.md](docs/apple-music-setup.md).
