import { carryOver, diffScripts, pruneCharacters, type Script, type Unit, type UnitHint } from '@dasma/script';
import type { PendingImport } from '../services';

export type RowType = 'changed' | 'added' | 'removed' | 'retagged';

export interface ReviewRow {
  type: RowType;
  oldText?: string;
  newText?: string;
  /** Position in the new script; removed rows sit after the unit that preceded them. */
  order: number;
}

export interface Review {
  result: Script;
  unitHints: Record<string, UnitHint>;
  counts: Record<RowType | 'unchanged', number>;
  rows: ReviewRow[];
}

export const pagesOf = (script: Script): number => Math.max(1, ...script.units.map((u) => u.source[0]?.page ?? 1));

const sameTags = (a: Unit, b: Unit): boolean =>
  a.kind === b.kind && a.characterId === b.characterId && a.cut === b.cut && JSON.stringify(a.overlapRanges ?? []) === JSON.stringify(b.overlapRanges ?? []);

function tagLabel(u: Unit, script: Script): string {
  const who = u.kind === 'dialogue' ? (script.characters.find((c) => c.id === u.characterId)?.name ?? 'no speaker') : null;
  return `[${u.kind}${who ? ` — ${who}` : ''}${u.cut ? ', cut' : ''}${u.overlapRanges ? ', overlap' : ''}] ${u.text}`;
}

/** Spec §5.5: a file re-import carries fixes over (carryOver); a .dasma update is taken as is. */
export function buildReview(live: Script, pending: PendingImport, castKeys: readonly string[]): Review {
  const next = pending.script;
  const diff = diffScripts(live, next);
  const oldAt = new Map(live.units.map((u, i) => [u.id, { u, i }]));
  const newAt = new Map(next.units.map((u, i) => [u.id, { u, i }]));

  let result: Script;
  let unitHints: Record<string, UnitHint>;
  if (pending.mode === 'dasma') {
    result = next;
    unitHints = pending.unitHints;
  } else {
    result = pruneCharacters(carryOver(live, next, diff), castKeys);
    unitHints = {};
    // carryOver keeps next's unit order, so units line up by index.
    next.units.forEach((u, i) => {
      const hint = pending.unitHints[u.id];
      if (hint) unitHints[result.units[i].id] = hint;
    });
  }

  const oldToNew = new Map<number, number>();
  for (const p of [...diff.unchanged, ...diff.changed]) oldToNew.set(oldAt.get(p.oldId)!.i, newAt.get(p.newId)!.i);
  const removedOrder = (i: number): number => {
    for (let j = i - 1; j >= 0; j--) if (oldToNew.has(j)) return oldToNew.get(j)! + 0.5;
    return -0.5;
  };
  const retagged =
    pending.mode === 'dasma'
      ? diff.unchanged
          .filter((p) => !sameTags(oldAt.get(p.oldId)!.u, newAt.get(p.newId)!.u))
          .map((p): ReviewRow => ({ type: 'retagged', oldText: tagLabel(oldAt.get(p.oldId)!.u, live), newText: tagLabel(newAt.get(p.newId)!.u, next), order: newAt.get(p.newId)!.i }))
      : [];
  const rows: ReviewRow[] = [
    ...diff.changed.map((p): ReviewRow => ({ type: 'changed', oldText: oldAt.get(p.oldId)!.u.text, newText: newAt.get(p.newId)!.u.text, order: newAt.get(p.newId)!.i })),
    ...diff.added.map((id): ReviewRow => ({ type: 'added', newText: newAt.get(id)!.u.text, order: newAt.get(id)!.i })),
    ...diff.removed.map((id): ReviewRow => ({ type: 'removed', oldText: oldAt.get(id)!.u.text, order: removedOrder(oldAt.get(id)!.i) })),
    ...retagged,
  ].sort((a, b) => a.order - b.order);

  return {
    result,
    unitHints,
    counts: { changed: diff.changed.length, added: diff.added.length, removed: diff.removed.length, unchanged: diff.unchanged.length, retagged: retagged.length },
    rows,
  };
}
