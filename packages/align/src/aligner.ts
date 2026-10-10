import { WORD_LEVEL_CATEGORIES, classifyOps } from './classify';
import { commitPoint, commitPointOnTimeout } from './commit';
import { countCheckedWords, displayExpected, toHeardTokens } from './expected';
import { finalizeLine, type LineState } from './finalize-line';
import { insideAny, offScriptSpans, type HeardMark } from './off-script';
import { MATCH_THRESHOLD, phoneticKey, wordScore } from './phonetic';
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
/** Longest silence between two heard words that may still be one word the recognizer split. */
const REJOIN_GAP_SEC = 0.3;
const LINE_CALL_GAP_SEC = 1;
/** Words of the anchor trigram that located a forward re-anchor candidate. */
const ANCHOR_WORDS = 3;
/** Further heard words that must follow the trigram in the script before a forward re-anchor is trusted. */
const FORWARD_CONFIRM_WORDS = 2;

const consecutive = (idxs: number[]): boolean =>
  idxs.length === ANCHOR_WORDS && idxs.every((x, k) => k === 0 || x === idxs[k - 1]! + 1);

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
  /** Alert-eligible notes waiting for the script position to be confirmed after them (pass spec §6.1). */
  let waiting: Array<{ note: NoteDraft; afterIdx: number }> = [];

  interface LineSnapshot {
    resolution: Map<number, 'matched' | 'sub' | 'del'>;
    notes: NoteDraft[];
    heard: HeardToken[];
    /** The notes of the line's last lineDone, if it had finished before the jump. */
    final: NoteDraft[] | null;
  }
  /** Lines reset by a backward jump that the redo has not reached yet (pass spec §6.3). */
  const snapshots = new Map<string, LineSnapshot>();
  const lastDone = new Map<string, NoteDraft[]>();

  /** Every heard token the aligner has taken in, in order; H is always a suffix of this list (pass spec §6.2). */
  const marks: HeardMark[] = [];
  const markOf = new Map<HeardToken, HeardMark>();
  /** Heard-time span of each note that has heard words, for downgrading earlier notes once a run turns out off-script. */
  const noteTimes = new Map<NoteDraft, [number, number]>();
  const MAX_MARKS = 64;

  function track(tok: HeardToken): void {
    const mark: HeardMark = { start: tok.start, end: tok.end, matched: false };
    marks.push(mark);
    markOf.set(tok, mark);
    if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS);
  }

  /** While lost, heard tokens only accumulate (bounded) until a re-anchor candidate shows up. */
  function pushLost(tok: HeardToken): void {
    H.push(tok);
    track(tok);
    if (H.length > LOST_BUFFER) H.shift();
  }

  const emit = (e: AlignEvent) => {
    for (const l of listeners) l(e);
  };
  const windowAt = () => expected.slice(cursor, cursor + options.windowSize);

  /** "any one" heard for a scripted "anyone" (pass spec §5.5); never when the first word alone is scripted here. */
  function rejoin(a: HeardToken, b: HeardToken): HeardToken | null {
    if (b.start - a.end > REJOIN_GAP_SEC) return null;
    const norm = a.norm + b.norm;
    const win = windowAt();
    const j = win.findIndex((w) => w.norm === norm);
    if (j < 0 || win.slice(0, j + 1).some((w) => wordScore(a, w) >= MATCH_THRESHOLD)) return null;
    return { text: `${a.text}${b.text}`, norm, phon: phoneticKey(norm), start: a.start, end: b.end, confidence: Math.min(a.confidence, b.confidence) };
  }

  /** "norhan" heard for a scripted "nor hand" (pass spec §5.1): one script word run into the start of the next. */
  function split(tok: HeardToken): HeardToken[] | null {
    const win = windowAt();
    if (win.some((w) => wordScore(tok, w) >= MATCH_THRESHOLD)) return null;
    for (let k = 0; k + 1 < win.length; k++) {
      const a = win[k]!;
      const b = win[k + 1]!;
      if (!tok.norm.startsWith(a.norm)) continue;
      const rest = tok.norm.slice(a.norm.length);
      if (rest.length < 2 || !(b.norm.startsWith(rest) || phoneticKey(rest)[0] === b.phon[0])) continue;
      const mid = tok.start + (tok.end - tok.start) * (a.norm.length / tok.norm.length);
      return [
        { ...tok, norm: a.norm, phon: a.phon, end: mid },
        { ...tok, norm: b.norm, phon: b.phon, start: mid },
      ];
    }
    return null;
  }

  function emitLineDone(id: string, at: number): void {
    done.add(id);
    const snap = snapshots.get(id);
    if (snap) {
      // A backward jump reset this line, but the redo never reached it: it keeps its earlier result.
      snapshots.delete(id);
      const st = lines.get(id)!;
      st.resolution = new Map(snap.resolution);
      st.notes = [...snap.notes];
      st.heard = [...snap.heard];
      if (snap.final) {
        lastDone.set(id, snap.final);
        emit({ type: 'lineDone', lineId: id, notes: snap.final, at });
        return;
      }
    }
    const notes = finalizeLine(lines.get(id)!, {
      strictness: options.strictness,
      audioQuality,
      noteMin: options.noteMinConfidence,
      at,
    });
    lastDone.set(id, notes);
    emit({ type: 'lineDone', lineId: id, notes, at });
  }

  function checkLinesDone(at: number, final: boolean): void {
    for (const id of lineOrder) {
      if (done.has(id)) continue;
      const st = lines.get(id)!;
      const reached = final ? st.resolution.size > 0 || st.notes.length > 0 || snapshots.has(id) : cursor >= lineLast.get(id)! + 2;
      if (reached) emitLineDone(id, at);
    }
  }

  function markSkipped(from: number, to: number, at: number): void {
    for (const id of lineOrder) {
      if (lineFirst.get(id)! >= from && lineLast.get(id)! < to) {
        if (snapshots.has(id)) emitLineDone(id, at);
        else done.add(id);
      }
    }
  }

  /** Mid-line: the 3 matches right before the flagged ops are consecutive and the last is on the note's own line. */
  function anchoredBefore(ops: Op[], from: number, before: ExpectedWord[], lineId: string): boolean {
    const prev = [...before, ...ops.slice(0, from).filter(isMatch).map((o) => expected[o.e]!)].slice(-ANCHOR_WORDS);
    return consecutive(prev.map((w) => w.idx)) && prev.at(-1)!.lineId === lineId;
  }

  /** The last script index a note's ops touch (for insertion-only notes, the last match before them). */
  function regionEnd(ops: Op[], from: number, to: number): number {
    let end = -1;
    for (let k = 0; k <= to; k++) {
      const o = ops[k]!;
      if (hasE(o) && (k >= from || o.kind === 'match')) end = Math.max(end, o.e);
    }
    return end >= 0 ? end : cursor - 1;
  }

  function releaseWaiting(at: number): void {
    const last = recentMatched.map((w) => w.idx);
    if (!waiting.length || !consecutive(last)) return;
    const ready = waiting.filter((w) => last[0]! > w.afterIdx);
    if (!ready.length) return;
    waiting = waiting.filter((w) => !ready.includes(w));
    for (const w of ready) emit({ type: 'flag', note: w.note, alert: true, at });
  }

  /** Earlier notes whose heard words now turn out to sit inside off-script talk become checks (pass spec §6.2). */
  function downgradeOffScript(spans: Array<[number, number]>, at: number): void {
    if (!spans.length) return;
    for (const id of lineOrder) {
      const st = lines.get(id)!;
      let changed = false;
      st.notes = st.notes.map((n) => {
        const t = noteTimes.get(n);
        if (!t || n.status !== 'note' || !insideAny(spans, t[0], t[1])) return n;
        changed = true;
        waiting = waiting.filter((w) => w.note !== n);
        const down: NoteDraft = { ...n, status: 'check' };
        noteTimes.set(down, t);
        return down;
      });
      if (changed && done.has(id)) emitLineDone(id, at);
    }
  }

  function resetFrom(idx: number): void {
    for (const id of lineOrder) {
      if (lineLast.get(id)! < idx) continue;
      const st = lines.get(id)!;
      const touched = st.resolution.size > 0 || st.notes.length > 0;
      if (touched && !snapshots.has(id)) {
        snapshots.set(id, {
          resolution: new Map(st.resolution),
          notes: [...st.notes],
          heard: [...st.heard],
          final: done.has(id) ? (lastDone.get(id) ?? []) : null,
        });
      }
      st.resolution.clear();
      st.notes = [];
      st.heard = [];
      done.delete(id);
    }
    recentMatched = [];
    waiting = waiting.filter((w) => lineLast.get(w.note.lineId)! < idx);
  }

  function commit(ops: Op[], at: number): void {
    const before = recentMatched;
    if (!ops.length) return;
    const abs: Op[] = ops.map((o) => (hasE(o) ? { ...o, e: o.e + cursor } : o));
    const { notes, stumbles, meta } = classifyOps(abs, {
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
      heardConfidenceFloor: options.heardConfidenceFloor,
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
          snapshots.delete(w.lineId);
          const mark = markOf.get(H[op.h]!);
          if (mark) mark.matched = true;
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
    const pendingAfter = maxH >= 0 ? H.length - (maxH + 1) : H.length;
    const spans = offScriptSpans(marks.slice(0, Math.max(0, marks.length - pendingAfter)));
    for (const raw of notes) {
      const m = meta.get(raw)!;
      if (snapshots.has(raw.lineId)) continue;
      // Pass spec §6.3: lines the redo never reached keep their earlier result, so a skip over them is not a jumped cue either.
      if (raw.category === 'jumped-cue') {
        const skipped = abs.slice(m.from, m.to + 1).filter(hasE).map((o) => expected[o.e]!.lineId);
        if (skipped.length && skipped.every((id) => snapshots.has(id))) continue;
      }
      const toks = abs.slice(m.from, m.to + 1).filter(hasH).map((o) => H[o.h]!);
      const time: [number, number] | null = toks.length ? [toks[0]!.start, toks.at(-1)!.end] : null;
      const offScript = time !== null && insideAny(spans, time[0], time[1]);
      const note: NoteDraft = offScript && raw.status === 'note' ? { ...raw, status: 'check' } : raw;
      if (time) noteTimes.set(note, time);
      lines.get(note.lineId)?.notes.push(note);
      // Lenient mode forgives word-level slips once the line is mostly right, which is only known at line end,
      // so a live alert for a word-level note could never be retracted: leave those to the finalized line notes.
      const deferredToLineEnd = options.strictness.mode === 'lenient' && WORD_LEVEL_CATEGORIES.has(note.category);
      const eligible = !offScript && !m.quiet && !deferredToLineEnd && note.status === 'note' && note.confidence >= options.alertMinConfidence;
      const after = abs.slice(m.to + 1).filter(isMatch).slice(0, ANCHOR_WORDS).map((o) => o.e);
      const anchored = anchoredBefore(abs, m.from, before, note.lineId) || consecutive(after);
      emit({ type: 'flag', note, alert: eligible && anchored, at });
      if (eligible && !anchored) waiting.push({ note, afterIdx: regionEnd(abs, m.from, m.to) });
    }
    for (const s of stumbles) emit({ type: 'stumble', idx: s.idx, heard: s.heard, at });
    downgradeOffScript(spans, at);
    releaseWaiting(at);
    if (maxH >= 0) {
      lastCommittedHeardEnd = H[maxH]!.end;
      H = H.slice(maxH + 1);
    }
    cursor = Math.max(cursor, maxE + 1);
    for (const i of [...suspected]) if (i < cursor) suspected.delete(i);
    checkLinesDone(at, false);
  }

  /** Shift an op aligned against H.slice(hOff) and expected.slice(cursor + eOff) back into window coordinates. */
  const shiftOp = (o: Op, hOff: number, eOff: number): Op =>
    o.kind === 'ins' ? { ...o, h: o.h + hOff } : o.kind === 'del' ? { ...o, e: o.e + eOff } : { ...o, h: o.h + hOff, e: o.e + eOff };

  /**
   * Pass spec §6.4: if the last block of mismatches before the confirming matches is really the opening of one of the
   * next two lines, rebuild the ops so the words up to that line are skipped and the heard words align from it.
   */
  function realignToNextLine(ops: Op[]): Op[] {
    let k = ops.length - 1;
    while (k >= 0 && ops[k]!.kind === 'match') k--;
    let b = k;
    while (b >= 0 && ops[b]!.kind !== 'match') b--;
    const block = ops.slice(b + 1, k + 1);
    if (!block.some((o) => o.kind === 'sub')) return ops;
    const firstH = block.find(hasH)?.h;
    const firstE = block.find(hasE)?.e;
    if (firstH === undefined || firstE === undefined) return ops;
    const blockToks = block.filter(hasH).map((o) => H[o.h]!);
    if (blockToks.length < 2) return ops;
    const lineIdx = lineOrder.indexOf(expected[cursor + firstE]!.lineId);
    for (const id of lineOrder.slice(lineIdx + 1, lineIdx + 3)) {
      const s = lineFirst.get(id)!;
      if (s - cursor >= options.windowSize) break;
      if (!blockToks.every((t, n) => expected[s + n] !== undefined && wordScore(t, expected[s + n]!) >= MATCH_THRESHOLD)) continue;
      const dels: Op[] = [];
      for (let e = cursor + firstE; e < s; e++) dels.push({ kind: 'del', e: e - cursor });
      const rest = alignWindow(H.slice(firstH), expected.slice(s, s + options.windowSize)).map((o) => shiftOp(o, firstH, s - cursor));
      return [...ops.slice(0, b + 1), ...dels, ...rest];
    }
    return ops;
  }

  /** Pass spec §6.4: a mismatch touching one of a line's last 2 words needs at least 2 confirming words. */
  function touchesLineEnd(ops: Op[], end: number): boolean {
    for (let k = 0; k <= end; k++) {
      const o = ops[k]!;
      if (o.kind === 'match' || !hasE(o)) continue;
      const w = expected[cursor + o.e];
      if (w && lineLast.get(w.lineId)! - w.idx < 2) return true;
    }
    return false;
  }

  function step(at: number, timeout: boolean): void {
    const ops = realignToNextLine(alignWindow(H, windowAt()));
    let end = timeout ? commitPointOnTimeout(ops) : commitPoint(ops, confirmWords);
    if (!timeout && confirmWords < 2 && end >= 0 && touchesLineEnd(ops, end)) end = commitPoint(ops, 2);
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
    waiting = [];
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
    if (c !== cursor) {
      // A jump either way is only trusted once the words after the trigram match too: a director quoting an earlier
      // line, or stray talk echoing three script words, must not move the cursor (pass spec §6.3).
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
      markSkipped(cursor, c, at);
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
    if (lost) {
      pushLost(tok);
      tryReanchor(tok.end);
      return;
    }
    for (const piece of split(tok) ?? [tok]) {
      if (lost) {
        pushLost(piece);
        tryReanchor(piece.end);
        continue;
      }
      const last = H.at(-1);
      const joined = last ? rejoin(last, piece) : null;
      if (joined) {
        const mark = markOf.get(last!)!;
        mark.end = joined.end;
        markOf.set(joined, mark);
        H[H.length - 1] = joined;
      } else {
        H.push(piece);
        track(piece);
      }
      step(piece.end, false);
    }
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
      waiting = [];
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
        markSkipped(cursor, target, at);
      } else if (target < cursor) {
        resetFrom(target);
      }
      cursor = target;
      H = [];
      lost = false;
      pending = null;
      waiting = [];
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
