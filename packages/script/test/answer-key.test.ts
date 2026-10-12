import { describe, expect, it } from 'vitest';
import { toAnswerKey } from '../src/answer-key';
import { scene, unit } from './edit/fixture';

describe('toAnswerKey', () => {
  it('lists every unit in order with its first source page, and the cast', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], cut: true, source: [{ page: 2, line: 9 }] };
    s.units.push(unit('u11', 'direction', 'Exit.', { source: [] }));
    const key = toAnswerKey(s, 0);
    expect(key.pages).toBe(1);
    expect(key.cast).toEqual(s.characters);
    expect(key.cast[0]).not.toBe(s.characters[0]);
    expect(key.units[3]).toEqual({ kind: 'dialogue', characterId: 'algernon', text: 'Did you hear what I was playing, Lane?', page: 2 });
    expect(key.units[0]).toEqual({ kind: 'heading', text: "Morning-room in Algernon's flat", page: 1 });
    expect(key.units[10].page).toBe(1);
    expect(key.units).toHaveLength(11);
  });
});
