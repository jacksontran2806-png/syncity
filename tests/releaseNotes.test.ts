// Pins when the post-update card appears.
//
// This is one boolean, but it is the boolean between "says hello once after an
// update" and two failure modes that are both worse than showing nothing: a
// card that reappears on every launch, and a card that describes changes the
// running build does not contain.

import { RELEASE_NOTES, shouldShowReleaseNotes, type ReleaseNotes } from '../src/shared/releaseNotes';
import { check, done } from './assert';

const notes: ReleaseNotes = { version: '0.1.1', headline: 'x', points: ['a'] };

check(
  'shows after an update from a version that had different notes',
  shouldShowReleaseNotes('0.1.1', '0.1.0', notes)
);
check(
  'stays hidden once dismissed',
  !shouldShowReleaseNotes('0.1.1', '0.1.1', notes)
);
check(
  'stays hidden before the updater has reported a version',
  !shouldShowReleaseNotes(null, '0.1.0', notes)
);

// The safe failure. A release that bumps package.json but forgets
// shared/releaseNotes.ts must be quiet, not wrong — an 0.1.2 build announcing
// 0.1.1's changes is worse than no card at all.
check(
  'a build whose notes were not updated shows nothing',
  !shouldShowReleaseNotes('0.1.2', '0.1.1', notes)
);
check(
  'and shows nothing even for a user who never saw the older notes',
  !shouldShowReleaseNotes('0.1.2', '0.1.0', notes)
);

// A fresh install records the running version as seen (settingsStore does this
// when there is no settings file), so it must not open with a card.
check(
  'a fresh install sees nothing',
  !shouldShowReleaseNotes('0.1.1', '0.1.1', notes)
);

// The shipped notes must match the shipped app, or the card never appears for
// anyone. Compared against package.json rather than a copy of the number.
{
  const pkgVersion = require('../package.json').version as string;
  check(
    'the bundled notes are for the version being shipped',
    RELEASE_NOTES.version === pkgVersion,
    `notes=${RELEASE_NOTES.version} package.json=${pkgVersion}`
  );
  check(
    'the card stays short enough to read at a glance',
    RELEASE_NOTES.points.length > 0 && RELEASE_NOTES.points.length <= 3,
    `${RELEASE_NOTES.points.length} points`
  );
}

done();
