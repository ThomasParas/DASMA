import { tokenize } from '@dasma/align';
import type { Unit } from './types';

/** A "/" standing alone or at a word edge marks where the next speaker comes in; "and/or" does not. */
const OVERLAP_MARK = /(?:^|\s)\/|\/(?=\s|$)/;

const OVERLAP_MARKS = new RegExp(OVERLAP_MARK.source, 'g');

/** Sorts ranges and merges those that overlap or touch, so they are strictly increasing. */
function normalise(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = ranges.map((r): [number, number] => [r[0], r[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

/**
 * Spec §5.4: removes every overlap "/" from each dialogue unit (the first one marks where the overlap starts)
 * and records the overlap word ranges, sorted and non-overlapping.
 */
export function applyOverlapMarks(units: Unit[]): Unit[] {
  const out = units.map((u) => ({ ...u, ...(u.overlapRanges ? { overlapRanges: [...u.overlapRanges] } : {}) }));
  // Pass 1: strip the slashes, remembering the word index where each unit's first one stood.
  const starts = new Map<number, number>();
  out.forEach((u, i) => {
    if (u.kind !== 'dialogue') return;
    const m = OVERLAP_MARK.exec(u.text);
    if (!m) return;
    const slash = m.index + m[0].indexOf('/');
    starts.set(i, tokenize(u.text.slice(0, slash).trimEnd()).length);
    u.text = u.text
      .replace(OVERLAP_MARKS, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .trim();
  });
  // Pass 2: ranges, now that every unit's word count is slash-free.
  const added = new Map<number, Array<[number, number]>>();
  const add = (i: number, r: [number, number]): void => {
    added.set(i, [...(added.get(i) ?? []), r]);
  };
  for (const [i, start] of starts) {
    const total = tokenize(out[i].text).length;
    if (total > start) add(i, [start, total]);
    const n = out.findIndex((x, j) => j > i && x.kind === 'dialogue');
    if (n < 0) continue;
    const k = Math.min(Math.max(1, total - start), tokenize(out[n].text).length);
    if (k > 0) add(n, [0, k]);
  }
  for (const [i, ranges] of added) out[i].overlapRanges = normalise([...(out[i].overlapRanges ?? []), ...ranges]);
  return out;
}
