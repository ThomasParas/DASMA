import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../src/edit/apply';
import { appendScripts } from '../../src/edit/append';
import { checkQueue } from '../../src/edit/check';
import { similarUnits } from '../../src/edit/similar';
import type { Script, UnitHint } from '../../src/types';
import { scene, unit } from './fixture';

describe('checkQueue', () => {
  it('lists unsure units in script order with a reason', () => {
    expect(checkQueue(scene())).toEqual([
      { unitId: 'u1', kind: 'heading', reason: 'heading' },
      { unitId: 'u7', kind: 'characterName', reason: 'newCharacter' },
      { unitId: 'u8', kind: 'dialogue', reason: 'newCharacter' },
    ]);
  });

  it('flags a speech without a speaker, and drops items once confirmed', () => {
    const s = scene();
    s.units[9] = { ...s.units[9], characterId: undefined, tagConfidence: 0.3 };
    expect(checkQueue(s).find((q) => q.unitId === 'u10')?.reason).toBe('noSpeaker');
    const fixed = applyEdit(s, { type: 'confirm', unitIds: ['u1', 'u7', 'u8', 'u10'] });
    expect(checkQueue(fixed)).toEqual([]);
  });

  it('calls other unsure units "unsure"', () => {
    const s = scene();
    s.units[1] = { ...s.units[1], tagConfidence: 0.5 };
    expect(checkQueue(s)[1]).toEqual({ unitId: 'u2', kind: 'direction', reason: 'unsure' });
  });
});

describe('similarUnits', () => {
  // word-3: missed speeches all sat on one leading-tab band and were read as directions.
  const tabbed = (): Script => ({
    title: 'T',
    characters: [],
    units: [
      unit('u1', 'direction', 'I told you so.'),
      unit('u2', 'direction', 'You never did.'),
      unit('u3', 'direction', '(She exits.)'),
      unit('u4', 'direction', 'Yes I did.'),
    ],
  });
  const hints: Record<string, UnitHint> = {
    u1: { band: 36, italic: false },
    u2: { band: 36, italic: false },
    u3: { band: 72, italic: true },
    u4: { band: 36, italic: false },
  };

  it('finds the other unsure units with the same reason, kind and band', () => {
    expect(similarUnits(tabbed(), hints, 'u1')).toEqual(['u2', 'u4']);
  });

  it('ignores bands when hints are missing (.dasma imports)', () => {
    expect(similarUnits(tabbed(), {}, 'u1')).toEqual(['u2', 'u3', 'u4']);
  });

  it('groups the unsure name units of a fake character', () => {
    const s = scene();
    s.units.push(unit('u11', 'characterName', 'Okay.', { tagConfidence: 0.4 }), unit('u12', 'dialogue', 'Fine.', { characterId: 'lane', tagConfidence: 0.95 }));
    expect(similarUnits(s, {}, 'u7')).toEqual([]);
    const two: Script = { ...s, units: s.units.map((u) => (u.id === 'u12' ? { ...u, characterId: 'okay', tagConfidence: 0.5 } : u)) };
    expect(similarUnits(two, {}, 'u7')).toEqual(['u11']);
  });

  it('returns nothing for a unit that is not in the queue', () => {
    expect(similarUnits(scene(), {}, 'u4')).toEqual([]);
  });

  it('lets split pieces inherit the hint of the unit they came from (spec §4)', () => {
    const s = tabbed();
    s.units.push({ ...s.units[3], id: 'u5', text: 'Again.' }); // the second piece of a split shares u4's source
    s.units.push(unit('u6', 'direction', 'Later.', { source: [{ page: 2, line: 1 }] }));
    expect(similarUnits(s, hints, 'u1')).toEqual(['u2', 'u4', 'u5', 'u6']);
    expect(similarUnits(s, { ...hints, u6: { band: 72, italic: true } }, 'u1')).toEqual(['u2', 'u4', 'u5']);
  });
});

describe('appendScripts', () => {
  it('renumbers the second script’s units, shifts its pages and merges characters', () => {
    const b: Script = {
      title: 'Act 2',
      characters: [
        { id: 'lane', name: 'LANE', aliases: ['L'] },
        { id: 'jack', name: 'JACK', aliases: [] },
      ],
      units: [unit('u1', 'characterName', 'JACK'), unit('u2', 'dialogue', 'Hello.', { characterId: 'jack' })],
    };
    const joined = appendScripts(scene(), b, 3);
    expect(joined.title).toBe('Earnest');
    expect(joined.units.slice(10).map((u) => [u.id, u.source[0].page])).toEqual([
      ['u11', 4],
      ['u12', 4],
    ]);
    expect(joined.characters.map((c) => [c.id, c.aliases])).toEqual([
      ['algernon', ['ALGY']],
      ['lane', ['L']],
      ['okay', []],
      ['jack', []],
    ]);
  });
});
