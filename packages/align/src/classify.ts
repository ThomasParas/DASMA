import { displayExpected, displayHeard } from './expected';
import { FUNCTION_WORDS, expandContraction, isContraction } from './normalize';
import { MATCH_THRESHOLD, wordScore } from './phonetic';
import type { Category, ExpectedWord, HeardToken, NoteDraft, Strictness } from './types';
import { hasE, hasH, isMatch, type Op } from './window-align';

export interface ClassifyContext {
  expected: ExpectedWord[];
  heard: HeardToken[];
  /** Up to 3 most recently matched expected words before these ops. */
  recentMatched: ExpectedWord[];
  /** End time of the last committed heard word before these ops (-Infinity if none). */
  lastHeardEndBefore: number;
  strictness: Strictness;
  audioQuality: number;
  /** Checked-zone word count per line (for whole-line detection). */
  lineWordCount: Map<string, number>;
  noteMin: number;
  at: number;
  /** Whether anything in this run has matched yet (insertions before the first match are pre-roll talk). */
  started: boolean;
}

export interface Classified {
  notes: NoteDraft[];
  stumbles: Array<{ idx: number; heard: string }>;
}

export const BASE_CONFIDENCE: Record<Category, number> = {
  'dropped-line': 0.95,
  'dropped-words': 0.8,
  'added-words': 0.75,
  'wrong-words': 0.85,
  transposed: 0.8,
  paraphrase: 0.85,
  'jumped-cue': 0.7,
  'called-for-line': 0.9,
};

export const WORD_LEVEL_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'wrong-words',
  'dropped-words',
  'added-words',
  'transposed',
]);

export const CONTRACTION_CAP = 0.45;
const JUMP_GAP_SEC = 1.5;
const STUMBLE_PAUSE_SEC = 0.25;
const SIMILAR_SUB_SCORE = 0.3;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function makeNote(
  category: Category,
  words: ExpectedWord[],
  heard: HeardToken[],
  ctx: { audioQuality: number; noteMin: number; at: number },
  owner: { lineId: string; characterId: string },
  opts: { factor?: number; cap?: number } = {},
): NoteDraft {
  let c = BASE_CONFIDENCE[category] * (opts.factor ?? 1);
  if (heard.length) c *= heard.reduce((s, t) => s + t.confidence, 0) / heard.length;
  const norms = [...words.map((w) => w.norm), ...heard.map((t) => t.norm)];
  if (norms.length && norms.every((n) => FUNCTION_WORDS.has(n))) c *= 0.5;
  const confidence = round3(Math.min(opts.cap ?? 1, Math.max(0, c * ctx.audioQuality)));
  return {
    lineId: owner.lineId,
    characterId: owner.characterId,
    category,
    expected: displayExpected(words),
    heard: displayHeard(heard),
    confidence,
    status: confidence >= ctx.noteMin ? 'note' : 'check',
    at: ctx.at,
  };
}

function groupBy<T>(items: T[], key: (t: T) => string): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && key(last[0]!) === key(item)) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

