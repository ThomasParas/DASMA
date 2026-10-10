import { classifyOps } from './classify';
import { commitPoint, commitPointOnTimeout } from './commit';
import { countCheckedWords, displayExpected, toHeardTokens } from './expected';
import { finalizeLine, type LineState } from './finalize-line';
import { MATCH_THRESHOLD, wordScore } from './phonetic';
import { TrigramIndex } from './trigram-index';
import type { AlignEvent, AlignOptions, ExpectedWord, HeardToken, HeardWord, NoteDraft } from './types';
import { alignWindow, hasE, hasH, isMatch, type Op } from './window-align';

export interface Aligner {
  readonly cursor: number;
  push(words: HeardWord[]): void;
  tick(now: number): void;
  finalize(now: number): void;
  jumpTo(idx: number): void;
  pause(): void;
  resume(): void;
  setAudioQuality(q: number): void;
  lookahead(): ExpectedWord[];
  onEvent(cb: (e: AlignEvent) => void): () => void;
}

const LOST_BUFFER = 12;
const LINE_CALL_GAP_SEC = 1;
/** Words of the anchor trigram that located a forward re-anchor candidate. */
const ANCHOR_WORDS = 3;
/** Further heard words that must follow the trigram in the script before a forward re-anchor is trusted. */
const FORWARD_CONFIRM_WORDS = 2;

export function patienceToGrace(patience: number): { confirmWords: number; timeoutSec: number } {
  const p = Math.min(1, Math.max(0, patience));
  return { confirmWords: 1 + Math.round(3 * p), timeoutSec: 0.4 + 2.6 * p };
}

