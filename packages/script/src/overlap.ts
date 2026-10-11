import { tokenize } from '@dasma/align';
import type { Unit } from './types';

/** A "/" standing alone or at a word edge marks where the next speaker comes in; "and/or" does not. */
const OVERLAP_MARK = /(?:^|\s)\/|\/(?=\s|$)/;

/** Spec §5.4: removes the first overlap "/" from each dialogue unit and records the overlap word ranges. */
export function applyOverlapMarks(units: Unit[]): Unit[] {
  const out = units.map((u) => ({ ...u, ...(u.overlapRanges ? { overlapRanges: [...u.overlapRanges] } : {}) }));
  for (let i = 0; i < out.length; i++) {
    const u = out[i];
    if (u.kind !== 'dialogue') continue;
    const m = OVERLAP_MARK.exec(u.text);
    if (!m) continue;
    const slash = m.index + m[0].indexOf('/');
    const before = u.text.slice(0, slash).trimEnd();
    const after = u.text.slice(slash + 1).trimStart();
    u.text = after ? `${before} ${after}` : before;
    const start = tokenize(before).length;
    const total = tokenize(u.text).length;
    if (total > start) u.overlapRanges = [...(u.overlapRanges ?? []), [start, total]];
    const next = out.slice(i + 1).find((x) => x.kind === 'dialogue');
    if (!next) continue;
    const k = Math.min(Math.max(1, total - start), tokenize(next.text).length);
    if (k > 0) next.overlapRanges = [[0, k], ...(next.overlapRanges ?? [])];
  }
  return out;
}
