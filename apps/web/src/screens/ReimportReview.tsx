import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductionRow, ScriptVersionRow } from '../db/schema';
import { href, navigate } from '../router';
import { useServices } from '../services';
import { Button } from '../ui/Button';
import { NotFound } from './NotFound';
import { buildReview, type RowType } from './reimport';

const FILTERS: Array<{ id: RowType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'changed', label: 'Changed' },
  { id: 'added', label: 'Added' },
  { id: 'removed', label: 'Removed' },
  { id: 'retagged', label: 'Retagged' },
];

export function ReimportReview({ productionId }: { productionId: string }) {
  const { repo, pending } = useServices();
  const p = pending.get(productionId);
  const [loaded, setLoaded] = useState<{ production: ProductionRow; live: ScriptVersionRow } | 'missing' | null>(null);
  const [filter, setFilter] = useState<RowType | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const versionAdded = useRef(false);

  useEffect(() => {
    let live = true;
    void Promise.all([repo.getProduction(productionId), repo.getLiveVersion(productionId)]).then(([production, version]) => {
      if (live) setLoaded(production && version ? { production, live: version } : 'missing');
    });
    return () => {
      live = false;
    };
  }, [repo, productionId]);

  const review = useMemo(
    () => (p && loaded && loaded !== 'missing' ? buildReview(loaded.live.script, p, Object.keys(loaded.production.cast)) : null),
    [p, loaded],
  );

  if (!p) {
    return (
      <main className="page">
        <p>Nothing to review.</p>
        <p>
          <a href={href({ name: 'production', id: productionId })}>Back to the production</a>
        </p>
      </main>
    );
  }
  if (loaded === 'missing') return <NotFound message="This production doesn't exist." />;
  if (!loaded || !review) return <main className="page">Loading…</main>;

  const { counts } = review;
  const dasma = p.mode === 'dasma';
  const rows = review.rows.filter((r) => filter === 'all' || r.type === filter);

  const keep = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      // Skip the version write on a retry after the cast update failed, so a retry cannot add a duplicate version.
      if (!versionAdded.current) {
        await repo.addVersion(productionId, { script: review.result, pages: p.pages, unitHints: review.unitHints, importedFrom: p.importedFrom, warnings: p.warnings });
        versionAdded.current = true;
      }
      if (dasma && p.cast) await repo.updateProduction(productionId, { cast: p.cast });
      pending.delete(productionId);
      navigate({ name: 'fix', id: productionId });
    } catch (err) {
      setError(`Not saved: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const cancel = () => {
    pending.delete(productionId);
    navigate({ name: 'production', id: productionId });
  };

  return (
    <main className="page">
      <h1>Review the new script</h1>
      <p>
        <strong>
          {counts.changed} lines changed · {counts.added} added · {counts.removed} removed · {counts.unchanged.toLocaleString()} unchanged
          {dasma && ` · ${counts.retagged} lines retagged or re-cut`}
        </strong>
      </p>
      {!dasma && <p>Your fixes are kept on unchanged lines.</p>}
      <div className="tabs">
        {FILTERS.filter((f) => dasma || f.id !== 'retagged').map((f) => (
          <Button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted">No lines of this kind.</p>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Change</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.type}</td>
                <td>{r.oldText ?? ''}</td>
                <td>{r.newText ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <p className="tabs">
        <Button variant="primary" disabled={busy} onClick={() => void keep()}>
          Keep as version {loaded.live.version + 1}
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </p>
    </main>
  );
}
