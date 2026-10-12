import { wordSpans, type Script, type Unit } from '@dasma/script';
import { memo, useMemo, type ReactNode } from 'react';
import type { Selection, WordSel } from './actions';

type UnitClick = (unitId: string, shift: boolean) => void;
type WordClick = (unitId: string, word: number, shift: boolean) => void;

function Words({ unit, words, onWordClick }: { unit: Unit; words: WordSel | null; onWordClick?: WordClick }) {
  const out: ReactNode[] = [];
  let at = 0;
  wordSpans(unit.text).forEach(([s, e], k) => {
    if (s > at) out.push(unit.text.slice(at, s));
    const overlap = unit.overlapRanges?.some(([a, b]) => k >= a && k < b);
    const chosen = words && k >= words.from && k < words.to;
    out.push(
      <span
        key={k}
        data-word={k}
        className={`w${overlap ? ' ov' : ''}${chosen ? ' wsel' : ''}`}
        onClick={
          onWordClick
            ? (ev) => {
                ev.stopPropagation();
                onWordClick(unit.id, k, ev.shiftKey);
              }
            : undefined
        }
      >
        {unit.text.slice(s, e)}
      </span>,
    );
    at = e;
  });
  if (at < unit.text.length) out.push(unit.text.slice(at));
  return <>{out}</>;
}

interface UnitViewProps {
  unit: Unit;
  speaker?: string;
  selected: boolean;
  flagged: boolean;
  highlighted: boolean;
  words: WordSel | null;
  onUnitClick: UnitClick;
  onWordClick: WordClick;
}

/** Memoised: an edit re-renders only the units whose objects changed (edits share unchanged units). */
const UnitView = memo(function UnitView({ unit, speaker, selected, flagged, highlighted, words, onUnitClick, onWordClick }: UnitViewProps) {
  const cls = ['unit', `unit-${unit.kind}`, flagged && 'flag', selected && 'sel', unit.cut && 'cut', highlighted && 'hl'].filter(Boolean).join(' ');
  return (
    <div id={`unit-${unit.id}`} role="option" aria-selected={selected} data-kind={unit.kind} className={cls} onClick={(e) => onUnitClick(unit.id, e.shiftKey)}>
      {speaker && <span className="speaker">{speaker}</span>}
      {selected || unit.overlapRanges ? <Words unit={unit} words={selected ? words : null} onWordClick={selected ? onWordClick : undefined} /> : unit.text}
    </div>
  );
});

export function ScriptView(props: {
  script: Script;
  selected: Selection | null;
  words: WordSel | null;
  flagged: ReadonlySet<string>;
  highlight: string | null;
  onUnitClick: UnitClick;
  onWordClick: WordClick;
}) {
  const { script, selected, words, flagged, highlight, onUnitClick, onWordClick } = props;
  const names = useMemo(() => new Map(script.characters.map((c) => [c.id, c.name])), [script.characters]);
  const chosen = useMemo(() => new Set(selected?.unitIds ?? []), [selected]);
  return (
    <div className="script" role="listbox" aria-label="Script" aria-multiselectable="true">
      {script.units.map((u) => (
        <UnitView
          key={u.id}
          unit={u}
          speaker={u.kind === 'dialogue' ? (names.get(u.characterId ?? '') ?? 'no speaker') : undefined}
          selected={chosen.has(u.id)}
          flagged={flagged.has(u.id)}
          highlighted={!!highlight && u.kind === 'dialogue' && u.characterId === highlight}
          words={chosen.has(u.id) && words?.unitId === u.id ? words : null}
          onUnitClick={onUnitClick}
          onWordClick={onWordClick}
        />
      ))}
    </div>
  );
}
