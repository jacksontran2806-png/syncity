import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { RELEASE_NOTES, shouldShowReleaseNotes } from '@shared/releaseNotes';

/**
 * The card that says what just arrived.
 *
 * An in-place update is otherwise completely silent: the app quits on 0.1.0
 * and comes back as 0.1.1 with no indication that anything happened, which
 * makes the work invisible and makes a changed behaviour look like a bug
 * rather than a release. This says so once, briefly, then never again.
 *
 * SHOWN WHEN, exactly: the running version equals the bundled notes' version,
 * AND the user has not already dismissed that version. Both halves matter —
 * the version check means a build whose notes were forgotten shows nothing
 * instead of announcing the wrong changes (see shared/releaseNotes.ts), and
 * the dismissal is persisted in settings, so it survives a restart rather than
 * reappearing every launch until the next update.
 *
 * A fresh install shows nothing: settingsStore records the current version as
 * already seen when there is no settings file to read.
 *
 * It never steals focus and never blocks anything. It sits bottom-right, out
 * of the widget's way at the top of the screen, and is a hit region only for
 * its own box — the rest of the overlay stays click-through.
 */
export function WhatsNew(): JSX.Element | null {
  const settings = useStore((s) => s.settings);
  const palette = useStore((s) => s.palette);
  const updateSettings = useStore((s) => s.updateSettings);
  const [version, setVersion] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // The running version comes from the updater's status, which already carries
  // it — app.getVersion() over IPC, and the only thing here that has to be the
  // real packaged version rather than anything baked in at build time.
  useEffect(() => {
    void window.syncity.updateStatus().then((status) => setVersion(status.currentVersion));
  }, []);

  const notes = RELEASE_NOTES;
  if (!shouldShowReleaseNotes(version, settings.lastSeenReleaseVersion, notes)) return null;

  // Dismissal is written before the exit animation finishes, so a quit
  // mid-animation still counts as seen. Nobody wants this twice.
  const dismiss = (): void => {
    setLeaving(true);
    void updateSettings({ lastSeenReleaseVersion: notes.version });
  };

  return (
    <div
      className={`whats-new ${leaving ? 'is-leaving' : ''}`}
      // The badge takes the album's own colour rather than the chrome tint:
      // chrome is neutral by default, and a neutral badge on a neutral panel
      // is invisible. Passed as bare "r, g, b" so the rule can pick its alpha.
      style={{ '--wn-accent': `${palette.primary.r}, ${palette.primary.g}, ${palette.primary.b}` } as React.CSSProperties}
      data-hitregion
    >
      <div className="whats-new-head">
        <span className="whats-new-badge">Updated</span>
        <span className="whats-new-version">Syncity {notes.version}</span>
        <button type="button" className="whats-new-close" title="Dismiss" onClick={dismiss}>
          ✕
        </button>
      </div>
      <p className="whats-new-headline">{notes.headline}</p>
      <ul className="whats-new-points">
        {notes.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="whats-new-actions">
        {/* Opens the browser rather than rendering the full notes here: this
            is an overlay sitting on top of someone's work, not a document. */}
        <button
          type="button"
          className="whats-new-link"
          onClick={() => {
            void window.syncity.openReleaseNotes();
            dismiss();
          }}
        >
          See what's new →
        </button>
      </div>
    </div>
  );
}
