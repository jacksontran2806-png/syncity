# Installing Syncity

Windows 10/11, 64-bit. Nothing else is required — the app bundles its own
runtime.

## Download

Two builds come out of `npm run dist`, both in `dist/`:

| File | What it does |
| --- | --- |
| `Syncity-Setup-<version>.exe` | Normal installer. Start Menu entry, desktop shortcut, uninstaller. Installs per-user, so it never asks for an administrator. |
| `Syncity-<version>-portable.exe` | Single file, runs from anywhere, installs nothing. |

Both keep settings and your Spotify session in `%APPDATA%\Syncity`, so the
portable build is not a throwaway copy — sign in once and it stays signed in.

Windows SmartScreen will warn on first run ("Windows protected your PC"). The
builds are unsigned; a code-signing certificate is the only thing that removes
that warning. **More info → Run anyway.**

## First run

Syncity has no taskbar window. It lives in the tray — look for the three-bar
icon next to the clock. Right-click it for Show/Hide Overlay, Settings and
Quit.

Open Settings and press **Connect Spotify**. That opens your browser once, you
approve the app, and the window closes itself. Playback control needs Spotify
Premium; showing what is playing does not.

## Using your own Spotify app

The build carries a Spotify client ID so it works out of the box. Spotify caps
an unpublished app at 25 authorised listeners, so if you hit that — or you
simply want your own — point Syncity at your own app without rebuilding it:

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add `http://127.0.0.1:8888/callback` to its **Redirect URIs**.
3. Create a file at `%APPDATA%\Syncity\.env`:

   ```
   SPOTIFY_CLIENT_ID=your_client_id_here
   ```

4. Restart Syncity.

That file wins over whatever was baked into the build. There is no client
secret to add — the desktop flow is Auth Code + PKCE, which does not use one.

## Building it yourself

```bash
npm install
cp .env.example .env      # then put your Spotify client ID in it
npm run dev               # run from source
npm run dist              # build the installer + portable exe into dist/
```

`npm run dist` bakes whatever is in `.env` at that moment into the build, so a
build made without one produces an app that can only be configured through the
`%APPDATA%\Syncity\.env` file above.

`npm run icons` regenerates the app and tray icons from their source in
`scripts/make-icons.mjs` — they are drawn in HTML/CSS and captured through
Electron rather than kept as binaries nobody can edit.
