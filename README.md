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

**[syncity-app.vercel.app](https://syncity-app.vercel.app)** — installer and
portable build, with the setup walkthrough.

[docs/install.md](docs/install.md) covers the same ground in the repo: first
run, the tray icon, and registering the Spotify app it signs in through —
which every install does, because Spotify admits only 25 hand-entered users to
an unreviewed application, so no shippable app could cover everyone.

## Develop

```bash
npm install
cp .env.example .env      # optional: a client ID here saves setting one in the UI
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

The download site is `site/` — plain HTML, no build step. Vercel is connected
to this repo, so a push to `main` deploys it; the `vercel.json` at the root is
what tells Vercel to skip installing and building (there is nothing to build)
and to serve `site/` as-is. Without it, Vercel finds the Electron project's
package.json, runs `npm run build`, and fails looking for an output directory
that a desktop app never produces.

Installed copies update themselves from GitHub releases, which makes a release
the feed the app reads rather than just a place to put files —
[docs/releasing.md](docs/releasing.md) covers what one has to contain.

`syncity-app.vercel.app` is a deployment alias, and Vercel will not attach a
`.vercel.app` subdomain to a project as a proper domain, so it does not follow
new deployments on its own. After a site change:

```bash
vercel alias set <new-deployment-url> syncity-app.vercel.app
```

`site-one-rho-92.vercel.app` is the project's own production alias and does
follow automatically. A real domain would do the same and read better than
either.

Playback control requires Spotify Premium. Reading what is playing does not.
Apple Music support is stubbed but not functional — see
[docs/apple-music-setup.md](docs/apple-music-setup.md).
