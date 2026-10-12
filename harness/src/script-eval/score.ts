import { normalizeToken, tokenize } from '@dasma/align';
import { FLAG_BELOW, normalizeCueToken, toAlignLines, type Character, type Script } from '@dasma/script';
import { diffArrays } from 'diff';
import type { TruthFile } from '../corpus/types';

export type FixKind = 'missedSpeech' | 'inventedSpeech' | 'wrongSpeaker' | 'missedHeading' | 'inventedHeading' | 'split' | 'merge';

export interface Fix {
  kind: FixKind;
  page: number;
  /** The owner (the predicted unit the user would click) is flagged. */
  flagged: boolean;
  truthUnit?: number;
  predictedUnit?: number;
}

export interface DocScore {
  docId: string;
  family: string;
  pages: number;
  fixes: Fix[];
  fixesByPage: number[];
  spokenUnits: number;
  speakerRight: number;
  falseFlags: number;
  spokenWords: number;
  textErrors: number;
}

export function words(text: string): string[] {
  const raw = tokenize(text);
  return raw.flatMap((t, i) => normalizeToken(t, raw[i + 1]));
}

/** Pairs [aIndex, bIndex] of words an order-preserving diff keeps in common. */
export function alignWords(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  for (const part of diffArrays([...a], [...b])) {
    const n = part.count ?? part.value.length;
    if (part.added) j += n;
    else if (part.removed) i += n;
    else {
      for (let k = 0; k < n; k++) pairs.push([i + k, j + k]);
      i += n;
      j += n;
    }
  }
  return pairs;
}

/** Spec §6.4 text accuracy: each run of differences counts max(words removed, words added). */
export function wordErrors(a: readonly string[], b: readonly string[]): number {
  let errors = 0;
  let removed = 0;
  let added = 0;
  for (const part of diffArrays([...a], [...b])) {
    const n = part.count ?? part.value.length;
    if (part.added) added += n;
    else if (part.removed) removed += n;
    else {
      errors += Math.max(removed, added);
      removed = 0;
      added = 0;
    }
  }
  return errors + Math.max(removed, added);
}

/** Predicted character id → truth character id, by name or alias. */
export function resolveCast(predicted: readonly Character[], truth: readonly Character[]): Map<string, string> {
  const byForm = new Map<string, string>();
  for (const c of truth) for (const f of [c.name, ...c.aliases]) byForm.set(normalizeCueToken(f), c.id);
  const out = new Map<string, string>();
  for (const c of predicted) {
    const id = [c.name, ...c.aliases].map((f) => byForm.get(normalizeCueToken(f))).find((x) => x !== undefined);
    if (id) out.set(c.id, id);
  }
  return out;
}

interface Stream {
  words: string[];
  unit: number[];
}
function stream(units: ReadonlyArray<{ text: string }>): Stream {
  const s: Stream = { words: [], unit: [] };
  units.forEach((u, i) => {
    for (const w of words(u.text)) {
      s.words.push(w);
      s.unit.push(i);
    }
  });
  return s;
}
const inc = (m: Map<number, number>, k: number): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};
/** A unit counts toward a split or merge with at least 2 aligned words, or 1 when it has at most 2 words. */
const enough = (count: number, size: number): boolean => count >= (size <= 2 ? 1 : 2);
function sumWhere(m: Map<number, number>, keep: (k: number) => boolean): number {
  let s = 0;
  for (const [k, c] of m) if (keep(k)) s += c;
  return s;
}
function mainOf(m: Map<number, number>, keep: (k: number) => boolean): number | undefined {
  let best: number | undefined;
  let bestCount = 0;
  for (const [k, c] of m) if (keep(k) && (c > bestCount || (c === bestCount && best !== undefined && k < best))) [best, bestCount] = [k, c];
  return best;
}

