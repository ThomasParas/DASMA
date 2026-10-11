import { describe, expect, it } from 'vitest';
import { classifyOps, isFragment, type ClassifyContext } from '../src/classify';
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
  opts: {
    lines?: ScriptLineInput[];
    strictness?: Strictness;
    heardOpts?: HeardOptions;
    confidenceAt?: Record<number, number>;
    ctx?: Partial<ClassifyContext>;
  } = {},
) {
  const strictness = opts.strictness ?? WP;
  const expected = buildExpected(opts.lines ?? EARNEST, strictness);
  const words = heard(heardText, opts.heardOpts).map((w, k) =>
    opts.confidenceAt?.[k] !== undefined ? { ...w, confidence: opts.confidenceAt[k]! } : w,
  );
  const toks = toHeardTokens(words, strictness);
  const ops = alignWindow(toks, expected);
  const result = classifyOps(ops, {
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
    heardConfidenceFloor: 0,
    ...opts.ctx,
  });
  return { ...result, ops };
}
const wordCount = (text: string) => heard(text).length;

const L4_FEELING = 'Anyone can play accurately, but I play with wonderful feeling.';

describe('classifyOps', () => {
  it('finds nothing in a perfect run', () => {
    const r = classify(perf('L1', 'L2', 'L3', 'L4', 'L5'));
    expect(r.notes).toEqual([]);
    expect(r.stumbles).toEqual([]);
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

  it('poor audio quality turns a dropped line into a check', () => {
    const { notes } = classify(perf('L1', 'L2', 'L4', 'L5'), { ctx: { audioQuality: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ category: 'dropped-line', confidence: 0.475, status: 'check' })]);
  });

  it('ignores differences inside overlap zones', () => {
    const lines = EARNEST.map((l) => (l.id === 'L2' ? { ...l, overlapRanges: [[4, 8]] as Array<[number, number]> } : l));
    const text = [perf('L1'), "I didn't think it rather mumbled noise here", perf('L3', 'L4', 'L5')].join(' ');
    expect(classify(text, { lines }).notes).toEqual([]);
  });
});

describe('classifyOps: note metadata and confidence', () => {
  it('records which ops each note came from', () => {
    const r = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '));
    const m = r.meta.get(r.notes[0]!)!;
    expect(m.quiet).toBe(false);
    expect(r.ops[m.from]).toMatchObject({ kind: 'sub' });
    expect(m.to).toBe(m.from);
  });

  it('a heard-confidence floor softens the penalty on content words only', () => {
    const content = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), {
      heardOpts: { confidence: 0.5 },
      ctx: { heardConfidenceFloor: 0.6 },
    });
    expect(content.notes).toEqual([expect.objectContaining({ category: 'wrong-words', status: 'note', confidence: 0.68 })]);
    const fn = classify(['Did you hear what a was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '), {
      heardOpts: { confidence: 0.5 },
      ctx: { heardConfidenceFloor: 0.6 },
    });
    expect(fn.notes.length).toBeGreaterThan(0);
    expect(fn.notes.every((n) => n.status === 'check')).toBe(true);
  });

  it('the default floor (0) keeps the full penalty: today\u2019s behaviour', () => {
    const r = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { heardOpts: { confidence: 0.5 } });
    expect(r.notes).toEqual([expect.objectContaining({ status: 'check', confidence: 0.425 })]);
  });

  it('a misheard function word no longer downgrades a real wrong word beside it (per-pair similarity)', () => {
    // "I don't" → "a dreadful": "a"/"I" sounds alike (unsure, 0.6), "dreadful"/"don't" does not (confident, 0.97).
    const before = wordCount([perf('L1', 'L2'), "I'm sorry for that, for your sake."].join(' '));
    const r = classify([perf('L1', 'L2'), "I'm sorry for that, for your sake. a dreadful play accurately.", perf('L4', 'L5')].join(' '), {
      confidenceAt: { [before]: 0.6, [before + 1]: 0.97 },
    });
    expect(r.notes).toEqual([expect.objectContaining({ lineId: 'L3', category: 'wrong-words', status: 'note' })]);
  });

  it('a similar-sounding substitution is downgraded only when the recognizer was unsure of it', () => {
    const at = wordCount(perf('L1', 'L2', 'L3', 'L4')) + 1; // the word after "Yes"
    const text = `${perf('L1', 'L2', 'L3', 'L4')} Yes, sore.`;
    expect(classify(text, { confidenceAt: { [at]: 0.95 } }).notes).toEqual([expect.objectContaining({ heard: 'sore', status: 'note' })]);
    expect(classify(text, { confidenceAt: { [at]: 0.6 } }).notes).toEqual([expect.objectContaining({ heard: 'sore', status: 'check' })]);
  });
});