export function classifyOps(ops: Op[], ctx: ClassifyContext): Classified {
  const notes: NoteDraft[] = [];
  const stumbles: Array<{ idx: number; heard: string }> = [];
  const consumed = new Set<number>();
  const E = (i: number) => ctx.expected[i]!;
  const H = (i: number) => ctx.heard[i]!;
  const lenient = ctx.strictness.mode === 'lenient';

  const add = (
    category: Category,
    words: ExpectedWord[],
    heard: HeardToken[],
    owner: { lineId: string; characterId: string },
    opts: { factor?: number; cap?: number } = {},
  ) => {
    if (lenient && WORD_LEVEL_CATEGORIES.has(category)) {
      const norms = [...words.map((w) => w.norm), ...heard.map((t) => t.norm)];
      if (norms.length && norms.every((n) => FUNCTION_WORDS.has(n))) return;
    }
    notes.push(makeNote(category, words, heard, ctx, owner, opts));
  };

  // 1. Contraction differences ("I'm" vs "I am") — word-perfect only; lenient already expanded both sides.
  if (!lenient) {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (consumed.has(i) || (op.kind !== 'match' && op.kind !== 'sub')) continue;
      const e = E(op.e);
      const h = H(op.h);
      if (e.zone === 'overlap' || e.norm === h.norm) continue;
      const prev = ops[i - 1];
      const next = ops[i + 1];
      const free = (k: number) => !consumed.has(k);
      let pair: { other: number; words: ExpectedWord[]; heard: HeardToken[] } | undefined;
      if (isContraction(e.norm)) {
        const target = expandContraction(e.norm).join(' ');
        if (prev?.kind === 'ins' && free(i - 1) && `${H(prev.h).norm} ${h.norm}` === target) {
          pair = { other: i - 1, words: [e], heard: [H(prev.h), h] };
        } else if (next?.kind === 'ins' && free(i + 1) && `${h.norm} ${H(next.h).norm}` === target) {
          pair = { other: i + 1, words: [e], heard: [h, H(next.h)] };
        }
      }
      if (!pair && isContraction(h.norm)) {
        const target = expandContraction(h.norm).join(' ');
        if (prev?.kind === 'del' && free(i - 1) && `${E(prev.e).norm} ${e.norm}` === target) {
          pair = { other: i - 1, words: [E(prev.e), e], heard: [h] };
        } else if (next?.kind === 'del' && free(i + 1) && `${e.norm} ${E(next.e).norm}` === target) {
          pair = { other: i + 1, words: [e, E(next.e)], heard: [h] };
        }
      }
      if (pair) {
        consumed.add(i);
        consumed.add(pair.other);
        add('wrong-words', pair.words, pair.heard, e, { cap: CONTRACTION_CAP });
      }
    }
  }

  // 2. Transpositions: a skipped word that reappears as an extra word nearby, or two swapped substitutions.
  for (let a = 0; a < ops.length; a++) {
    const da = ops[a]!;
    if (consumed.has(a) || da.kind !== 'del' || E(da.e).zone === 'overlap') continue;
    for (let b = Math.max(0, a - 4); b <= Math.min(ops.length - 1, a + 4); b++) {
      const ib = ops[b]!;
      if (b === a || consumed.has(b) || ib.kind !== 'ins') continue;
      if (wordScore(H(ib.h), E(da.e)) < MATCH_THRESHOLD) continue;
      const span = ops.slice(Math.min(a, b), Math.max(a, b) + 1);
      consumed.add(a);
      consumed.add(b);
      add('transposed', span.filter(hasE).map((o) => E(o.e)), span.filter(hasH).map((o) => H(o.h)), E(da.e));
      break;
    }
  }
  for (let a = 0; a + 1 < ops.length; a++) {
    const x = ops[a]!;
    const y = ops[a + 1]!;
    if (x.kind !== 'sub' || y.kind !== 'sub' || consumed.has(a) || consumed.has(a + 1)) continue;
    if (wordScore(H(x.h), E(y.e)) >= MATCH_THRESHOLD && wordScore(H(y.h), E(x.e)) >= MATCH_THRESHOLD) {
      consumed.add(a);
      consumed.add(a + 1);
      add('transposed', [E(x.e), E(y.e)], [H(x.h), H(y.h)], E(x.e));
    }
  }

  // 3. Insertion runs: pre-roll talk, stumbles (repetition / fragment / pause-and-correct), or added words.
  for (let i = 0; i < ops.length; ) {
    if (ops[i]!.kind !== 'ins' || consumed.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && ops[j]!.kind === 'ins' && !consumed.has(j)) j++;
    for (let k = i; k < j; k++) consumed.add(k);
    const toks = ops.slice(i, j).filter(hasH).map((o) => H(o.h));
    const before = ops.slice(0, i);
    const after = ops.slice(j);
    const nextOp = ops[j];
    const nextMatch = nextOp && isMatch(nextOp) ? nextOp : undefined;
    const prevE = [...before].reverse().find(hasE);
    const nextE = after.find(hasE);
    const preRoll = !ctx.started && !before.some(isMatch);
    const nearOverlap =
      (prevE !== undefined && E(prevE.e).zone === 'overlap') || (nextE !== undefined && E(nextE.e).zone === 'overlap');
    const prevNorms = [...ctx.recentMatched.map((w) => w.norm), ...before.filter(isMatch).map((o) => E(o.e).norm)].slice(-3);
    const nextNorms = after.filter(isMatch).slice(0, 3).map((o) => E(o.e).norm);
    const repetition = toks.every((t) => prevNorms.includes(t.norm) || nextNorms.includes(t.norm));
    // Pre-roll talk is ignored, but repeating the opening words is still a stumble.
    if (nearOverlap || (preRoll && !repetition)) {
      i = j;
      continue;
    }
    const first = toks[0]!;
    const fragment =
      toks.length === 1 &&
      nextMatch !== undefined &&
      first.phon[0].length > 0 &&
      first.norm.length < E(nextMatch.e).norm.length &&
      E(nextMatch.e).phon[0].startsWith(first.phon[0]);
    const seq = nextMatch ? [...toks, H(nextMatch.h)] : toks;
    const paused = nextMatch !== undefined && seq.some((t, k) => k > 0 && t.start - seq[k - 1]!.end >= STUMBLE_PAUSE_SEC);
    if (repetition || fragment || paused) {
      const idx = nextMatch?.e ?? prevE?.e ?? ctx.recentMatched.at(-1)?.idx ?? 0;
      stumbles.push({ idx, heard: displayHeard(toks) });
    } else {
      const owner = prevE ? E(prevE.e) : (ctx.recentMatched.at(-1) ?? (nextE ? E(nextE.e) : undefined));
      if (owner) add('added-words', [], toks, owner, { factor: toks.length >= 4 ? 0.5 : 1 });
    }
    i = j;
  }

  // 4. Remaining blocks of substitutions and skips.
  const classifyBlock = (i: number, j: number): void => {
    const block = ops.slice(i, j);
    const subs = block
      .filter((o): o is Extract<Op, { kind: 'sub' }> => o.kind === 'sub')
      .filter((o) => E(o.e).zone === 'checked');
    for (const group of groupBy(subs, (o) => E(o.e).lineId)) {
      const similar = group.some((o) => o.score >= SIMILAR_SUB_SCORE);
      add('wrong-words', group.map((o) => E(o.e)), group.map((o) => H(o.h)), E(group[0]!.e), { factor: similar ? 0.6 : 1 });
    }
    const dels = block
      .filter((o): o is Extract<Op, { kind: 'del' }> => o.kind === 'del')
      .map((o) => E(o.e))
      .filter((w) => w.zone === 'checked');
    const whole: ExpectedWord[][] = [];
    for (const words of groupBy(dels, (w) => w.lineId)) {
      if (words.length === ctx.lineWordCount.get(words[0]!.lineId)) whole.push(words);
      else add('dropped-words', words, [], words[0]!);
    }
    if (!whole.length) return;
    const nextMatch = ops.slice(j).find(isMatch);
    const prevH = ops.slice(0, i).reverse().find(hasH);
    const prevEnd = prevH ? H(prevH.h).end : ctx.lastHeardEndBefore;
    const gap = nextMatch ? H(nextMatch.h).start - prevEnd : Infinity;
    const nextWord = nextMatch ? E(nextMatch.e) : undefined;
    const others = whole.filter((ws) => ws[0]!.characterId !== nextWord?.characterId);
    if (nextWord && gap < JUMP_GAP_SEC && others.length) {
      add('jumped-cue', others.flat(), [], nextWord);
      for (const ws of whole) if (ws[0]!.characterId === nextWord.characterId) add('dropped-line', ws, [], ws[0]!);
    } else {
      for (const ws of whole) add('dropped-line', ws, [], ws[0]!);
    }
  };

  for (let i = 0; i < ops.length; ) {
    const op = ops[i]!;
    if (consumed.has(i) || (op.kind !== 'del' && op.kind !== 'sub')) {
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && !consumed.has(j) && (ops[j]!.kind === 'del' || ops[j]!.kind === 'sub')) j++;
    classifyBlock(i, j);
    i = j;
  }

  return { notes, stumbles };
}
