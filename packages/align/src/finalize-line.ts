import { BASE_CONFIDENCE, WORD_LEVEL_CATEGORIES } from './classify';
import { displayExpected, displayHeard } from './expected';
import type { ExpectedWord, HeardToken, NoteDraft, Strictness } from './types';

export interface LineState {
  lineId: string;
  characterId: string;
  words: ExpectedWord[];
  resolution: Map<number, 'matched' | 'sub' | 'del'>;
  notes: NoteDraft[];
  heard: HeardToken[];
}

export interface FinalizeContext {
  strictness: Strictness;
  audioQuality: number;
  noteMin: number;
  at: number;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function mergeTranspositions(input: NoteDraft[], noteMin: number): NoteDraft[] {
  const notes = [...input];
  for (let a = 0; a < notes.length; a++) {
    const added = notes[a]!;
    if (added.category !== 'added-words') continue;
    const b = notes.findIndex(
      (n) => n.category === 'dropped-words' && n.expected.toLowerCase() === added.heard.toLowerCase(),
    );
    if (b < 0) continue;
    const dropped = notes[b]!;
    const confidence = Math.max(added.confidence, dropped.confidence);
    const merged: NoteDraft = {
      ...dropped,
      category: 'transposed',
      heard: added.heard,
      confidence,
      status: confidence >= noteMin ? 'note' : 'check',
    };
    notes.splice(Math.max(a, b), 1);
    notes.splice(Math.min(a, b), 1, merged);
    a = -1;
  }
  return notes;
}

export function finalizeLine(state: LineState, ctx: FinalizeContext): NoteDraft[] {
  let notes = mergeTranspositions(state.notes, ctx.noteMin);
  const checked = state.words.filter((w) => w.zone === 'checked');
  const res = (w: ExpectedWord) => state.resolution.get(w.idx);

  if (checked.length >= 6) {
    const interior = checked.slice(2, -2);
    const matchedRatio = interior.filter((w) => res(w) === 'matched').length / interior.length;
    const subs = interior.filter((w) => res(w) === 'sub').length;
    const head = checked.slice(0, 2).some((w) => res(w) === 'matched');
    const tail = checked.slice(-2).some((w) => res(w) === 'matched');
    const hasWordNotes = notes.some((n) => WORD_LEVEL_CATEGORIES.has(n.category));
    if (head && tail && matchedRatio < 0.5 && subs >= 2 && hasWordNotes) {
      const meanConf = state.heard.length
        ? state.heard.reduce((s, t) => s + t.confidence, 0) / state.heard.length
        : 1;
      const confidence = round3(BASE_CONFIDENCE.paraphrase * meanConf * ctx.audioQuality);
      notes = [
        ...notes.filter((n) => !WORD_LEVEL_CATEGORIES.has(n.category)),
        {
          lineId: state.lineId,
          characterId: state.characterId,
          category: 'paraphrase',
          expected: displayExpected(state.words),
          heard: displayHeard(state.heard),
          confidence,
          status: confidence >= ctx.noteMin ? 'note' : 'check',
          at: ctx.at,
        },
      ];
    }
  }

  if (ctx.strictness.mode === 'lenient' && checked.length) {
    const ratio = checked.filter((w) => res(w) === 'matched').length / checked.length;
    if (ratio >= ctx.strictness.lineMatchThreshold) {
      notes = notes.filter((n) => !WORD_LEVEL_CATEGORIES.has(n.category) && n.category !== 'paraphrase');
    }
  }
  return notes;
}
