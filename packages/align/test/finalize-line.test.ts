import { describe, expect, it } from 'vitest';
import { buildExpected, toHeardTokens } from '../src/expected';
import { finalizeLine, type LineState } from '../src/finalize-line';
import type { NoteDraft, Strictness } from '../src/types';
import { heard } from './helpers/dsl';
import { textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const CTX = { strictness: WP, audioQuality: 1, noteMin: 0.5, at: 0 };
const words = buildExpected([{ id: 'L4', characterId: 'ALGERNON', text: textOf('L4') }], WP); // 10 words, idx 0..9

function state(res: Array<'matched' | 'sub' | 'del'>, notes: NoteDraft[], heardText = ''): LineState {
  return {
    lineId: 'L4',
    characterId: 'ALGERNON',
    words,
    resolution: new Map(res.map((r, i) => [i, r])),
    notes,
    heard: toHeardTokens(heard(heardText), WP),
  };
}

const note = (category: NoteDraft['category'], expected: string, heardText: string, confidence = 0.8): NoteDraft => ({
  lineId: 'L4',
  characterId: 'ALGERNON',
  category,
  expected,
  heard: heardText,
  confidence,
  status: confidence >= 0.5 ? 'note' : 'check',
  at: 0,
});

describe('finalizeLine', () => {
  it('turns a heavily reworded line into one paraphrase note', () => {
    const s = state(
      ['matched', 'matched', 'matched', 'sub', 'sub', 'sub', 'sub', 'sub', 'sub', 'matched'],
      [note('wrong-words', 'accurately but I play with wonderful', 'correctly though my playing has marvellous', 0.51)],
      'anyone can play correctly though my playing has marvellous expression',
    );
    expect(finalizeLine(s, CTX)).toEqual([
      {
        lineId: 'L4',
        characterId: 'ALGERNON',
        category: 'paraphrase',
        expected: 'Anyone can play accurately, but I play with wonderful expression',
        heard: 'anyone can play correctly though my playing has marvellous expression',
        confidence: 0.85,
        status: 'note',
        at: 0,
      },
    ]);
  });

  it('a single wrong word is not a paraphrase', () => {
    const n = note('wrong-words', 'but', 'and');
    const s = state(['matched', 'matched', 'matched', 'matched', 'sub', 'matched', 'matched', 'matched', 'matched', 'matched'], [n]);
    expect(finalizeLine(s, CTX)).toEqual([n]);
  });

  it('dropped interior words are not a paraphrase', () => {
    const n = note('dropped-words', 'accurately but I play with', '');
    const s = state(['matched', 'matched', 'matched', 'del', 'del', 'del', 'del', 'del', 'matched', 'matched'], [n]);
    expect(finalizeLine(s, CTX)).toEqual([n]);
  });

  it('short lines are never paraphrases', () => {
    const short = buildExpected([{ id: 'S', characterId: 'X', text: 'one two three four five' }], WP);
    const n = note('wrong-words', 'two three four', 'a b c');
    const s: LineState = {
      lineId: 'S',
      characterId: 'X',
      words: short,
      resolution: new Map([[0, 'matched'], [1, 'sub'], [2, 'sub'], [3, 'sub'], [4, 'matched']]),
      notes: [n],
      heard: [],
    };
    expect(finalizeLine(s, CTX)).toEqual([n]);
  });

  it('merges an added and a dropped copy of the same word into a transposition', () => {
    const s = state(
      ['matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'del'],
      [note('added-words', '', 'expression', 0.75), note('dropped-words', 'expression', '', 0.8)],
    );
    expect(finalizeLine(s, CTX)).toEqual([
      expect.objectContaining({ category: 'transposed', expected: 'expression', heard: 'expression', confidence: 0.8, status: 'note' }),
    ]);
  });

  it('lenient mode forgives a mostly-right line but keeps called-for-line', () => {
    const lenient = { ...CTX, strictness: { mode: 'lenient', lineMatchThreshold: 0.8 } as Strictness };
    const called = note('called-for-line', 'I play with wonderful expression', 'line', 0.9);
    const s = state(
      ['matched', 'matched', 'matched', 'matched', 'sub', 'matched', 'matched', 'matched', 'matched', 'matched'],
      [note('wrong-words', 'but', 'and'), called],
    );
    expect(finalizeLine(s, lenient)).toEqual([called]);
  });

  it('lenient mode keeps notes on lines below the threshold', () => {
    const lenient = { ...CTX, strictness: { mode: 'lenient', lineMatchThreshold: 0.95 } as Strictness };
    const n = note('wrong-words', 'but', 'and');
    const s = state(['matched', 'matched', 'matched', 'matched', 'sub', 'matched', 'matched', 'matched', 'matched', 'matched'], [n]);
    expect(finalizeLine(s, lenient)).toEqual([n]);
  });
});
