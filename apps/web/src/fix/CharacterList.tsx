import { aliasSpeeches, speechCounts, uniqueCharacterId, type Character, type EditOp, type Script, type UnitHint } from '@dasma/script';
import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';

interface RowProps {
  c: Character;
  script: Script;
  hints: Readonly<Record<string, UnitHint>>;
  count: number;
  highlighted: boolean;
  onHighlight(id: string | null): void;
  apply(op: EditOp): boolean;
  onMerged(fromId: string, intoId: string): void;
}

function CharacterRow({ c, script, hints, count, highlighted, onHighlight, apply, onMerged }: RowProps) {
  const [mode, setMode] = useState<'none' | 'rename' | 'aliases' | 'merge'>('none');
  const [value, setValue] = useState('');
  const others = script.characters.filter((x) => x.id !== c.id);
  const [into, setInto] = useState('');
  const close = () => setMode('none');

  return (
    <div className="char-row">
      <Button aria-pressed={highlighted} onClick={() => onHighlight(highlighted ? null : c.id)}>
        {c.name}
      </Button>{' '}
      <span className="muted">
        {count} {count === 1 ? 'speech' : 'speeches'}
      </span>
      <div>
        {c.aliases.map((a) => (
          <span key={a} className="chip">
            {a}
          </span>
        ))}
      </div>
      <div className="buttons">
        <Button
          onClick={() => {
            setMode('rename');
            setValue(c.name);
          }}
        >
          Rename
        </Button>
        <Button
          onClick={() => {
            setMode('aliases');
            setValue(c.aliases.join(', '));
          }}
        >
          Edit aliases
        </Button>
        <Button
          disabled={others.length === 0}
          onClick={() => {
            setMode('merge');
            setInto(others[0]?.id ?? '');
          }}
        >
          Merge into…
        </Button>
        {c.aliases.map((a) => (
          <Button key={a} onClick={() => apply({ type: 'splitAlias', characterId: c.id, alias: a, newId: uniqueCharacterId(script, a), unitIds: aliasSpeeches(script, hints, c.id, a) })}>
            Split out {a}
          </Button>
        ))}
      </div>
      {(mode === 'rename' || mode === 'aliases') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const ok = apply(
              mode === 'rename' ? { type: 'renameCharacter', characterId: c.id, name: value } : { type: 'editAliases', characterId: c.id, aliases: value.split(',') },
            );
            if (ok) close();
          }}
        >
          <input
            autoFocus
            aria-label={mode === 'rename' ? `New name for ${c.name}` : `Aliases for ${c.name}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
          />
          <Button type="submit">Save</Button> <Button onClick={close}>Cancel</Button>
        </form>
      )}
      {mode === 'merge' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (apply({ type: 'mergeCharacters', fromId: c.id, intoId: into })) {
              onMerged(c.id, into);
              close();
            }
          }}
        >
          <select aria-label={`Merge ${c.name} into`} value={into} onChange={(e) => setInto(e.target.value)}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Button type="submit">Merge</Button> <Button onClick={close}>Cancel</Button>
        </form>
      )}
    </div>
  );
}

export function CharacterList(props: {
  script: Script;
  hints: Readonly<Record<string, UnitHint>>;
  highlight: string | null;
  onHighlight(id: string | null): void;
  apply(op: EditOp): boolean;
  onMerged(fromId: string, intoId: string): void;
}) {
  const { script, ...rest } = props;
  const counts = useMemo(() => speechCounts(script), [script]);
  return (
    <section aria-label="Characters">
      <h2>Characters ({script.characters.length})</h2>
      {script.characters.map((c) => (
        <CharacterRow key={c.id} c={c} script={script} count={counts.get(c.id) ?? 0} highlighted={rest.highlight === c.id} {...rest} />
      ))}
    </section>
  );
}
