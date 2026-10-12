import { checkQueue, DASMA_EXTENSION, DASMA_MIME, toAnswerKey, writeDasma } from '@dasma/script';
import { useCallback, useEffect, useState } from 'react';
import type { ProductionRow, ScriptVersionRow } from '../db/schema';
import { safeFileName, stem } from '../files';
import { href, navigate } from '../router';
import { useServices } from '../services';
import { Button } from '../ui/Button';
import { NotFound } from './NotFound';

interface Loaded {
  production: ProductionRow;
  live: ScriptVersionRow;
  versions: ScriptVersionRow[];
  devTools: boolean;
}

export const ANSWER_KEY_SINGLE_FILE = 'Only for a script imported from a single file.';

export function Production({ id }: { id: string }) {
  const { repo, download } = useServices();
  const [data, setData] = useState<Loaded | 'missing' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [includeCast, setIncludeCast] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');

  const load = useCallback(async () => {
    const [production, live] = await Promise.all([repo.getProduction(id), repo.getLiveVersion(id)]);
    if (!production || !live) {
      setData('missing');
      return;
    }
    const [versions, devTools] = await Promise.all([repo.listVersions(id), repo.getMeta<boolean>('devTools')]);
    setData({ production, live, versions, devTools: !!devTools });
  }, [repo, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (data === null) return <main className="page">Loading…</main>;
  if (data === 'missing') return <NotFound message="This production doesn't exist." />;
  const { production, live, versions, devTools } = data;
  const script = live.script;
  const lines = new Map<string, number>();
  for (const u of script.units) if (u.kind === 'dialogue' && u.characterId) lines.set(u.characterId, (lines.get(u.characterId) ?? 0) + 1);
  const characters = [...script.characters].sort((a, b) => Number(!lines.get(a.id)) - Number(!lines.get(b.id)));
  const keyAllowed = live.importedFrom.names.length === 1 && live.importedFrom.kind !== 'dasma';

  const saveTitle = async (value: string) => {
    const t = value.trim();
    if (!t || t === production.title) return;
    await repo.updateProduction(id, { title: t });
    await load();
  };
  const saveActors = async (characterId: string, value: string) => {
    const names = value.split(',').map((s) => s.trim()).filter(Boolean);
    const cast = { ...production.cast };
    if (names.length) cast[characterId] = names;
    else delete cast[characterId];
    await repo.updateProduction(id, { cast });
    await load();
  };
  const exportDasma = () => {
    const cast = Object.fromEntries(Object.entries(production.cast).filter(([, names]) => names.length > 0));
    const text = writeDasma({ ...script, title: production.title }, includeCast && Object.keys(cast).length ? { cast } : {});
    download(`${safeFileName(production.title)}${DASMA_EXTENSION}`, text, DASMA_MIME);
    setExporting(false);
    setIncludeCast(false);
  };
  const exportAnswerKey = () =>
    download(`${stem(live.importedFrom.names[0])}.truth.json`, `${JSON.stringify(toAnswerKey(script, live.pages), null, 2)}\n`, 'application/json');
  const remove = async () => {
    await repo.deleteProduction(id);
    navigate({ name: 'library' });
  };

  return (
    <main className="page">
      <p>
        <a href={href({ name: 'library' })}>← Productions</a>
      </p>
      <h1>
        <input
          aria-label="Production title"
          className="title-input"
          defaultValue={production.title}
          onBlur={(e) => void saveTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </h1>

      <section>
        <h2>Script</h2>
        <p>
          Version {live.version} · {script.units.length} units · {checkQueue(script).length} to check · Edited {new Date(production.updatedAt).toLocaleString()}
        </p>
        <p className="tabs">
          <a className="btn btn-primary" href={href({ name: 'fix', id })}>
            Fix tags
          </a>
          <a className="btn" href={href({ name: 'import', id })}>
            Re-import
          </a>
          <Button onClick={() => setExporting(true)}>Export .dasma</Button>
        </p>
        {exporting && (
          <div className="banner">
            <label>
              <input type="checkbox" checked={includeCast} onChange={(e) => setIncludeCast(e.target.checked)} /> Include cast list
            </label>{' '}
            <Button variant="primary" onClick={exportDasma}>
              Download
            </Button>{' '}
            <Button onClick={() => setExporting(false)}>Cancel</Button>
          </div>
        )}
      </section>

      <section>
        <h2>Cast list</h2>
        <table className="grid">
          <thead>
            <tr>
              <th>Character</th>
              <th>Aliases</th>
              <th>Actors (separate with commas)</th>
            </tr>
          </thead>
          <tbody>
            {characters.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {!lines.get(c.id) && <span className="muted"> (no lines)</span>}
                </td>
                <td>
                  {c.aliases.map((a) => (
                    <span key={a} className="chip">
                      {a}
                    </span>
                  ))}
                </td>
                <td>
                  <input
                    aria-label={`Actors for ${c.name}`}
                    defaultValue={production.cast[c.id]?.join(', ') ?? ''}
                    onBlur={(e) => void saveActors(c.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Versions</h2>
        <ol reversed>
          {[...versions].reverse().map((v) => (
            <li key={v.id}>
              Version {v.version} · {new Date(v.createdAt).toLocaleString()} · {v.importedFrom.names.join(', ')}
            </li>
          ))}
        </ol>
      </section>

      {devTools && (
        <section>
          <h2>Developer tools</h2>
          <Button disabled={!keyAllowed} onClick={exportAnswerKey}>
            Export answer key
          </Button>
          <p className="muted">
            {keyAllowed
              ? `Contains the script's text. Save it in harness/local/ next to ${live.importedFrom.names[0]}; never commit it.`
              : ANSWER_KEY_SINGLE_FILE}
          </p>
        </section>
      )}

      <details>
        <summary>Delete production</summary>
        <p>This deletes the production and every version of its script.</p>
        <label className="field">
          Type the title to confirm
          <input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} />
        </label>
        <Button variant="danger" disabled={confirmTitle !== production.title} onClick={() => void remove()}>
          Delete
        </Button>
      </details>
    </main>
  );
}
