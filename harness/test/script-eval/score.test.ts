import type { Script, Unit } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import type { TruthFile, TruthUnit } from '../../src/corpus/types';
import { alignWords, resolveCast, scoreDocument, wordErrors } from '../../src/script-eval/score';

const CAST = [
  { id: 'hamlet', name: 'HAMLET', aliases: ['HAM'] },
  { id: 'horatio', name: 'HORATIO', aliases: [] },
];
const truthOf = (units: TruthUnit[], pages = 2): TruthFile => ({ docId: 'd', family: 'licensed', play: 'p', variant: '1', seed: 1, format: 'pdf', pages, cast: CAST, units });
const T: TruthUnit[] = [
  { kind: 'heading', text: 'ACT I', page: 1 },
  { kind: 'characterName', text: 'HAMLET', page: 1 },
  { kind: 'dialogue', characterId: 'hamlet', text: 'To be or not to be', page: 1 },
  { kind: 'direction', text: '(He sits.)', page: 1 },
  { kind: 'characterName', text: 'HORATIO', page: 2 },
  { kind: 'dialogue', characterId: 'horatio', text: 'My lord I come', page: 2 },
];
let n = 0;
const pu = (kind: Unit['kind'], text: string, page = 1, opts: Partial<Unit> = {}): Unit => ({
  id: `u${++n}`,
  kind,
  text,
  cut: false,
  tagConfidence: 0.95,
  source: [{ page, line: 0 }],
  ...opts,
});
const PRED_CAST = [
  { id: 'hamlet', name: 'HAMLET', aliases: [] },
  { id: 'horatio', name: 'HORATIO', aliases: [] },
];
const scriptOf = (units: Unit[], characters = PRED_CAST): Script => ({ title: 't', characters, units });
const perfect = (): Unit[] => [
  pu('heading', 'ACT I'),
  pu('characterName', 'HAMLET'),
  pu('dialogue', 'To be or not to be', 1, { characterId: 'hamlet' }),
  pu('direction', '(He sits.)'),
  pu('characterName', 'HORATIO', 2),
  pu('dialogue', 'My lord I come', 2, { characterId: 'horatio' }),
];
const kinds = (s: { fixes: Array<{ kind: string }> }) => s.fixes.map((f) => f.kind).sort();

describe('scoreDocument', () => {
  it('scores a perfect import as no fixes', () => {
    const s = scoreDocument(truthOf(T), scriptOf(perfect()));
    expect(s).toMatchObject({ fixes: [], fixesByPage: [0, 0], spokenUnits: 2, speakerRight: 2, falseFlags: 0, spokenWords: 10, textErrors: 0 });
  });

  it('counts a wrong speaker on its page, flagged or not', () => {
    const units = perfect();
    units[5] = { ...units[5], characterId: 'hamlet' };
    const s = scoreDocument(truthOf(T), scriptOf(units));
    expect(s.fixes).toEqual([{ kind: 'wrongSpeaker', page: 2, flagged: false, truthUnit: 5, predictedUnit: 5 }]);
    expect([s.speakerRight, s.fixesByPage]).toEqual([1, [0, 1]]);
    units[5] = { ...units[5], tagConfidence: 0.5 };
    const flagged = scoreDocument(truthOf(T), scriptOf(units));
    expect(flagged.fixes[0].flagged).toBe(true);
    expect(flagged.falseFlags).toBe(0);
  });

  it('counts a flagged unit that needs no fix as a false flag', () => {
    const units = perfect();
    units[3] = { ...units[3], tagConfidence: 0.5 };
    expect(scoreDocument(truthOf(T), scriptOf(units))).toMatchObject({ fixes: [], falseFlags: 1 });
  });

  it('needs a split when an inline direction was read as speech', () => {
    const truth = truthOf([
      { kind: 'characterName', text: 'HAMLET', page: 1 },
      { kind: 'dialogue', characterId: 'hamlet', text: 'To be or not to be', page: 1 },
      { kind: 'direction', text: '(aside)', page: 1 },
      { kind: 'dialogue', characterId: 'hamlet', text: 'that is the question', page: 1 },
    ]);
    const s = scoreDocument(truth, scriptOf([pu('characterName', 'HAMLET'), pu('dialogue', 'To be or not to be (aside) that is the question', 1, { characterId: 'hamlet' })]));
    expect(kinds(s)).toEqual(['split']);
    expect(s.textErrors).toBe(1);
  });

  it('needs a merge when one speech was cut in two', () => {
    const truth = truthOf([
      { kind: 'characterName', text: 'HAMLET', page: 1 },
      { kind: 'dialogue', characterId: 'hamlet', text: 'To be or not to be that is the question', page: 1 },
    ]);
    const s = scoreDocument(
      truth,
      scriptOf([pu('characterName', 'HAMLET'), pu('dialogue', 'To be or not to be', 1, { characterId: 'hamlet' }), pu('dialogue', 'that is the question', 1, { characterId: 'hamlet' })]),
    );
    expect(s.fixes.map((f) => [f.kind, f.predictedUnit])).toEqual([['merge', 2]]);
  });

  it('counts a missed speech, owned by the unit that holds its words', () => {
    const units = perfect();
    units[5] = { ...units[5], kind: 'direction', characterId: undefined };
    const s = scoreDocument(truthOf(T), scriptOf(units));
    expect(s.fixes).toEqual([{ kind: 'missedSpeech', page: 2, flagged: false, truthUnit: 5, predictedUnit: 5 }]);
    expect([s.speakerRight, s.textErrors]).toEqual([1, 4]);
  });

  it('counts an invented heading and the speech it swallowed', () => {
    const truth = truthOf([
      { kind: 'characterName', text: 'HORATIO', page: 1 },
      { kind: 'dialogue', characterId: 'horatio', text: 'Scene of the crime I say', page: 1 },
    ]);
    const s = scoreDocument(truth, scriptOf([pu('characterName', 'HORATIO'), pu('heading', 'Scene of the crime I say')]));
    expect(kinds(s)).toEqual(['inventedHeading', 'missedSpeech']);
  });

  it('counts a missed heading read as speech, and the invented speech', () => {
    const units = perfect();
    units[0] = { ...units[0], kind: 'dialogue' };
    const s = scoreDocument(truthOf(T), scriptOf(units));
    expect(kinds(s)).toEqual(['inventedSpeech', 'missedHeading']);
    expect(s.textErrors).toBe(2);
  });

  it('resolves predicted characters through truth aliases', () => {
    const units = perfect();
    units[2] = { ...units[2], characterId: 'ham' };
    const s = scoreDocument(truthOf(T), scriptOf(units, [{ id: 'ham', name: 'HAM', aliases: [] }, PRED_CAST[1]]));
    expect(s.fixes).toEqual([]);
  });
});

describe('helpers', () => {
  it('resolveCast maps by name or alias', () => {
    expect([...resolveCast([{ id: 'x', name: 'Ham.', aliases: [] }, { id: 'y', name: 'NOBODY', aliases: [] }], CAST)]).toEqual([['x', 'hamlet']]);
  });

  it('wordErrors counts each run of differences as its larger side', () => {
    expect(wordErrors(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(wordErrors(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    expect(wordErrors(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(wordErrors(['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e'])).toBe(2);
  });

  it('alignWords pairs the common words in order', () => {
    expect(alignWords(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });
});
