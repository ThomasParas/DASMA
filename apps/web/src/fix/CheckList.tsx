import type { CheckItem, CheckReason, Script, UnitKind } from '@dasma/script';
import { useMemo } from 'react';

export const KIND_LABEL: Record<UnitKind, string> = {
  dialogue: 'dialogue',
  direction: 'direction',
  characterName: 'character name',
  heading: 'heading',
  sceneBreak: 'scene break',
  frontMatter: 'front matter',
};

const REASON: Record<Exclude<CheckReason, 'unsure'>, string> = { newCharacter: 'new character?', noSpeaker: 'no speaker', heading: 'heading?' };

export const reasonLabel = (item: CheckItem): string => (item.reason === 'unsure' ? `unsure ${KIND_LABEL[item.kind]}` : REASON[item.reason]);

const preview = (t: string): string => (t.length > 48 ? `${t.slice(0, 47)}…` : t);

export function CheckList({ script, queue, current, onSelect }: { script: Script; queue: CheckItem[]; current: string | null; onSelect(unitId: string): void }) {
  const text = useMemo(() => new Map(script.units.map((u) => [u.id, u.text])), [script.units]);
  return (
    <section aria-label="To check">
      <h2>To check ({queue.length})</h2>
      {queue.length === 0 ? (
        <p className="muted">Nothing left to check.</p>
      ) : (
        queue.map((q) => (
          <button key={q.unitId} type="button" className="qitem" aria-current={q.unitId === current} onClick={() => onSelect(q.unitId)}>
            <span className="reason">{reasonLabel(q)}</span>
            {preview(text.get(q.unitId) ?? '')}
          </button>
        ))
      )}
    </section>
  );
}
