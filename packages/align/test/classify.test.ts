import { describe, expect, it } from 'vitest';
import { classifyOps, type ClassifyContext } from '../src/classify';
import { buildExpected, countCheckedWords, toHeardTokens } from '../src/expected';
import type { ScriptLineInput, Strictness } from '../src/types';
import { alignWindow } from '../src/window-align';
import { heard, type HeardOptions } from './helpers/dsl';
import { EARNEST, textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const LENIENT: Strictness = { mode: 'lenient', lineMatchThreshold: 0.8 };
const perf = (...ids: string[]) => ids.map((id) => textOf(id)).join(' ');

function classify(
  heardText: string,
  opts: { lines?: ScriptLineInput[]; strictness?: Strictness; heardOpts?: HeardOptions; ctx?: Partial<ClassifyContext> } = {},
) {
  const strictness = opts.strictness ?? WP;
  const expected = buildExpected(opts.lines ?? EARNEST, strictness);
  const toks = toHeardTokens(heard(heardText, opts.heardOpts), strictness);
  const ops = alignWindow(toks, expected);
  return classifyOps(ops, {
    expected,
    heard: toks,
    recentMatched: [],
    lastHeardEndBefore: -Infinity,
    strictness,
    audioQuality: 1,
    lineWordCount: countCheckedWords(expected),
    noteMin: 0.5,
    at: 0,
    started: false,
    ...opts.ctx,
  });
}

const L4_FEELING = 'Anyone can play accurately, but I play with wonderful feeling.';

describe('classifyOps', () => {
  it('finds nothing in a perfect run', () => {
    expect(classify(perf('L1', 'L2', 'L3', 'L4', 'L5'))).toEqual({ notes: [], stumbles: [] });
  });

  it('wrong word', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '));
    expect(notes).toEqual([
      expect.objectContaining({ lineId: 'L4', category: 'wrong-words', expected: 'expression', heard: 'feeling', status: 'note', confidence: 0.85 }),
    ]);
  });

  it('dropped words', () => {
    const { notes } = classify([perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' '));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ lineId: 'L3', category: 'dropped-words', status: 'note' });
    expect(notes[0]!.expected).toContain('your sake');
  });

  it('dropped line followed by the same character', () => {
    const { notes } = classify(perf('L1', 'L2', 'L4', 'L5'));
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L3', characterId: 'ALGERNON', category: 'dropped-line' })]);
  });

  it('jumped cue: another character comes in early', () => {
    const { notes } = classify(perf('L1', 'L3', 'L4', 'L5'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ lineId: 'L3', characterId: 'ALGERNON', category: 'jumped-cue' });
    expect(notes[0]!.expected).toContain('polite to listen');
  });

  it('a long silence before the next line means the line was dropped, not jumped', () => {
    const { notes } = classify(`${perf('L1')} || ${perf('L3', 'L4', 'L5')}`);
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L2', characterId: 'LANE', category: 'dropped-line' })]);
  });

  it('added words attach to the line they follow', () => {
    const { notes } = classify(`${perf('L1', 'L2', 'L3', 'L4')} Yes, sir, of course.`);
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'added-words', heard: 'of course', status: 'note' })]);
  });

  it('transposed words', () => {
    const { notes } = classify(
      [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with expression wonderful.', perf('L5')].join(' '),
    );
    expect(notes).toEqual([
      expect.objectContaining({ lineId: 'L4', category: 'transposed', expected: 'wonderful expression', heard: 'expression wonderful', status: 'note' }),
    ]);
  });

  it('a pause-and-correct is a stumble, not an added word', () => {
    const r = classify(['Did you hear what you | I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '));
    expect(r.notes).toEqual([]);
    expect(r.stumbles).toHaveLength(1);
  });

  it('repeating words is a stumble', () => {
    const r = classify(['Did you hear did you hear what I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '));
    expect(r.notes).toEqual([]);
    expect(r.stumbles).toHaveLength(1);
  });

  it('ignores talk before the first matched word (pre-roll)', () => {
    expect(classify(`Okay are we starting now | ${perf('L1', 'L2', 'L3', 'L4', 'L5')}`).notes).toEqual([]);
  });

  it('contraction differences are only ever "check" in word-perfect', () => {
    const { notes } = classify([perf('L1', 'L2'), "I am sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' '));
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L3', category: 'wrong-words', status: 'check', confidence: 0.45 })]);
  });

  it('contraction differences vanish in lenient mode', () => {
    const text = [perf('L1', 'L2'), "I am sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' ');
    expect(classify(text, { strictness: LENIENT }).notes).toEqual([]);
  });

  it('a lone added function word is only a "check"', () => {
    const { notes } = classify(['Did you hear what I was playing, the Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '));
    expect(notes).toEqual([expect.objectContaining({ category: 'added-words', heard: 'the', status: 'check' })]);
  });

  it('lenient mode drops function-word-only differences entirely', () => {
    const text = ['Did you hear what I was playing, the Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ');
    expect(classify(text, { strictness: LENIENT }).notes).toEqual([]);
  });

  it('low recognizer confidence turns a note into a check', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { heardOpts: { confidence: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ category: 'wrong-words', status: 'check', confidence: 0.425 })]);
  });

  it('poor audio quality turns a note into a check', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { ctx: { audioQuality: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ status: 'check', confidence: 0.425 })]);
  });

  it('ignores differences inside overlap zones', () => {
    const lines = EARNEST.map((l) => (l.id === 'L2' ? { ...l, overlapRanges: [[4, 8]] as Array<[number, number]> } : l));
    const text = [perf('L1'), "I didn't think it rather mumbled noise here", perf('L3', 'L4', 'L5')].join(' ');
    expect(classify(text, { lines }).notes).toEqual([]);
  });
});
