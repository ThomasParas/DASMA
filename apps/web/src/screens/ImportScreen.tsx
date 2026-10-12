import { IMPORT_ERROR_MESSAGES, ScriptImportError, UNTITLED, type ImportWarning } from '@dasma/script';
import { useState, type DragEvent } from 'react';
import { stem } from '../files';
import { WorkerCrashError } from '../import/importer';
import { kindOfFile, type FileKind, type ImportOutcome, type ImportSource } from '../import/run';
import { href, navigate } from '../router';
import { useServices } from '../services';
import { afterProductionCreated } from '../storage';
import { Button } from '../ui/Button';
import { warningsInOrder, warningText } from './warnings';

interface Picked {
  key: number;
  file: File;
  kind: FileKind;
}

type Status =
  | { phase: 'idle' }
  | { phase: 'running'; message: string }
  | { phase: 'error'; message: string; offerPaste: boolean }
  | { phase: 'warnings'; outcome: ImportOutcome; warnings: ImportWarning[] };

let nextKey = 1;

async function toSource(p: Picked): Promise<ImportSource> {
  return p.kind === 'text'
    ? { name: p.file.name, kind: 'text', text: await p.file.text() }
    : { name: p.file.name, kind: p.kind, bytes: new Uint8Array(await p.file.arrayBuffer()) };
}

/** Spec §5.2. With `productionId` this is a re-import, which goes to review instead of being saved. */
export function ImportScreen({ productionId }: { productionId?: string }) {
  const services = useServices();
  const [mode, setMode] = useState<'files' | 'paste'>('files');
  const [files, setFiles] = useState<Picked[]>([]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  const addFiles = (list: File[]) => {
    const added: Picked[] = [];
    let refused = false;
    for (const file of list) {
      const kind = kindOfFile(file.name);
      if (kind) added.push({ key: nextKey++, file, kind });
      else refused = true;
    }
    setStatus(refused ? { phase: 'error', message: IMPORT_ERROR_MESSAGES.unsupportedFormat, offerPaste: false } : { phase: 'idle' });
    if (added.length === 0) return;
    if (!titleTouched && files.length === 0) setTitle(stem(added[0].file.name));
    setFiles((f) => [...f, ...added]);
  };

  const move = (i: number, d: -1 | 1) =>
    setFiles((f) => {
      const j = i + d;
      if (j < 0 || j >= f.length) return f;
      const n = f.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };

  async function finish(outcome: ImportOutcome) {
    setStatus({ phase: 'running', message: 'Saving…' });
    try {
      if (productionId) {
        services.pending.set(productionId, { mode: 'file', ...outcome });
        navigate({ name: 'reimport', id: productionId });
        return;
      }
      const { production } = await services.repo.createProduction({ title: title.trim() || UNTITLED, origin: 'created', version: outcome });
      await afterProductionCreated(services.repo, services.requestPersist);
      navigate({ name: 'fix', id: production.id });
    } catch (err) {
      setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err), offerPaste: false });
    }
  }

  async function run() {
    setStatus({ phase: 'running', message: 'Reading…' });
    try {
      const sources: ImportSource[] = mode === 'files' ? await Promise.all(files.map(toSource)) : [{ name: 'Pasted text', kind: 'text', text }];
      const outcome = await services.importer.importFiles(sources, title.trim() || UNTITLED, (message) => setStatus({ phase: 'running', message }));
      if (outcome.warnings.length) setStatus({ phase: 'warnings', outcome, warnings: warningsInOrder(outcome.warnings) });
      else await finish(outcome);
    } catch (err) {
      if (err instanceof ScriptImportError) setStatus({ phase: 'error', message: err.message, offerPaste: err.code === 'noTextLayer' });
      else if (err instanceof WorkerCrashError) setStatus({ phase: 'error', message: err.message, offerPaste: true });
      else setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err), offerPaste: false });
    }
  }

  const ready = mode === 'files' ? files.length > 0 : text.trim().length > 0;
  const running = status.phase === 'running';

  return (
    <main className="page">
      <p>
        <a href={productionId ? href({ name: 'production', id: productionId }) : href({ name: 'library' })}>← Back</a>
      </p>
      <h1>{productionId ? 'Re-import script' : 'New production'}</h1>
      {!productionId && (
        <label className="field">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
          />
        </label>
      )}
      <div className="tabs">
        <Button aria-pressed={mode === 'files'} onClick={() => setMode('files')}>
          Files
        </Button>
        <Button aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>
          Paste text
        </Button>
      </div>
      {mode === 'files' ? (
        <section className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <p>Drop PDF or Word files here, or</p>
          <label className="btn btn-plain">
            {files.length > 0 ? 'Add another file' : 'Choose files'}
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="visually-hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
          </label>
          {files.length > 0 && (
            <>
              <ol className="file-list">
                {files.map((f, i) => (
                  <li key={f.key}>
                    <span>{f.file.name}</span>{' '}
                    <Button aria-label={`Move ${f.file.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </Button>{' '}
                    <Button aria-label={`Move ${f.file.name} down`} disabled={i === files.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </Button>{' '}
                    <Button aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
              <p className="muted">Files are joined in this order.</p>
            </>
          )}
        </section>
      ) : (
        <textarea className="paste" aria-label="Script text" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <p>
        <Button variant="primary" disabled={!ready || running} onClick={() => void run()}>
          Import
        </Button>
      </p>
      {status.phase === 'running' && <p role="status">{status.message}</p>}
      {status.phase === 'error' && (
        <div role="alert" className="alert">
          <p>{status.message}</p>
          {status.offerPaste && (
            <Button
              onClick={() => {
                setMode('paste');
                setStatus({ phase: 'idle' });
              }}
            >
              Paste the text instead
            </Button>
          )}
        </div>
      )}
      {status.phase === 'warnings' && (
        <section>
          <h2>Before you fix tags</h2>
          <ul>
            {status.warnings.map((w, i) => (
              <li key={i}>{warningText(w)}</li>
            ))}
          </ul>
          <Button variant="primary" onClick={() => void finish(status.outcome)}>
            Continue
          </Button>
        </section>
      )}
    </main>
  );
}