/** Spec §6.4: fixes, speaker accuracy, flags and text accuracy for one document. */
export function scoreDocument(truth: TruthFile, script: Script): DocScore {
  const T = truth.units;
  const P = script.units;
  const ts = stream(T);
  const ps = stream(P);
  const land = T.map(() => new Map<number, number>());
  const from = P.map(() => new Map<number, number>());
  for (const [a, b] of alignWords(ts.words, ps.words)) {
    inc(land[ts.unit[a]], ps.unit[b]);
    inc(from[ps.unit[b]], ts.unit[a]);
  }
  const tSize = T.map(() => 0);
  for (const k of ts.unit) tSize[k]++;
  const pSize = P.map(() => 0);
  for (const k of ps.unit) pSize[k]++;
  const spokenT = (k: number) => T[k].kind === 'dialogue';
  const spokenP = (k: number) => P[k].kind === 'dialogue';
  const headingT = (k: number) => T[k].kind === 'heading';
  const headingP = (k: number) => P[k].kind === 'heading';
  const any = () => true;
  const castMap = resolveCast(script.characters, truth.cast);

  const fixes: Fix[] = [];
  const owners = new Set<number>();
  const add = (kind: FixKind, owner: number | undefined, truthUnit?: number): void => {
    if (owner !== undefined) owners.add(owner);
    const page = owner !== undefined ? (P[owner].source[0]?.page ?? 1) : truthUnit !== undefined ? T[truthUnit].page : 1;
    fixes.push({
      kind,
      page,
      flagged: owner !== undefined && P[owner].tagConfidence < FLAG_BELOW,
      ...(truthUnit !== undefined ? { truthUnit } : {}),
      ...(owner !== undefined ? { predictedUnit: owner } : {}),
    });
  };

  let spokenUnits = 0;
  let speakerRight = 0;
  T.forEach((t, k) => {
    const n = tSize[k];
    if (n === 0) return;
    if (t.kind === 'dialogue') {
      spokenUnits++;
      if (sumWhere(land[k], spokenP) < n / 2) {
        add('missedSpeech', mainOf(land[k], any), k);
        return;
      }
      const m = mainOf(land[k], spokenP)!;
      const predicted = P[m].characterId;
      if (predicted !== undefined && castMap.get(predicted) === t.characterId) speakerRight++;
      else add('wrongSpeaker', m, k);
      const parts = [...land[k]]
        .filter(([p, c]) => spokenP(p) && enough(c, pSize[p]))
        .map(([p]) => p)
        .sort((a, b) => a - b);
      for (const p of parts.slice(1)) add('merge', p, k);
    } else if (t.kind === 'heading' && sumWhere(land[k], headingP) < n / 2) {
      add('missedHeading', mainOf(land[k], any), k);
    }
  });
  P.forEach((p, k) => {
    const n = pSize[k];
    if (n === 0) return;
    if (p.kind === 'dialogue') {
      if (sumWhere(from[k], spokenT) < n / 2) {
        add('inventedSpeech', k);
        return;
      }
      const parts = [...from[k]].filter(([t, c]) => spokenT(t) && enough(c, tSize[t])).length;
      for (let i = 1; i < parts; i++) add('split', k);
    } else if (p.kind === 'heading' && sumWhere(from[k], headingT) < n / 2) {
      add('inventedHeading', k);
    }
  });

  const pages = Math.max(1, truth.pages);
  const fixesByPage = new Array<number>(pages).fill(0);
  for (const f of fixes) fixesByPage[Math.min(pages, Math.max(1, f.page)) - 1]++;
  const falseFlags = P.filter((u, k) => u.tagConfidence < FLAG_BELOW && !owners.has(k)).length;
  const truthSpoken = T.filter((u) => u.kind === 'dialogue').flatMap((u) => words(u.text));
  const predSpoken = toAlignLines(script)
    .filter((l) => !l.cut)
    .flatMap((l) => words(l.text));
  return {
    docId: truth.docId,
    family: truth.family,
    pages,
    fixes,
    fixesByPage,
    spokenUnits,
    speakerRight,
    falseFlags,
    spokenWords: truthSpoken.length,
    textErrors: wordErrors(truthSpoken, predSpoken),
  };
}
