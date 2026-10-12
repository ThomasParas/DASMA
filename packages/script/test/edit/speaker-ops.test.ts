import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../src/edit/apply';
import { uniqueCharacterId } from '../../src/edit/ids';
import { EditError } from '../../src/edit/ops';
import { aliasSpeeches, speechReach } from '../../src/edit/speaker-ops';
import type { Script } from '../../src/types';
import { byId, scene, unit } from './fixture';

const charIds = (s: Script): string[] => s.characters.map((c) => c.id);

describe('speechReach', () => {
  it('is the dialogue after a unit up to the next name, heading or scene break', () => {
    expect(speechReach(scene().units, 6)).toEqual([7]);
    expect(speechReach(scene().units, 0)).toEqual([]);
  });
});

describe('speechBy', () => {
  it('turns a missed speech into dialogue by the chosen character', () => {
    const next = applyEdit(scene(), { type: 'speechBy', unitIds: ['u2'], characterId: 'lane' });
    expect(byId(next, 'u2')).toMatchObject({ kind: 'dialogue', characterId: 'lane', tagConfidence: 1 });
  });

  it('on a fake name ("OKAY.") reassigns the speech that followed and prunes the fake character', () => {
    const next = applyEdit(scene(), { type: 'speechBy', unitIds: ['u7'], characterId: 'lane' });
    expect(byId(next, 'u7')).toMatchObject({ kind: 'dialogue', characterId: 'lane', text: 'OKAY.' });
    expect(byId(next, 'u8')).toMatchObject({ characterId: 'lane', tagConfidence: 1 });
    expect(charIds(next)).toEqual(['algernon', 'lane']);
  });

  it('refuses an unknown character', () => {
    expect(() => applyEdit(scene(), { type: 'speechBy', unitIds: ['u2'], characterId: 'jack' })).toThrow(EditError);
  });
});

describe('newCharacter', () => {
  it('adds a character that a batched speechBy can use', () => {
    const s = scene();
    const id = uniqueCharacterId(s, 'Lady Bracknell');
    const next = applyEdit(s, {
      type: 'batch',
      ops: [
        { type: 'newCharacter', id, name: ' Lady Bracknell ' },
        { type: 'speechBy', unitIds: ['u2'], characterId: id },
      ],
    });
    expect(next.characters.find((c) => c.id === id)).toEqual({ id: 'lady-bracknell', name: 'Lady Bracknell', aliases: [] });
    expect(byId(next, 'u2').characterId).toBe('lady-bracknell');
  });

  it('refuses a used id or an empty name', () => {
    expect(() => applyEdit(scene(), { type: 'newCharacter', id: 'lane', name: 'Lane' })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'newCharacter', id: 'x', name: '  ' })).toThrow(EditError);
  });
});

describe('setName', () => {
  it('makes a unit a character name and gives the following speech to that character', () => {
    const next = applyEdit(scene(), { type: 'setName', unitId: 'u7', characterId: 'algernon' });
    expect(byId(next, 'u7')).toMatchObject({ kind: 'characterName', tagConfidence: 1 });
    expect(byId(next, 'u7').characterId).toBeUndefined();
    expect(byId(next, 'u8').characterId).toBe('algernon');
    expect(charIds(next)).toEqual(['algernon', 'lane']);
  });
});

describe('moveSpeeches', () => {
  it('reassigns selected speeches and refuses non-speech units', () => {
    expect(byId(applyEdit(scene(), { type: 'moveSpeeches', unitIds: ['u10'], characterId: 'lane' }), 'u10').characterId).toBe('lane');
    expect(() => applyEdit(scene(), { type: 'moveSpeeches', unitIds: ['u9'], characterId: 'lane' })).toThrow(EditError);
  });
});

describe('character edits', () => {
  it('renames without changing the id', () => {
    const next = applyEdit(scene(), { type: 'renameCharacter', characterId: 'okay', name: 'Mrs Okay' });
    expect(next.characters.find((c) => c.id === 'okay')!.name).toBe('Mrs Okay');
    expect(() => applyEdit(scene(), { type: 'renameCharacter', characterId: 'okay', name: ' ' })).toThrow(EditError);
  });

  it('cleans aliases: trimmed, de-duplicated, never the name itself', () => {
    const next = applyEdit(scene(), { type: 'editAliases', characterId: 'algernon', aliases: ['algy', ' ALGY ', '', 'Algernon', 'MONCRIEFF'] });
    expect(next.characters.find((c) => c.id === 'algernon')!.aliases).toEqual(['algy', 'MONCRIEFF']);
  });

  it('merges one character into another', () => {
    const next = applyEdit(scene(), { type: 'mergeCharacters', fromId: 'okay', intoId: 'lane' });
    expect(byId(next, 'u8').characterId).toBe('lane');
    expect(next.characters.find((c) => c.id === 'lane')!.aliases).toEqual(['OKAY']);
    expect(charIds(next)).toEqual(['algernon', 'lane']);
    expect(() => applyEdit(scene(), { type: 'mergeCharacters', fromId: 'lane', intoId: 'lane' })).toThrow(EditError);
  });
});

describe('splitAlias', () => {
  const capulets = (): Script => ({
    title: 'R&J',
    characters: [{ id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: ['CAPULET'] }],
    units: [
      unit('u1', 'characterName', 'CAPULET.'),
      unit('u2', 'dialogue', 'Welcome, gentlemen!', { characterId: 'capulet-s-cousin' }),
      unit('u3', 'characterName', "CAPULET'S COUSIN."),
      unit('u4', 'dialogue', "By'r lady, thirty years.", { characterId: 'capulet-s-cousin' }),
    ],
  });

  it('finds the speeches cued by an alias through name units', () => {
    expect(aliasSpeeches(capulets(), {}, 'capulet-s-cousin', 'CAPULET')).toEqual(['u2']);
  });

  it('finds inline-cued speeches through hints (MAX → MAXINE)', () => {
    const s: Script = {
      title: 'T',
      characters: [{ id: 'maxine', name: 'MAXINE', aliases: ['MAX'] }],
      units: [unit('u1', 'dialogue', 'Hi.', { characterId: 'maxine' }), unit('u2', 'dialogue', 'Bye.', { characterId: 'maxine' })],
    };
    const hints = { u1: { band: 72, italic: false, cue: 'MAX' }, u2: { band: 72, italic: false, cue: 'MAXINE' } };
    expect(aliasSpeeches(s, hints, 'maxine', 'max')).toEqual(['u1']);
  });

  it('splits an alias out into its own character with its speeches', () => {
    const s = capulets();
    const newId = uniqueCharacterId(s, 'CAPULET');
    const next = applyEdit(s, { type: 'splitAlias', characterId: 'capulet-s-cousin', alias: 'capulet', newId, unitIds: ['u2'] });
    expect(next.characters).toEqual([
      { id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: [] },
      { id: 'capulet', name: 'CAPULET', aliases: [] },
    ]);
    expect(byId(next, 'u2').characterId).toBe('capulet');
    expect(byId(next, 'u4').characterId).toBe('capulet-s-cousin');
  });

  it('refuses an alias the character does not have', () => {
    expect(() => applyEdit(capulets(), { type: 'splitAlias', characterId: 'capulet-s-cousin', alias: 'TYBALT', newId: 'tybalt', unitIds: [] })).toThrow(EditError);
  });
});
