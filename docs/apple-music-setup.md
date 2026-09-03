# Apple Music setup

Apple Music is **not functional in LyriGlow today**. `src/main/providers/appleMusic.ts`
is a stub that reports itself as unconfigured and throws on every call — deliberately,
not as an oversight. Making it real requires steps only you, the developer, can do;
none of it can be automated or shipped inside the app's code. This document is those
steps.

If you just want now-playing + lyrics working, use Spotify (`SPOTIFY_CLIENT_ID` in
`.env`) — that path is fully implemented.

## What Apple Music integration actually requires

Unlike Spotify's free developer tier, Apple has no read-only or free access level for
playback state. Everything below is a hard requirement of Apple's own platform, not a
choice LyriGlow makes:

1. **A paid Apple Developer Program membership** (currently $99/year). There is no
   free tier that unlocks MusicKit.
2. **A MusicKit identifier and a private key**, both created in the Developer portal.
3. **A signed developer token**, generated from that key — never the raw key itself.
4. **An end user's Apple ID sign-in, on a subscription that's actually paying for
   Apple Music.** Without an active subscription, MusicKit authorizes but returns
   nothing playable.

## Step by step

### 1. Enroll in the Apple Developer Program

[developer.apple.com/programs](https://developer.apple.com/programs/) — paid,
annual, tied to an Apple ID. This is the gate in front of everything else; there's no
way around it for MusicKit access.

### 2. Create a MusicKit identifier and a private key

In the [Developer portal](https://developer.apple.com/account/resources/identifiers/list):

- **Certificates, Identifiers & Profiles → Identifiers → MusicKit** — register a
  MusicKit identifier for this app.
- **Keys** — create a new key with the MusicKit capability enabled. Downloading it
  gives you a `.p8` private key file, **once** — Apple does not let you re-download it,
  so store it somewhere durable immediately (a password manager or secrets vault, not
  a Downloads folder).
- Note down two IDs from this same screen, both required for step 3:
  - **Key ID** (10 characters, shown next to the key)
  - **Team ID** (10 characters, shown in the top-right of the portal, under your name)

### 3. Generate a developer token (ES256 JWT)

The developer token is a JWT signed with the `.p8` key using the ES256 algorithm,
containing your Team ID as issuer and the Key ID in its header. MusicKit JS needs this
token at runtime to authorize.

**Generate it server-side or at build time — never embed the `.p8` file in the
Electron app bundle.** The private key signs tokens that can call the Apple Music API
as your developer account; if it ships inside `out/` or an installer, anyone who
unpacks the app has it permanently. A minimal Node script using the `jsonwebtoken`
package looks like:

```js
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('/secure/path/AuthKey_XXXXXXXXXX.p8');

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d', // Apple's own maximum is 6 months
  issuer: 'YOUR_TEAM_ID',
  header: { alg: 'ES256', kid: 'YOUR_KEY_ID' },
});
```

Run this outside the app (locally, or in CI) and hand LyriGlow only the resulting
token string — the same shape as `SPOTIFY_CLIENT_ID`, via
`APPLE_MUSIC_DEVELOPER_TOKEN` in `.env` (already read by
`createAppleMusicProvider()` in `src/main/index.ts`; it's the wiring past that point
that doesn't exist yet — see "What's left to build," below). The token expires and
needs regenerating before then; there's no refresh mechanism, only reissuing.

### 4. Apple ID sign-in and an active subscription

Once real, the app would prompt an Apple ID sign-in via MusicKit JS's `authorize()`
call on first run. The signed-in account needs an **active Apple Music
subscription** — without one, authorization can still succeed while every
playback/now-playing call returns nothing, which looks identical to a bug from the
outside. If Apple Music integration ever appears broken during testing, confirm the
test account's subscription status before assuming it's a code problem.

### 5. Animated album art — set expectations correctly

Apple's public API does not expose animated/motion artwork for arbitrary tracks —
only a small, curated set of editorial content Apple has specifically produced it
for. There's no way to request it, predict which tracks have it, or force it for a
song that doesn't.

**In practice: expect the Ken-Burns fallback (a slow static-art zoom) on nearly every
track you play.** Real motion artwork will only ever appear on the handful of tracks
Apple picked, and that set is entirely outside this app's or your control. This isn't
a bug or a missing feature — it's the actual shape of what Apple's API offers. The
code already reflects this: `NowPlaying.motionArtUrl` is populated only when the API
item carries `editorialVideo`/`motionArtwork`, and the UI's Ken-Burns fallback is the
default path in `AlbumBackdrop.tsx`, not a degraded one.

## What's left to build

Steps 1-4 are things *you* do outside the codebase — they can't be automated. What
they unblock is the remaining engineering work, which is not yet done:

- MusicKit JS runs in a **browser context**. It cannot run in the Electron main
  process the way the Spotify client does — it needs a renderer (or a hidden
  `BrowserWindow`), with its calls routed back to main over IPC.
- `createAppleMusicProvider()` needs an actual implementation behind the
  `NowPlayingProvider` interface (`src/main/providers/types.ts`) — today it's a stub
  that always throws `apple_music_not_configured`.
- The Apple ID `authorize()` flow needs a UI moment — Spotify's equivalent is the
  "Connect Spotify" button in `Widget.tsx`.

Until that work lands, setting `APPLE_MUSIC_DEVELOPER_TOKEN` gets you exactly one
step further than not setting it: `isConfigured()` returns `true` instead of
`false`. Every actual call still throws.
