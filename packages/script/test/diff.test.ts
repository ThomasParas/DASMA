import { describe, expect, it } from 'vitest';
import { carryOver, diffScripts, similarity } from '../src/diff';
import type { Script, Unit } from '../src/types';
import { FLAG_BELOW } from '../src/weights';

const u = (id: string, kind: Unit['kind'], text: string, extra: Partial<Unit> = {}): Unit => ({
  id,
  kind,
  text,
  cut: false,
  tagConfidence: 0.9,
  source: [],
  ...(kind === 'dialogue' ? { characterId: 'nora' } : {}),
  ...extra,
});
const script = (units: Unit[], characters = [{ id: 'nora', name: 'NORA', aliases: [] }]): Script => ({ title: 'T', characters, units });

describe('diffScripts', () => {
  it('finds unchanged, changed, added and removed units', () => {
    const old = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'To be, or not to be, that is the question.'),
      u('u3', 'dialogue', 'Get thee to a nunnery.'),
      u('u4', 'dialogue', 'Words, words, words.'),
    ]);
    const next = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'To be, or not to be: that is the question!'),
      u('u3', 'dialogue', 'Get thee to a nunnery, go.'),
      u('u4', 'dialogue', 'Something new entirely.'),
    ]);
    const d = diffScripts(old, next);
    expect(d.unchanged).toEqual([
      { oldId: 'u1', newId: 'u1' },
      { oldId: 'u2', newId: 'u2' },
    ]);
    expect(d.changed).toEqual([{ oldId: 'u3', newId: 'u3', similarity: 5 / 6 }]);
    expect(d.added).toEqual(['u4']);
    expect(d.removed).toEqual(['u4']);
  });

  it('pairs only units of the same spoken class', () => {
    const d = diffScripts(script([u('u1', 'dialogue', 'Exit.')]), script([u('u1', 'direction', 'Exit.')]));
    expect([d.unchanged, d.added, d.removed]).toEqual([[], ['u1'], ['u1']]);
  });

  it('keeps one match when two lines swap places', () => {
    const old = script([u('a', 'dialogue', 'First line here.'), u('b', 'dialogue', 'Second line here too.'), u('c', 'dialogue', 'Third and last one.')]);
    const next = script([u('a', 'dialogue', 'First line here.'), u('c', 'dialogue', 'Third and last one.'), u('b', 'dialogue', 'Second line here too.')]);
    const d = diffScripts(old, next);
    expect(d.unchanged).toHaveLength(2);
    expect(d.added).toHaveLength(1);
    expect(d.removed).toHaveLength(1);
  });
});

describe('carryOver', () => {
  it('keeps the user’s corrections on unchanged units and flags changed ones', () => {
    const old = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'To be, or not to be.', { characterId: 'helmer', cut: true, tagConfidence: 1 }),
      u('u3', 'dialogue', 'Get thee to a nunnery.', { cut: true }),
      u('u4', 'dialogue', 'Words, words, words.'),
    ], [{ id: 'nora', name: 'NORA', aliases: [] }, { id: 'helmer', name: 'HELMER', aliases: [] }]);
    const next = script(
      [u('u1', 'heading', 'ACT I'), u('u2', 'dialogue', 'To be, or not to be.'), u('u3', 'dialogue', 'Get thee to a nunnery, go.'), u('u4', 'dialogue', 'Words, words, words.'), u('u5', 'dialogue', 'A new line.')],
      [{ id: 'nora', name: 'NORA', aliases: [] }, { id: 'rank', name: 'RANK', aliases: [] }],
    );
    const merged = carryOver(old, next, diffScripts(old, next));
    const byId = new Map(merged.units.map((x) => [x.id, x]));
    expect(byId.get('u2')).toMatchObject({ characterId: 'helmer', cut: true, tagConfidence: 1 });
    expect(byId.get('u3')).toMatchObject({ cut: true, text: 'Get thee to a nunnery, go.' });
    expect(byId.get('u3')!.tagConfidence).toBeLessThan(FLAG_BELOW);
    expect(merged.units.map((x) => x.id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
    expect(merged.characters.map((c) => c.id)).toEqual(['nora', 'helmer', 'rank']);
  });

  it('keeps ids and cuts when a scene is inserted mid-script (review focus 5)', () => {
    const old = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'Hello there, Torvald.'),
      u('u3', 'dialogue', 'Is that my little lark?', { cut: true }),
      u('u4', 'heading', 'ACT II'),
      u('u5', 'dialogue', 'The Christmas tree is stripped.'),
    ]);
    const next = script([
      u('n1', 'heading', 'ACT I'),
      u('n2', 'dialogue', 'Hello there, Torvald.'),
      u('n3', 'dialogue', 'Is that my little lark?'),
      u('n4', 'heading', 'SCENE 2'),
      u('n5', 'dialogue', 'A brand new line here.'),
      u('n6', 'dialogue', 'Another brand new speech.'),
      u('n7', 'heading', 'ACT II'),
      u('n8', 'dialogue', 'The Christmas tree is stripped.'),
    ]);
    const merged = carryOver(old, next, diffScripts(old, next));
    expect(merged.units.map((x) => x.id)).toEqual(['u1', 'u2', 'u3', 'u6', 'u7', 'u8', 'u4', 'u5']);
    expect(merged.units[2].cut).toBe(true);
  });
});

describe('similarity', () => {
  it('is token-set Jaccard after the engine’s normalisation', () => {
    expect(similarity('To be, or not.', 'to BE or not!')).toBe(1);
    expect(similarity('a b', 'c d')).toBe(0);
  });
});
