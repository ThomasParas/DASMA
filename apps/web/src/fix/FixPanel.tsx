import type { Script } from '@dasma/script';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import type { FixAction, Selection, WordSel } from './actions';
import { KIND_LABEL } from './CheckList';

const renderAction = (a: FixAction) => (
  <Button key={a.id} shortcut={a.keys[0]} disabled={!a.enabled} onClick={a.run}>
    {a.label}
  </Button>
);

export function FixPanel(props: {
  script: Script;
  sel: Selection | null;
  words: WordSel | null;
  message: string | null;
  actions: FixAction[];
  similarCount: number;
  similar: boolean;
  onSimilar(on: boolean): void;
  children?: ReactNode;
}) {
  const { script, sel, words, message, actions, similarCount, similar, onSimilar, children } = props;
  const unit = sel && sel.unitIds.length === 1 ? script.units.find((u) => u.id === sel.anchor) : undefined;
  const speaker = unit?.kind === 'dialogue' ? (script.characters.find((c) => c.id === unit.characterId)?.name ?? 'no speaker') : null;
  const describe = !sel
    ? 'Select a unit in the script.'
    : unit
      ? `${KIND_LABEL[unit.kind]}${speaker ? ` — ${speaker}` : ''}${unit.cut ? ' (cut)' : ''}`
      : `${sel.unitIds.length} units selected`;
  const group = (g: FixAction['group']) => actions.filter((a) => a.group === g).map(renderAction);
  return (
    <aside className="fix-right panel" aria-label="Fix">
      <h2>Selected</h2>
      <p>{describe}</p>
      {words && (
        <p className="muted">
          Words {words.from + 1}–{words.to} selected
        </p>
      )}
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {children}
      <h2>Tag</h2>
      <div className="buttons">{group('tag')}</div>
      {similarCount > 0 && (
        <label>
          <input type="checkbox" checked={similar} onChange={(e) => onSimilar(e.target.checked)} /> Also apply to the {similarCount} other lines like this
        </label>
      )}
      <h2>Edit</h2>
      <div className="buttons">{group('edit')}</div>
      <h2>Move</h2>
      <div className="buttons">{group('nav')}</div>
      <div className="buttons">{group('help')}</div>
    </aside>
  );
}
