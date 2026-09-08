// What the app says about itself after an update.
//
// The notes are BUNDLED, not fetched. A build's card then describes the build
// the user is actually running — a fetched feed can disagree with the binary
// (offline, a cached CDN response, a release edited after the fact), and a
// "what's new" card that lists changes you don't have is worse than none.
//
// Keeping one entry rather than a history is deliberate: the card only ever
// announces the version that just arrived, and the full list already lives on
// the site, which is what the link is for.
//
// RELEASING: bump this alongside package.json's version. If they disagree the
// card stays hidden — see WhatsNew.tsx, which shows nothing unless the running
// version matches these notes exactly. That is the safe failure: a release
// that forgot its notes is quiet rather than wrong.

export const RELEASE_NOTES_URL = 'https://site-one-rho-92.vercel.app/#whats-new';

export interface ReleaseNotes {
  /** Must equal the app version this ships in. */
  version: string;
  /** One line, in the app's voice. Shown under the heading. */
  headline: string;
  /** Three at most. Anything longer belongs on the site — this card sits over
   *  whatever the user is doing and is not a document. */
  points: string[];
}

export const RELEASE_NOTES: ReleaseNotes = {
  version: '0.1.1',
  headline: 'Smaller and lighter. Nothing moved.',
  points: [
    '45 MB smaller once installed, and a smaller download.',
    'Less battery when idle — the pill and the lyric clock stop when nothing is moving.',
    'System audio is only captured while the visualizer is actually on screen.',
  ],
};

/**
 * Whether the post-update card should appear.
 *
 * `runningVersion` is null until the updater's status comes back. The version
 * equality is the important half: a build that shipped with stale notes says
 * NOTHING rather than describing changes it doesn't contain.
 */
export function shouldShowReleaseNotes(
  runningVersion: string | null,
  lastSeenVersion: string,
  notes: ReleaseNotes = RELEASE_NOTES
): boolean {
  if (!runningVersion) return false;
  if (runningVersion !== notes.version) return false;
  return lastSeenVersion !== notes.version;
}
