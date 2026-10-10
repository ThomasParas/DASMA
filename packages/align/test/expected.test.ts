import { describe, expect, it } from 'vitest';
import {
  buildExpected,
  countCheckedWords,
  displayExpected,
  displayHeard,
  toHeardTokens,
} from '../src/expected';
import type { HeardWord, Strictness } from '../src/types';

const WP: Strictness = { mode: 'word-perfect' };
const LENIENT: Strictness = { mode: 'lenient', lineMatchThreshold: 0.8 };
const hw = (text: string, start = 0): HeardWord => ({ text, start, end: start + 0.3, confidence: 0.9, final: true });

describe('buildExpected', () => {
  it('flattens lines into indexed words', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Hello there, friend.' },
        { id: 'B', characterId: 'Y', text: 'Hi.' },
      ],
      WP,
    );
    expect(exp.map((w) => w.norm)).toEqual(['hello', 'there', 'friend', 'hi']);
    expect(exp.map((w) => w.idx)).toEqual([0, 1, 2, 3]);
    expect(exp[3]).toMatchObject({ lineId: 'B', characterId: 'Y', wordInLine: 0, raw: 'Hi.', zone: 'checked' });
  });

  it('skips cut lines', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Keep me.' },
        { id: 'B', characterId: 'X', text: 'Cut me.', cut: true },
      ],
      WP,
    );
    expect(exp.map((w) => w.lineId)).toEqual(['A', 'A']);
  });

  it('marks overlap ranges by raw word index', () => {
    const exp = buildExpected(
      [{ id: 'A', characterId: 'X', text: "I didn't think it polite to listen, sir.", overlapRanges: [[4, 8]] }],
      WP,
    );
    expect(exp.map((w) => w.zone)).toEqual([
      'checked', 'checked', 'checked', 'checked', 'overlap', 'overlap', 'overlap', 'overlap',
    ]);
  });

  it('keeps contractions in word-perfect and expands them in lenient', () => {
    const line = [{ id: 'A', characterId: 'X', text: "I'm sorry" }];
    expect(buildExpected(line, WP).map((w) => w.norm)).toEqual(["i'm", 'sorry']);
    const lenient = buildExpected(line, LENIENT);
    expect(lenient.map((w) => w.norm)).toEqual(['i', 'am', 'sorry']);
    expect(lenient.map((w) => w.wordInLine)).toEqual([0, 0, 1]);
  });

  it('zero-word lines: lines with no speakable words add nothing and do not disturb indexing', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Hello.' },
        { id: 'B', characterId: 'X', text: '—' },
        { id: 'C', characterId: 'X', text: '…' },
        { id: 'D', characterId: 'X', text: '' },
        { id: 'E', characterId: 'X', text: 'Goodbye.' },
      ],
      WP,
    );
    expect(exp.map((w) => [w.idx, w.lineId, w.norm])).toEqual([
      [0, 'A', 'hello'],
      [1, 'E', 'goodbye'],
    ]);
  });
});

describe('buildExpected fillers', () => {
  it('never expects a scripted filler, in either strictness', () => {
    const line = [{ id: 'A', characterId: 'X', text: 'Um, I really mean it.' }];
    for (const strictness of [WP, LENIENT]) {
      const exp = buildExpected(line, strictness);
      expect(exp.map((w) => w.norm)).toEqual(['i', 'really', 'mean', 'it']);
      expect(exp.map((w) => w.idx)).toEqual([0, 1, 2, 3]);
      expect(exp.map((w) => w.wordInLine)).toEqual([1, 2, 3, 4]);
    }
  });

  it('a line that is only a filler has no expected words', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Hello.' },
        { id: 'B', characterId: 'X', text: 'Hmm.' },
        { id: 'C', characterId: 'X', text: 'Goodbye.' },
      ],
      WP,
    );
    expect(exp.map((w) => [w.idx, w.lineId, w.norm])).toEqual([
      [0, 'A', 'hello'],
      [1, 'C', 'goodbye'],
    ]);
  });
});

describe('toHeardTokens', () => {
  it('normalizes recognizer output and drops fillers', () => {
    const toks = toHeardTokens([hw('UM', 0), hw("I'M", 1), hw('SORRY', 2)], WP);
    expect(toks.map((t) => t.norm)).toEqual(["i'm", 'sorry']);
    expect(toks[0]).toMatchObject({ text: "I'M", start: 1, end: 1.3, confidence: 0.9 });
  });

  it('expands contractions in lenient mode', () => {
    expect(toHeardTokens([hw("I'M"), hw('SORRY')], LENIENT).map((t) => t.norm)).toEqual(['i', 'am', 'sorry']);
  });
});

describe('display helpers', () => {
  it('shows expected words once, with edge punctuation trimmed', () => {
    const exp = buildExpected([{ id: 'A', characterId: 'X', text: "I'm sorry, Lane." }], LENIENT);
    expect(displayExpected(exp)).toBe("I'm sorry, Lane");
  });

  it('shows heard tokens as normalized words', () => {
    expect(displayHeard(toHeardTokens([hw('OF'), hw('COURSE')], WP))).toBe('of course');
  });

  it('counts only checked words per line', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'one two three four', overlapRanges: [[2, 4]] },
        { id: 'B', characterId: 'Y', text: 'five' },
      ],
      WP,
    );
    expect(countCheckedWords(exp)).toEqual(
      new Map([
        ['A', 2],
        ['B', 1],
      ]),
    );
  });
});
