import { useEffect, useState } from 'react';
import type { ProductionSummary } from '../db/repo';
import { href } from '../router';
import { useServices } from '../services';
import { Button } from '../ui/Button';
import { OpenDasma } from './OpenDasma';

export const STORAGE_WARNING = "Your browser may clear DASMA's data when disk space is low. Export a .dasma file after big changes.";

export function Library() {
  const { repo } = useServices();
  const [items, setItems] = useState<ProductionSummary[] | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [devTools, setDevTools] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [list, persist, dismissed, dev] = await Promise.all([
        repo.listProductions(),
        repo.getMeta<string>('persist'),
        repo.getMeta<boolean>('persistBannerDismissed'),
        repo.getMeta<boolean>('devTools'),
      ]);
      if (!live) return;
      setItems(list);
      setShowBanner(persist === 'denied' && !dismissed);
      setDevTools(!!dev);
    })();
    return () => {
      live = false;
    };
  }, [repo]);

  const dismiss = () => {
    setShowBanner(false);
    void repo.setMeta('persistBannerDismissed', true);
  };
  const toggleDevTools = (on: boolean) => {
    setDevTools(on);
    void repo.setMeta('devTools', on);
  };

  return (
    <main className="page">
      <h1>DASMA</h1>
      {showBanner && (
        <div className="banner" role="status">
          <span>{STORAGE_WARNING}</span> <Button onClick={dismiss}>Dismiss</Button>
        </div>
      )}
      <div className="tabs">
        <a className="btn btn-primary" href={href({ name: 'new' })}>
          New production
        </a>
        <OpenDasma />
      </div>
      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No productions yet. Start a new production from a PDF, Word file or pasted text, or open a .dasma file someone sent you.</p>
      ) : (
        <ul className="cards">
          {items.map(({ production, version, toCheck }) => (
            <li key={production.id}>
              <a href={href({ name: 'production', id: production.id })}>{production.title}</a>
              <span className="muted">Version {version}</span>
              <span className="muted">{toCheck} to check</span>
              <span className="muted">Edited {new Date(production.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <footer className="muted">
        <label>
          <input type="checkbox" checked={devTools} onChange={(e) => toggleDevTools(e.target.checked)} /> Show developer tools
        </label>
      </footer>
    </main>
  );
}