describe('classifyOps: dropped words', () => {
  const DROP_SAKE = [perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ');

  it('follows the confidence of the heard words around the gap', () => {
    expect(classify(DROP_SAKE).notes).toEqual([expect.objectContaining({ category: 'dropped-words', status: 'note', confidence: 0.8 })]);
    expect(classify(DROP_SAKE, { heardOpts: { confidence: 0.5 } }).notes).toEqual([
      expect.objectContaining({ category: 'dropped-words', status: 'check', confidence: 0.4 }),
    ]);
  });

  it('is less believable next to another mismatch', () => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with marvellous.', perf('L5')].join(' ');
    const del = classify(text).notes.find((n) => n.category === 'dropped-words')!;
    expect(del).toMatchObject({ status: 'check', confidence: 0.48 });
  });

  it('a dropped run with fewer than 2 content words is quiet (never alerts)', () => {
    const r = classify(DROP_SAKE); // "for your sake": one content word
    expect(r.meta.get(r.notes[0]!)!.quiet).toBe(true);
  });

  it('a dropped run with 2+ content words may alert', () => {
    const r = classify([perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with.', perf('L5')].join(' '));
    const del = r.notes.find((n) => n.category === 'dropped-words')!;
    expect(del.expected).toBe('wonderful expression');
    expect(r.meta.get(del)!.quiet).toBe(false);
  });
});

describe('classifyOps: recognizer fragments and confidence counted once (pass spec §8a)', () => {
  const CIG: ScriptLineInput[] = [
    { id: 'C1', characterId: 'JACK', text: 'I simply want my cigarette case back.' },
    { id: 'C2', characterId: 'ALGY', text: 'Here it is.' },
  ];

  it('isFragment: a strict leading prefix of 2+ letters', () => {
    expect(isFragment('cigar', 'cigarette')).toBe(true);
    expect(isFragment('de', 'dear')).toBe(true);
    expect(isFragment('d', 'dear')).toBe(false);
    expect(isFragment('dear', 'dear')).toBe(false);
    expect(isFragment('impression', 'expression')).toBe(false);
  });

  it('a heard leading fragment of the scripted word is a quiet check, not a note', () => {
    const r = classify('I simply want my cigar case back. Here it is.', { lines: CIG });
    expect(r.notes).toEqual([expect.objectContaining({ category: 'wrong-words', expected: 'cigarette', heard: 'cigar', status: 'check' })]);
    expect(r.meta.get(r.notes[0]!)!.quiet).toBe(true);
  });

  it('a different word is still a note', () => {
    const r = classify('I simply want my silver case back. Here it is.', { lines: CIG });
    expect(r.notes).toEqual([expect.objectContaining({ heard: 'silver', status: 'note' })]);
  });

  it('audio quality no longer scales notes that have heard words', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { ctx: { audioQuality: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ category: 'wrong-words', status: 'note', confidence: 0.85 })]);
  });

  it('audio quality still scales a dropped line', () => {
    const { notes } = classify(perf('L1', 'L2', 'L4', 'L5'), { ctx: { audioQuality: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ category: 'dropped-line', confidence: 0.475, status: 'check' })]);
  });

  it('dropped-words use neighbour evidence only, not audio quality', () => {
    const DROP_SAKE = [perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ');
    expect(classify(DROP_SAKE, { ctx: { audioQuality: 0.5 } }).notes).toEqual([
      expect.objectContaining({ category: 'dropped-words', confidence: 0.8 }),
    ]);
  });
});
