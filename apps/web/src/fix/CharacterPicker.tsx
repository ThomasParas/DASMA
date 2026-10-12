import type { Script } from '@dasma/script';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { nearbySpeakers } from './actions';

export function CharacterPicker(props: { script: Script; anchorId: string; title: string; onPick(characterId: string): void; onCreate(name: string): void; onClose(): void }) {
  const { script, anchorId, title, onPick, onCreate, onClose } = props;
  const [filter, setFilter] = useState('');
  const [naming, setNaming] = useState<string | null>(null);
  const nearby = useMemo(() => nearbySpeakers(script, anchorId), [script, anchorId]);
  const f = filter.trim().toUpperCase();
  const matches = f
    ? script.characters.filter((c) => [c.name, ...c.aliases].some((n) => n.toUpperCase().includes(f)))
    : [
        ...nearby.map((id) => script.characters.find((c) => c.id === id)!).filter(Boolean),
        ...script.characters.filter((c) => !nearby.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
      ];

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[0]) onPick(matches[0].id);
      else if (filter.trim()) setNaming(filter.trim());
    } else if (!filter && /^[1-9]$/.test(e.key) && nearby[Number(e.key) - 1]) {
      e.preventDefault();
      onPick(nearby[Number(e.key) - 1]);
    }
  };

  return (
    <section className="picker" aria-label={title}>
      <h2>{title}</h2>
      {naming === null ? (
        <>
          <input autoFocus aria-label="Find a character" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={onKeyDown} />
          <ul>
            {matches.map((c) => {
              const n = nearby.indexOf(c.id);
              return (
                <li key={c.id}>
                  <Button shortcut={!f && n >= 0 ? String(n + 1) : undefined} onClick={() => onPick(c.id)}>
                    {c.name}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button onClick={() => setNaming(filter.trim())}>New character…</Button> <Button onClick={onClose}>Cancel</Button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.trim()) onCreate(naming.trim());
          }}
        >
          <label className="field">
            Name of the new character
            <input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
            />
          </label>
          <Button type="submit" variant="primary">
            Create
          </Button>{' '}
          <Button onClick={onClose}>Cancel</Button>
        </form>
      )}
    </section>
  );
}
