import { describe, expect, it } from 'vitest';
import { aliasSpeeches, applyEdit, uniqueCharacterId, type Script } from '../../src/index';
import { byId, scene, unit } from './fixture';

describe('each M2a mistake is fixed by one action', () => {
  it('missedSpeech: a speech read as a direction', () => {
    expect(byId(applyEdit(scene(), { type: 'speechBy', unitIds: ['u2'], characterId: 'lane' }), 'u2')).toMatchObject({ kind: 'dialogue', characterId: 'lane' });
  });

  it('inventedCharacter (risk I2): "OKAY." read as a speaker', () => {
    const next = applyEdit(scene(), { type: 'speechBy', unitIds: ['u7'], characterId: 'lane' });
    expect(next.characters.map((c) => c.id)).not.toContain('okay');
  });

  it('wrongSpeaker: CAPULET silently merged into CAPULET’S COUSIN', () => {
    const s: Script = {
      title: 'R&J',
      characters: [{ id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: ['CAPULET'] }],
      units: [unit('u1', 'characterName', 'CAPULET.'), unit('u2', 'dialogue', 'Welcome!', { characterId: 'capulet-s-cousin' })],
    };
    const unitIds = aliasSpeeches(s, {}, 'capulet-s-cousin', 'CAPULET');
    const next = applyEdit(s, { type: 'splitAlias', characterId: 'capulet-s-cousin', alias: 'CAPULET', newId: uniqueCharacterId(s, 'CAPULET'), unitIds });
    expect(byId(next, 'u2').characterId).toBe('capulet');
  });

  it('inventedHeading: a title page line read as a heading', () => {
    expect(byId(applyEdit(scene(), { type: 'setKind', unitIds: ['u1'], kind: 'frontMatter' }), 'u1').kind).toBe('frontMatter');
  });

  it('merge: two speeches run together', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], text: 'Did you hear what I was playing, Lane? LANE I did.' };
    const next = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 8 });
    expect(next.units[4].text).toBe('LANE I did.');
  });

  it('split: one speech cut in two', () => {
    const s = scene();
    const split = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 3 });
    expect(byId(applyEdit(split, { type: 'join', unitId: 'u11' }), 'u4').text).toBe(s.units[3].text);
  });

  it('inventedSpeech and bad text: junk removed, a misread word corrected', () => {
    expect(applyEdit(scene(), { type: 'remove', unitIds: ['u2'] }).units).toHaveLength(9);
    expect(byId(applyEdit(scene(), { type: 'editText', unitId: 'u10', text: "I don't play accurately—" }), 'u10').text).toBe("I don't play accurately—");
  });
});
