import { describe, expect, it } from 'vitest';
import { applyEdit, pruneCharacters } from '../../src/edit/apply';
import { nextUnitId, uniqueCharacterId } from '../../src/edit/ids';
import { EditError } from '../../src/edit/ops';
import { byId, ids, scene } from './fixture';

describe('confirm', () => {
  it('sets confidence to 1 on the listed units only, reusing the others', () => {
    const s = scene();
    const next = applyEdit(s, { type: 'confirm', unitIds: ['u1'] });
    expect(byId(next, 'u1').tagConfidence).toBe(1);
    expect(next.units[1]).toBe(s.units[1]);
    expect(s.units[0].tagConfidence).toBe(0.5);
  });

  it('refuses unknown ids and empty selections', () => {
    expect(() => applyEdit(scene(), { type: 'confirm', unitIds: ['nope'] })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'confirm', unitIds: [] })).toThrow(EditError);
  });
});

describe('setKind', () => {
  it('turns a heading guess into front matter', () => {
    const next = applyEdit(scene(), { type: 'setKind', unitIds: ['u1'], kind: 'frontMatter' });
    expect(byId(next, 'u1')).toMatchObject({ kind: 'frontMatter', tagConfidence: 1 });
  });

  it('drops the speaker and overlap when a speech becomes a direction, pruning the emptied character', () => {
    const s = scene();
    s.units[7] = { ...s.units[7], overlapRanges: [[0, 2]] };
    const next = applyEdit(s, { type: 'setKind', unitIds: ['u8'], kind: 'direction' });
    expect(byId(next, 'u8').characterId).toBeUndefined();
    expect(byId(next, 'u8').overlapRanges).toBeUndefined();
    expect(next.characters.map((c) => c.id)).toEqual(['algernon', 'lane']);
  });

  it('keeps an emptied character that is in the cast list', () => {
    const next = applyEdit(scene(), { type: 'setKind', unitIds: ['u8'], kind: 'direction' }, { keep: ['okay'] });
    expect(next.characters.map((c) => c.id)).toContain('okay');
  });
});

describe('editText', () => {
  it('replaces and trims the text and clears overlap marks', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], overlapRanges: [[1, 3]] };
    const next = applyEdit(s, { type: 'editText', unitId: 'u4', text: '  Did you hear me?  ' });
    expect(byId(next, 'u4')).toMatchObject({ text: 'Did you hear me?', tagConfidence: 1 });
    expect(byId(next, 'u4').overlapRanges).toBeUndefined();
  });

  it('refuses empty text', () => {
    expect(() => applyEdit(scene(), { type: 'editText', unitId: 'u4', text: '   ' })).toThrow(/Remove/);
  });
});

describe('remove, setCut and scene breaks', () => {
  it('removes units but never the last one', () => {
    expect(ids(applyEdit(scene(), { type: 'remove', unitIds: ['u1', 'u2'] }))[0]).toBe('u3');
    expect(() => applyEdit(scene(), { type: 'remove', unitIds: ids(scene()) })).toThrow(/at least one/);
  });

  it('cuts and uncuts whole units', () => {
    const cut = applyEdit(scene(), { type: 'setCut', unitIds: ['u4', 'u6'], cut: true });
    expect([byId(cut, 'u4').cut, byId(cut, 'u6').cut, byId(cut, 'u8').cut]).toEqual([true, true, false]);
    expect(byId(applyEdit(cut, { type: 'setCut', unitIds: ['u4'], cut: false }), 'u4').cut).toBe(false);
  });

  it('inserts a scene break before a unit with the next free id and removes it again', () => {
    const s = scene();
    expect(nextUnitId(s)).toBe('u11');
    const next = applyEdit(s, { type: 'insertSceneBreak', beforeUnitId: 'u5' });
    expect(next.units[4]).toEqual({ id: 'u11', kind: 'sceneBreak', text: '* * *', cut: false, tagConfidence: 1, source: [{ page: 1, line: 5 }] });
    expect(ids(applyEdit(next, { type: 'removeSceneBreak', unitId: 'u11' }))).toEqual(ids(s));
    expect(() => applyEdit(s, { type: 'removeSceneBreak', unitId: 'u4' })).toThrow(EditError);
  });
});

describe('batch', () => {
  it('applies every op or none', () => {
    const s = scene();
    const both = applyEdit(s, { type: 'batch', ops: [{ type: 'confirm', unitIds: ['u1'] }, { type: 'confirm', unitIds: ['u7'] }] });
    expect([byId(both, 'u1').tagConfidence, byId(both, 'u7').tagConfidence]).toEqual([1, 1]);
    expect(() => applyEdit(s, { type: 'batch', ops: [{ type: 'confirm', unitIds: ['u1'] }, { type: 'confirm', unitIds: ['x'] }] })).toThrow(EditError);
    expect(byId(s, 'u1').tagConfidence).toBe(0.5);
  });
});

describe('ids and pruning', () => {
  it('makes unique character ids', () => {
    expect(uniqueCharacterId(scene(), 'Lady Bracknell')).toBe('lady-bracknell');
    expect(uniqueCharacterId(scene(), 'Lane')).toBe('lane-2');
  });

  it('pruneCharacters drops characters without dialogue unless kept', () => {
    const s = { ...scene(), characters: [...scene().characters, { id: 'jack', name: 'JACK', aliases: [] }] };
    expect(pruneCharacters(s, []).characters.map((c) => c.id)).toEqual(['algernon', 'lane', 'okay']);
    expect(pruneCharacters(s, ['jack']).characters.map((c) => c.id)).toContain('jack');
  });
});
