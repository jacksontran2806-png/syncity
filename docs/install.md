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

The build carries a Spotify client ID so it works out of the box — but Spotify
only admits 25 people to an application that hasn't passed its quota review. If
**Connect Spotify** fails with *"user not registered"*, that cap is why, and
the fix is your own Spotify app: free, no review, about three minutes.

Settings → **Connection** → **Use my own Spotify app** walks you through it:

1. Open the Spotify dashboard and press **Create app**.
2. Name it anything, tick **Web API**.
3. Paste `http://127.0.0.1:8888/callback` into **Redirect URIs** — copy it from
   the setup panel rather than typing it; this is the step people get wrong.
4. Save, open the app's Settings, copy the **Client ID**.
5. Paste it into Syncity and press Save, then **Connect Spotify**.

A client ID is a public identifier, not a password. Syncity signs in with Auth
Code + PKCE, which has no client secret at all.

Changing the client ID signs you out, because the stored session belongs to the
application that issued it.

## Updates

The installed build checks for new versions in the background and downloads
them quietly. It never restarts itself to apply one — Settings shows
**Restart to update** when a version is waiting, and if you'd rather it stayed
out of the way entirely, the update is applied the next time you quit anyway.
Background checks can be turned off under Settings → **Check for updates**;
**Check now** still works when they are.

The portable build cannot update itself — there is no installer to apply the
update with — so it tells you a new version exists and leaves replacing the
file to you.

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