export function createAligner(expected: ExpectedWord[], options: AlignOptions): Aligner {
  const { confirmWords, timeoutSec } = patienceToGrace(options.patience);
  const index = new TrigramIndex(expected);
  const lineWordCount = countCheckedWords(expected);
  const lines = new Map<string, LineState>();
  const lineOrder: string[] = [];
  const lineFirst = new Map<string, number>();
  const lineLast = new Map<string, number>();
  for (const w of expected) {
    let st = lines.get(w.lineId);
    if (!st) {
      st = { lineId: w.lineId, characterId: w.characterId, words: [], resolution: new Map(), notes: [], heard: [] };
      lines.set(w.lineId, st);
      lineOrder.push(w.lineId);
      lineFirst.set(w.lineId, w.idx);
    }
    st.words.push(w);
    lineLast.set(w.lineId, w.idx);
  }

  const listeners = new Set<(e: AlignEvent) => void>();
  const done = new Set<string>();
  const suspected = new Set<number>();
  let cursor = 0;
  let H: HeardToken[] = [];
  let lost = false;
  let lostSince = 0;
  /** A forward re-anchor candidate awaiting confirmation: script index of its first word, and confirmations so far. */
  let pending: { c: number; confirmed: number; need: number } | null = null;
  let paused = false;
  let started = false;
  let skipPlease = false;
  let audioQuality = 1;
  let lastHeardEnd = -Infinity;
  let lastCommittedHeardEnd = -Infinity;
  let recentMatched: ExpectedWord[] = [];

  const emit = (e: AlignEvent) => {
    for (const l of listeners) l(e);
  };
  const windowAt = () => expected.slice(cursor, cursor + options.windowSize);

  function emitLineDone(id: string, at: number): void {
    done.add(id);
    const notes = finalizeLine(lines.get(id)!, {
      strictness: options.strictness,
      audioQuality,
      noteMin: options.noteMinConfidence,
      at,
    });
    emit({ type: 'lineDone', lineId: id, notes, at });
  }

  function checkLinesDone(at: number, final: boolean): void {
    for (const id of lineOrder) {
      if (done.has(id)) continue;
      const st = lines.get(id)!;
      const reached = final ? st.resolution.size > 0 || st.notes.length > 0 : cursor >= lineLast.get(id)! + 2;
      if (reached) emitLineDone(id, at);
    }
  }

  function markSkipped(from: number, to: number): void {
    for (const id of lineOrder) if (lineFirst.get(id)! >= from && lineLast.get(id)! < to) done.add(id);
  }

  function resetFrom(idx: number): void {
    for (const id of lineOrder) {
      if (lineLast.get(id)! < idx) continue;
      const st = lines.get(id)!;
      st.resolution.clear();
      st.notes = [];
      st.heard = [];
      done.delete(id);
    }
    recentMatched = [];
  }

  function commit(ops: Op[], at: number): void {
    if (!ops.length) return;
    const abs: Op[] = ops.map((o) => (hasE(o) ? { ...o, e: o.e + cursor } : o));
    const { notes, stumbles } = classifyOps(abs, {
      expected,
      heard: H,
      recentMatched,
      lastHeardEndBefore: lastCommittedHeardEnd,
      strictness: options.strictness,
      audioQuality,
      lineWordCount,
      noteMin: options.noteMinConfidence,
      at,
      started,
    });
    let attach = recentMatched.at(-1)?.lineId ?? expected[cursor]?.lineId;
    let maxE = cursor - 1;
    let maxH = -1;
    for (const op of abs) {
      if (hasE(op)) {
        const w = expected[op.e]!;
        const st = lines.get(w.lineId)!;
        attach = w.lineId;
        maxE = Math.max(maxE, op.e);
        if (op.kind === 'match') {
          st.resolution.set(op.e, 'matched');
          recentMatched = [...recentMatched, w].slice(-3);
          started = true;
          emit({ type: 'matched', idx: op.e, at });
        } else {
          st.resolution.set(op.e, op.kind);
        }
      }
      if (hasH(op)) {
        maxH = Math.max(maxH, op.h);
        if (attach) lines.get(attach)?.heard.push(H[op.h]!);
      }
    }
    for (const note of notes) {
      lines.get(note.lineId)?.notes.push(note);
      emit({ type: 'flag', note, alert: note.status === 'note' && note.confidence >= options.alertMinConfidence, at });
    }
    for (const s of stumbles) emit({ type: 'stumble', idx: s.idx, heard: s.heard, at });
    if (maxH >= 0) {
      lastCommittedHeardEnd = H[maxH]!.end;
      H = H.slice(maxH + 1);
    }
    cursor = Math.max(cursor, maxE + 1);
    for (const i of [...suspected]) if (i < cursor) suspected.delete(i);
    checkLinesDone(at, false);
  }

  function step(at: number, timeout: boolean): void {
    const ops = alignWindow(H, windowAt());
    const end = timeout ? commitPointOnTimeout(ops) : commitPoint(ops, confirmWords);
    // Before anything has matched, unmatched talk is pre-roll chatter: a timeout must not commit it as errors.
    if (end >= 0 && (started || ops.slice(0, end + 1).some(isMatch))) commit(ops.slice(0, end + 1), at);
    if (!H.length || lost) return;
    const rest = alignWindow(H, windowAt());
    const fresh = rest
      .filter(hasE)
      .filter((o) => o.kind !== 'match')
      .map((o) => o.e + cursor)
      .filter((i) => !suspected.has(i));
    if (fresh.length) {
      for (const i of fresh) suspected.add(i);
      emit({ type: 'suspect', idxs: fresh, at });
    }
    const limit = expected[cursor]?.zone === 'overlap' ? options.lostAfter * 2 : options.lostAfter;
    if (H.length >= limit && rest.filter(isMatch).length < 2) enterLost(at);
  }

  function enterLost(at: number): void {
    lost = true;
    pending = null;
    lostSince = H[0]?.start ?? at;
    suspected.clear();
    emit({ type: 'lost', guesses: index.find(H, cursor, MATCH_THRESHOLD).slice(0, 3), at });
    tryReanchor(at);
  }

  function tryReanchor(at: number): void {
    const tok = H.at(-1)!;
    if (pending) {
      const next = expected[pending.c + ANCHOR_WORDS + pending.confirmed];
      if (next && wordScore(tok, next) >= MATCH_THRESHOLD) {
        pending.confirmed++;
        if (pending.confirmed < pending.need) return;
        const { c, confirmed } = pending;
        pending = null;
        anchorAt(c, ANCHOR_WORDS + confirmed, at);
        return;
      }
      pending = null;
    }
    const c = index.find(H, cursor, MATCH_THRESHOLD)[0];
    if (c === undefined) return;
    if (c > cursor) {
      // A forward snap is only trusted once the words after the trigram match too; stray off-script
      // talk that happens to echo three script words must not skip lines.
      const need = Math.min(FORWARD_CONFIRM_WORDS, expected.length - (c + ANCHOR_WORDS));
      if (need > 0) {
        pending = { c, confirmed: 0, need };
        return;
      }
    }
    anchorAt(c, ANCHOR_WORDS, at);
  }

  /** Snap to script index c, treating the last `len` heard tokens as matching c..c+len-1. */
  function anchorAt(c: number, len: number, at: number): void {
    const anchor = H.slice(-len);
    const before = H.slice(0, -len);
    const lostFor = anchor[0]!.start - lostSince;
    lost = false;
    emit({ type: 'reanchored', fromIdx: cursor, toIdx: c + len, lostFor, at });
    const anchorOps = (eOffset: number, hOffset: number): Op[] =>
      anchor.map((_, k) => ({ kind: 'match' as const, h: hOffset + k, e: eOffset + k, score: 1 }));
    if (c > cursor && lostFor < options.longLossSec) {
      const gapOps = alignWindow(before, expected.slice(cursor, c), { global: true });
      commit([...gapOps, ...anchorOps(c - cursor, before.length)], at);
      return;
    }
    if (c > cursor) {
      emit({ type: 'notRun', fromIdx: cursor, toIdx: c, at });
      markSkipped(cursor, c);
    } else if (c < cursor) {
      resetFrom(c);
    }
    cursor = c;
    H = anchor;
    commit(anchorOps(0, 0), at);
  }

  function calledForLine(tok: HeardToken): void {
    skipPlease = true;
    const idx = Math.min(cursor, expected.length - 1);
    const w = expected[idx]!;
    const confidence = Math.round(0.9 * audioQuality * 1000) / 1000;
    const note: NoteDraft = {
      lineId: w.lineId,
      characterId: w.characterId,
      category: 'called-for-line',
      expected: displayExpected(expected.slice(idx, idx + 8)),
      heard: 'line',
      confidence,
      status: confidence >= options.noteMinConfidence ? 'note' : 'check',
      at: tok.end,
    };
    lines.get(w.lineId)!.notes.push(note);
    emit({ type: 'calledForLine', idx, at: tok.end });
    emit({ type: 'flag', note, alert: false, at: tok.end });
  }

  function handleToken(tok: HeardToken): void {
    const gap = tok.start - lastHeardEnd;
    lastHeardEnd = tok.end;
    if (skipPlease) {
      skipPlease = false;
      if (tok.norm === 'please') return;
    }
    if (
      started &&
      !lost &&
      cursor < expected.length &&
      tok.norm === 'line' &&
      gap >= LINE_CALL_GAP_SEC &&
      !expected.slice(cursor, cursor + 4).some((w) => w.norm === 'line')
    ) {
      calledForLine(tok);
      return;
    }
    H.push(tok);
    if (lost) {
      if (H.length > LOST_BUFFER) H.shift();
      tryReanchor(tok.end);
      return;
    }
    step(tok.end, false);
  }

  return {
    get cursor() {
      return cursor;
    },
    push(words) {
      if (!expected.length) return;
      for (const w of words) {
        if (!w.final || paused) continue;
        for (const tok of toHeardTokens([w], options.strictness)) handleToken(tok);
      }
    },
    tick(now) {
      if (!expected.length || paused || lost || !H.length) return;
      if (now - lastHeardEnd >= timeoutSec) step(now, true);
    },
    finalize(now) {
      if (!expected.length) return;
      if (!lost && H.length) step(now, true);
      lost = false;
      pending = null;
      H = [];
      if (cursor < expected.length) emit({ type: 'notRun', fromIdx: cursor, toIdx: expected.length, at: now });
      checkLinesDone(now, true);
    },
    jumpTo(idx) {
      if (!expected.length) return;
      const target = Math.max(0, Math.min(expected.length, Math.floor(idx)));
      const at = Number.isFinite(lastHeardEnd) ? lastHeardEnd : 0;
      if (target > cursor) {
        emit({ type: 'notRun', fromIdx: cursor, toIdx: target, at });
        markSkipped(cursor, target);
      } else if (target < cursor) {
        resetFrom(target);
      }
      cursor = target;
      H = [];
      lost = false;
      pending = null;
      started = false;
      recentMatched = [];
      suspected.clear();
      checkLinesDone(at, false);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    setAudioQuality(q) {
      audioQuality = Math.min(1, Math.max(0, q));
    },
    lookahead() {
      return windowAt();
    },
    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
