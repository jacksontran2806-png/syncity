# Releasing

Installed copies of Syncity check GitHub releases for updates, so a release is
no longer just somewhere to put a file — it is the feed the app reads. Getting
it wrong doesn't break the release page, it breaks updating for everyone
already running the app.

## What a release must contain

| File | Why |
| --- | --- |
| `Syncity-Setup.exe` | The installer, and what the updater downloads and runs. |
| `Syncity-Setup.exe.blockmap` | Lets the updater fetch only the changed parts of the installer instead of all 78 MB. |
| `latest.yml` | **The feed.** Version, filename, size and hash. Without it the app cannot see the release at all and every check reports an error. |
| `Syncity-Portable.exe` | For people who don't want an installer. Not part of the update path. |

All four come out of `npm run dist` into `dist/`. The filenames carry no
version on purpose, so `releases/latest/download/Syncity-Setup.exe` stays a
permanent link.

## Cutting one

1. Bump `version` in `package.json`. The updater compares against this; a
   release whose version is not higher than what is installed is ignored.
2. `npm test && npm run dist`
3. Tag and push:
   ```bash
   git tag -a v0.2.0 -m "Syncity v0.2.0"
   git push origin v0.2.0
   ```
4. Create the release on that tag and attach all four files from `dist/`.

Or let electron-builder do steps 3–4, with a GitHub token that can write to the
repo:

```bash
GH_TOKEN=<token> npm run dist -- --publish always
```

That uploads the whole set — including `latest.yml`, which is the file most
likely to be forgotten by hand.

## What the app does with it

`src/main/updater.ts`. A check runs 25 seconds after launch and every six
hours, but only while **Check for updates** is on in Settings; the **Check
now** button ignores that setting, because an explicit press is not a
background check.

Anything found downloads quietly. Nothing is installed until the user presses
**Restart to update**, or until they next quit the app — this thing sits on
screen over whatever else they are doing, and restarting itself mid-song is not
a decision it gets to make.

Two cases report themselves rather than failing:

- **Running from source.** Updates are off entirely. The feed is the real one,
  and every check would offer to replace the build you are working on.
- **The portable build.** It has no installer to apply an update with, so it
  says so and points at the download instead.

## Signing

The builds are unsigned, so `verifyUpdateCodeSignature` is off in
`electron-builder.yml` — electron-updater otherwise refuses an update whose
signature it cannot match against the installed app's, and with nothing to
match that check can only fail. Turn it back on the day these builds get a
certificate.
