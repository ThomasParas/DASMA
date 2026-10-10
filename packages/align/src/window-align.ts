import { MATCH_THRESHOLD, wordScore } from './phonetic';
import type { ExpectedWord, HeardToken } from './types';

export type Op =
  | { kind: 'match'; h: number; e: number; score: number }
  | { kind: 'sub'; h: number; e: number; score: number }
  | { kind: 'ins'; h: number }
  | { kind: 'del'; e: number };

export const hasE = (op: Op): op is Extract<Op, { e: number }> => op.kind !== 'ins';
export const hasH = (op: Op): op is Extract<Op, { h: number }> => op.kind !== 'del';
export const isMatch = (op: Op): op is Extract<Op, { kind: 'match' }> => op.kind === 'match';

export interface AlignParams {
  matchThreshold: number;
  subBase: number;
  subSimilarityWeight: number;
  /** Tie-break only: an exact match beats an equally-placed sound-alike match. */
  matchSimilarityWeight: number;
  insCost: number;
  delCost: number;
}

export const DEFAULT_ALIGN_PARAMS: AlignParams = {
  matchThreshold: MATCH_THRESHOLD,
  subBase: -0.6,
  subSimilarityWeight: 0.4,
  matchSimilarityWeight: 0.01,
  insCost: -0.7,
  delCost: -0.5,
};

const DIAG = 1;
const LEFT = 2; // deletion: consume an expected word
const UP = 3; // insertion: consume a heard word

export function alignWindow(
  heard: HeardToken[],
  window: ExpectedWord[],
  opts: { global?: boolean; params?: AlignParams } = {},
): Op[] {
  const p = opts.params ?? DEFAULT_ALIGN_PARAMS;
  const n = heard.length;
  const m = window.length;
  if (n === 0) return opts.global ? window.map((_, e) => ({ kind: 'del' as const, e })) : [];
  const W = m + 1;
  const score = new Float64Array((n + 1) * W);
  const pair = new Float64Array((n + 1) * W);
  const back = new Uint8Array((n + 1) * W);
  for (let j = 1; j <= m; j++) {
    score[j] = j * p.delCost;
    back[j] = LEFT;
  }
  for (let i = 1; i <= n; i++) {
    score[i * W] = i * p.insCost;
    back[i * W] = UP;
    for (let j = 1; j <= m; j++) {
      const s = wordScore(heard[i - 1]!, window[j - 1]!);
      pair[i * W + j] = s;
      const diag = score[(i - 1) * W + j - 1]! + (s >= p.matchThreshold ? 1 + p.matchSimilarityWeight * s : p.subBase + p.subSimilarityWeight * s);
      const del = score[i * W + j - 1]! + p.delCost;
      const ins = score[(i - 1) * W + j]! + p.insCost;
      let best = diag;
      let b = DIAG;
      if (del > best) {
        best = del;
        b = LEFT;
      }
      if (ins > best) {
        best = ins;
        b = UP;
      }
      score[i * W + j] = best;
      back[i * W + j] = b;
    }
  }
  let endJ = m;
  if (!opts.global) {
    endJ = 0;
    for (let j = 1; j <= m; j++) if (score[n * W + j]! > score[n * W + endJ]!) endJ = j;
  }
  const ops: Op[] = [];
  let i = n;
  let j = endJ;
  while (i > 0 || j > 0) {
    const b = back[i * W + j];
    if (b === DIAG) {
      const s = pair[i * W + j]!;
      ops.push(
        s >= p.matchThreshold
          ? { kind: 'match', h: i - 1, e: j - 1, score: s }
          : { kind: 'sub', h: i - 1, e: j - 1, score: s },
      );
      i--;
      j--;
    } else if (b === LEFT) {
      ops.push({ kind: 'del', e: j - 1 });
      j--;
    } else {
      ops.push({ kind: 'ins', h: i - 1 });
      i--;
    }
  }
  return ops.reverse();
}
