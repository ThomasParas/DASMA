import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyEdit, EditError, readDasma, uniqueCharacterId, wordSpans, writeDasma, type EditOp, type Script } from '../../src/index';

const WORDS = ['to', 'be', 'or', 'not', 'well—no', '’tis', 'lord.', 'sir,'];
const KINDS = ['dialogue', 'direction', 'characterName', 'heading', 'sceneBreak', 'frontMatter'] as const;

const scriptArb = fc
  .array(
    fc.record({
      kind: fc.constantFrom(...KINDS),
      words: fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 6 }),
      who: fc.constantFrom('a', 'b', undefined),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map(
    (us): Script => ({
      title: 'T',
      characters: [
        { id: 'a', name: 'A', aliases: ['AA'] },
        { id: 'b', name: 'B', aliases: [] },
      ],
      units: us.map((u, k) => ({
        id: `u${k + 1}`,
        kind: u.kind,
        text: u.words.join(' '),
        cut: false,
        tagConfidence: 0.5,
        source: [{ page: 1, line: k }],
        ...(u.kind === 'dialogue' && u.who ? { characterId: u.who } : {}),
      })),
    }),
  );

const seedArb = fc.record({ type: fc.nat({ max: 17 }), a: fc.nat(), b: fc.nat(), c: fc.nat(), flag: fc.boolean() });
type Seed = { type: number; a: number; b: number; c: number; flag: boolean };

function toOp(s: Script, x: Seed): EditOp {
  const u = s.units[x.a % s.units.length];
  const n = wordSpans(u.text).length;
  const from = x.b % Math.max(1, n);
  const to = from + 1 + (x.c % Math.max(1, n - from));
  const char = s.characters[x.c % Math.max(1, s.characters.length)]?.id ?? 'a';
  const other = s.characters[(x.c + 1) % Math.max(1, s.characters.length)]?.id ?? 'b';
  switch (x.type) {
    case 0:
      return { type: 'confirm', unitIds: [u.id] };
    case 1:
      return { type: 'setKind', unitIds: [u.id], kind: (['direction', 'heading', 'frontMatter'] as const)[x.b % 3] };
    case 2:
      return { type: 'speechBy', unitIds: [u.id], characterId: char };
    case 3:
      return { type: 'setName', unitId: u.id, characterId: char };
    case 4:
      return { type: 'editText', unitId: u.id, text: x.flag ? 'new words here' : '' };
    case 5:
      return { type: 'split', unitId: u.id, atWord: x.b % (n + 1) };
    case 6:
      return { type: 'join', unitId: u.id };
    case 7:
      return { type: 'remove', unitIds: [u.id] };
    case 8:
      return { type: 'setCut', unitIds: [u.id], cut: x.flag };
    case 9:
      return { type: 'setCutWords', unitId: u.id, from, to, cut: x.flag };
    case 10:
      return { type: 'setOverlap', unitId: u.id, from, to, on: x.flag };
    case 11:
      return { type: 'insertSceneBreak', beforeUnitId: u.id };
    case 12:
      return { type: 'removeSceneBreak', unitId: u.id };
    case 13:
      return { type: 'renameCharacter', characterId: char, name: x.flag ? 'NEW NAME' : '' };
    case 14:
      return { type: 'editAliases', characterId: char, aliases: ['X', 'x', ' '] };
    case 15:
      return { type: 'mergeCharacters', fromId: char, intoId: other };
    case 16: {
      const id = uniqueCharacterId(s, 'Extra');
      return { type: 'batch', ops: [{ type: 'newCharacter', id, name: 'Extra' }, { type: 'speechBy', unitIds: [u.id], characterId: id }] };
    }
    default:
      return { type: 'moveSpeeches', unitIds: [u.id], characterId: char };
  }
}

function expectValid(s: Script): void {
  expect(s.units.length).toBeGreaterThan(0);
  expect(new Set(s.units.map((u) => u.id)).size).toBe(s.units.length);
  const chars = new Set(s.characters.map((c) => c.id));
  expect(chars.size).toBe(s.characters.length);
  for (const u of s.units) {
    expect(u.text.trim()).not.toBe('');
    if (u.characterId !== undefined) {
      expect(u.kind).toBe('dialogue');
      expect(chars.has(u.characterId)).toBe(true);
    }
    if (u.overlapRanges) {
      expect(u.kind).toBe('dialogue');
      expect(u.overlapRanges.length).toBeGreaterThan(0);
      const n = wordSpans(u.text).length;
      let end = 0;
      for (const [a, b] of u.overlapRanges) {
        expect(a).toBeGreaterThanOrEqual(end);
        expect(b).toBeGreaterThan(a);
        expect(b).toBeLessThanOrEqual(n);
        end = b;
      }
    }
  }
  expect(readDasma(writeDasma(s)).script).toEqual(s);
}

describe('applyEdit (property)', () => {
  it('always yields a valid script that round-trips through .dasma, and never mutates its input', () => {
    fc.assert(
      fc.property(scriptArb, fc.array(seedArb, { maxLength: 25 }), (start, seeds) => {
        let s = start;
        for (const x of seeds) {
          const prev = s;
          const before = JSON.stringify(prev);
          try {
            s = applyEdit(prev, toOp(prev, x));
          } catch (err) {
            if (!(err instanceof EditError)) throw err;
          }
          expect(JSON.stringify(prev)).toBe(before);
          expectValid(s);
        }
      }),
      { numRuns: 300 },
    );
  });
});
