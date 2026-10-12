import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../src/edit/apply';
import { EditError } from '../../src/edit/ops';
import { byId, ids, scene } from './fixture';

describe('split', () => {
  it('splits before a word; the second piece gets the next id and keeps kind, speaker and source', () => {
    const next = applyEdit(scene(), { type: 'split', unitId: 'u4', atWord: 3 });
    expect(ids(next).slice(3, 5)).toEqual(['u4', 'u11']);
    expect(byId(next, 'u4')).toMatchObject({ text: 'Did you hear', characterId: 'algernon', tagConfidence: 1 });
    expect(byId(next, 'u11')).toMatchObject({ text: 'what I was playing, Lane?', characterId: 'algernon', kind: 'dialogue', source: [{ page: 1, line: 4 }] });
  });

  it('divides overlap ranges between the pieces', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], overlapRanges: [[1, 4]] };
    const next = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 2 });
    expect(byId(next, 'u4').overlapRanges).toEqual([[1, 2]]);
    expect(byId(next, 'u11').overlapRanges).toEqual([[0, 2]]);
  });

  it('refuses a split at the first word or past the last', () => {
    expect(() => applyEdit(scene(), { type: 'split', unitId: 'u4', atWord: 0 })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'split', unitId: 'u4', atWord: 8 })).toThrow(EditError);
  });
});

describe('join', () => {
  it('undoes a split, restoring text and overlap ranges', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], overlapRanges: [[1, 4]] };
    const split = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 2 });
    const joined = applyEdit(split, { type: 'join', unitId: 'u11' });
    expect(byId(joined, 'u4')).toMatchObject({ text: s.units[3].text, overlapRanges: [[1, 4]] });
    expect(byId(joined, 'u4').source).toEqual([
      { page: 1, line: 4 },
      { page: 1, line: 4 },
    ]);
    expect(ids(joined)).toEqual(ids(s));
  });

  it('keeps the first unit’s kind and speaker', () => {
    const next = applyEdit(scene(), { type: 'join', unitId: 'u8' });
    expect(byId(next, 'u7')).toMatchObject({ kind: 'characterName', text: "OKAY. I'm sorry for that, for your sake." });
    expect(byId(next, 'u7').characterId).toBeUndefined();
  });

  it('refuses the first unit', () => {
    expect(() => applyEdit(scene(), { type: 'join', unitId: 'u1' })).toThrow(EditError);
  });
});

describe('setCutWords', () => {
  it('cuts words in the middle of a speech by splitting around them', () => {
    const next = applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 2, to: 4, cut: true });
    const piece = next.units.slice(3, 6).map((u) => [u.text, u.cut]);
    expect(piece).toEqual([
      ['Did you', false],
      ['hear what', true],
      ['I was playing, Lane?', false],
    ]);
  });

  it('cuts the start of a speech with one split, and a whole speech with none', () => {
    const start = applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 0, to: 2, cut: true });
    expect(start.units.slice(3, 5).map((u) => [u.text, u.cut])).toEqual([
      ['Did you', true],
      ['hear what I was playing, Lane?', false],
    ]);
    const whole = applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 0, to: 8, cut: true });
    expect(ids(whole)).toEqual(ids(scene()));
    expect(byId(whole, 'u4').cut).toBe(true);
  });

  it('refuses an empty or out-of-range selection', () => {
    expect(() => applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 3, to: 3, cut: true })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 0, to: 9, cut: true })).toThrow(EditError);
  });
});

describe('setOverlap', () => {
  it('adds, merges and removes overlap ranges on speech', () => {
    const on = applyEdit(scene(), { type: 'setOverlap', unitId: 'u4', from: 1, to: 3, on: true });
    const more = applyEdit(on, { type: 'setOverlap', unitId: 'u4', from: 3, to: 5, on: true });
    expect(byId(more, 'u4').overlapRanges).toEqual([[1, 5]]);
    const less = applyEdit(more, { type: 'setOverlap', unitId: 'u4', from: 2, to: 4, on: false });
    expect(byId(less, 'u4').overlapRanges).toEqual([
      [1, 2],
      [4, 5],
    ]);
    const none = applyEdit(less, { type: 'setOverlap', unitId: 'u4', from: 0, to: 8, on: false });
    expect(byId(none, 'u4').overlapRanges).toBeUndefined();
  });

  it('refuses non-speech units', () => {
    expect(() => applyEdit(scene(), { type: 'setOverlap', unitId: 'u2', from: 0, to: 1, on: true })).toThrow(/speech/);
  });
});
