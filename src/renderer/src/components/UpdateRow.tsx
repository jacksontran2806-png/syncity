import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@shared/types';
import { Row, TextButton, Toggle } from './SettingsControls';

/**
 * The update control.
 *
 * Says what version is running and what, if anything, is happening about it.
 * Every state gets a sentence — including the ones that are not progress:
 * "you are up to date" and "the portable build cannot update itself" are
 * answers, and a control that goes quiet instead of saying them reads as
 * broken. That is what the stub this replaces actually did.
 *
 * The restart is always the user's press. See main/updater.ts for why an app
 * that sits on top of everything else must never take that decision itself.
 */
export function UpdateRow(): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    void window.syncity.updateStatus().then(setStatus);
    // Wrapped rather than returned directly: the unsubscribe hands back
    // ipcRenderer, and React treats anything a cleanup returns as a promise it
    // should have been given instead.
    const off = window.syncity.onUpdateStatus(setStatus);
    return () => {
      off();
    };
  }, []);

  const state = status?.state ?? 'idle';
  const busy = state === 'checking' || state === 'downloading' || state === 'available';

  const line = (): string => {
    if (!status) return '';
    switch (status.state) {
      case 'checking':
        return 'Checking…';
      case 'available':
        return `Found ${status.version}`;
      case 'downloading':
        return `Downloading ${status.version ?? ''} — ${status.percent ?? 0}%`;
      case 'ready':
        return `${status.version} is ready to install`;
      case 'none':
        return 'Up to date';
      case 'unsupported':
      case 'error':
        return status.message ?? 'Could not check';
      default:
        return '';
    }
  };

  return (
    <>
      <Toggle label="Check for updates" k="autoUpdateCheckEnabled">
        {state === 'ready' ? (
          <TextButton onClick={() => void window.syncity.updateInstall()}>Restart to update</TextButton>
        ) : (
          <TextButton onClick={() => void window.syncity.updateCheck()}>
            {busy ? 'Working…' : 'Check now'}
          </TextButton>
        )}
      </Toggle>
      <Row label="Version">
        <span className="settings-hint">{status?.currentVersion ?? '—'}</span>
        {line() && <span className={`update-line ${state === 'error' ? 'is-error' : ''}`}>{line()}</span>}
      </Row>
    </>
  );
}
