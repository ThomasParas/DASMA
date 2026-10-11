import { normalizeToken, tokenize } from '@dasma/align';
import type { Script, Unit } from './types';
import { FLAG_BELOW } from './weights';

/** Two units are the same unit (possibly changed) at or above this token-set similarity (spec §8.2). */
export const SAME_UNIT_SIMILARITY = 0.6;

export interface ScriptDiff {
  unchanged: Array<{ oldId: string; newId: string }>;
  changed: Array<{ oldId: string; newId: string; similarity: number }>;
  added: string[];
  removed: string[];
}

function normWords(text: string): string[] {
  const raw = tokenize(text);
  return raw.flatMap((t, i) => normalizeToken(t, raw[i + 1]));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function similarity(a: string, b: string): number {
  return jaccard(new Set(normWords(a)), new Set(normWords(b)));
}

const spoken = (u: Unit): boolean => u.kind === 'dialogue';

/** Order-preserving best match (Needleman–Wunsch, gap cost 0, a match scores its similarity). */
export function diffScripts(old: Script, next: Script): ScriptDiff {
  const a = old.units;
  const b = next.units;
  const aw = a.map((u) => normWords(u.text));
  const bw = b.map((u) => normWords(u.text));
  const as = aw.map((w) => new Set(w));
  const bs = bw.map((w) => new Set(w));
  const sim = (i: number, j: number): number => {
    if (spoken(a[i]) !== spoken(b[j])) return -1;
    if (aw[i].length === 0 && bw[j].length === 0) return a[i].text.trim() === b[j].text.trim() ? 1 : -1;
    return jaccard(as[i], bs[j]);
  };
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const score = new Float64Array((n + 1) * W);
  const simAt = new Float64Array(n * m);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sim(i - 1, j - 1);
      simAt[(i - 1) * m + (j - 1)] = s;
      let best = Math.max(score[(i - 1) * W + j], score[i * W + j - 1]);
      if (s >= SAME_UNIT_SIMILARITY) best = Math.max(best, score[(i - 1) * W + j - 1] + s);
      score[i * W + j] = best;
    }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = simAt[(i - 1) * m + (j - 1)];
    if (s >= SAME_UNIT_SIMILARITY && score[i * W + j] === score[(i - 1) * W + j - 1] + s) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (score[i * W + j] === score[(i - 1) * W + j]) i--;
    else j--;
  }
  pairs.reverse();
  const matchedA = new Set(pairs.map(([i]) => i));
  const matchedB = new Set(pairs.map(([, j]) => j));
  const diff: ScriptDiff = { unchanged: [], changed: [], added: [], removed: [] };
  for (const [i, j] of pairs) {
    const same = aw[i].join(' ') === bw[j].join(' ') && (aw[i].length > 0 || a[i].text.trim() === b[j].text.trim());
    if (same) diff.unchanged.push({ oldId: a[i].id, newId: b[j].id });
    else diff.changed.push({ oldId: a[i].id, newId: b[j].id, similarity: simAt[i * m + j] });
  }
  diff.added = b.filter((_, j) => !matchedB.has(j)).map((u) => u.id);
  diff.removed = a.filter((_, i) => !matchedA.has(i)).map((u) => u.id);
  return diff;
}

/** Spec §8.2: the new script with old ids for matched units; unchanged units keep the user's tags, changed units keep cut and are flagged. */
export function carryOver(old: Script, next: Script, diff: ScriptDiff): Script {
  const oldById = new Map(old.units.map((u) => [u.id, u]));
  const match = new Map<string, { oldId: string; unchanged: boolean }>();
  for (const p of diff.unchanged) match.set(p.newId, { oldId: p.oldId, unchanged: true });
  for (const p of diff.changed) match.set(p.newId, { oldId: p.oldId, unchanged: false });
  let maxN = 0;
  for (const u of old.units) maxN = Math.max(maxN, Number(/^u(\d+)$/.exec(u.id)?.[1] ?? 0));
  const units = next.units.map((u): Unit => {
    const mt = match.get(u.id);
    if (!mt) return { ...u, id: `u${++maxN}` };
    const prev = oldById.get(mt.oldId)!;
    if (mt.unchanged) {
      const { characterId, overlapRanges, ...rest } = u;
      void characterId;
      void overlapRanges;
      return {
        ...rest,
        id: prev.id,
        kind: prev.kind,
        ...(prev.characterId !== undefined ? { characterId: prev.characterId } : {}),
        cut: prev.cut,
        ...(prev.overlapRanges ? { overlapRanges: prev.overlapRanges } : {}),
        tagConfidence: prev.tagConfidence,
      };
    }
    return { ...u, id: prev.id, cut: prev.cut, tagConfidence: Math.min(u.tagConfidence, FLAG_BELOW - 0.01) };
  });
  const characters = [...old.characters, ...next.characters.filter((c) => !old.characters.some((o) => o.id === c.id))];
  return { title: next.title, characters, units };
}
