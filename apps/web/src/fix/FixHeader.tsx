import { Button } from '../ui/Button';
import type { FixAction } from './actions';
import type { SaveState } from './useScriptEditor';

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'saved') return <span className="muted" role="status">Saved</span>;
  if (state === 'saving') return <span className="muted" role="status">Saving…</span>;
  return (
    <span className="save-error" role="alert">
      {error}
    </span>
  );
}

export function FixHeader(props: { title: string; version: number; toCheck: number; history: FixAction[]; saveState: SaveState; saveError: string | null; onDone(): void }) {
  const { title, version, toCheck, history, saveState, saveError, onDone } = props;
  return (
    <header className="fix-header">
      <strong>{title}</strong>
      <span className="muted">Version {version}</span>
      <span>{toCheck} to check</span>
      <span className="grow" />
      {history.map((a) => (
        <Button key={a.id} shortcut={a.keys[0]} keepFocus={false} disabled={!a.enabled} onClick={a.run}>
          {a.label}
        </Button>
      ))}
      <SaveStatus state={saveState} error={saveError} />
      <Button variant="primary" onClick={onDone}>
        Done
      </Button>
    </header>
  );
}
