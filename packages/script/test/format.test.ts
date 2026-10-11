import { describe, expect, it } from 'vitest';
import { readDasma, writeDasma } from '../src/format';
import type { Script } from '../src/types';
import { thrownCode } from './helpers';

const SCRIPT: Script = {
  title: 'Hamlet',
  characters: [{ id: 'hamlet', name: 'HAMLET', aliases: ['HAM'] }],
  units: [
    { id: 'u1', kind: 'heading', text: 'ACT I', cut: false, tagConfidence: 0.99, source: [{ page: 1, line: 0 }] },
    { id: 'u2', kind: 'dialogue', characterId: 'hamlet', text: 'To be.', cut: true, overlapRanges: [[0, 1]], tagConfidence: 0.7, source: [{ page: 1, line: 2 }] },
  ],
};
const NOW = new Date('2026-10-11T00:00:00Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validFile = (): any => JSON.parse(writeDasma(SCRIPT, { now: NOW }));

describe('writeDasma / readDasma', () => {
  it('round-trips a script', () => {
    expect(readDasma(writeDasma(SCRIPT, { now: NOW }))).toEqual({ script: SCRIPT, exportedAt: '2026-10-11T00:00:00.000Z' });
  });

  it('writes the header, and the cast only when asked', () => {
    const plain = validFile();
    expect([plain.format, plain.formatVersion, 'cast' in plain]).toEqual(['dasma-script', 1, false]);
    const withCast = writeDasma(SCRIPT, { now: NOW, cast: { hamlet: ['Sam Lee'] } });
    expect(readDasma(withCast).cast).toEqual({ hamlet: ['Sam Lee'] });
  });

  it('rejects text that is not JSON, not a DASMA file, or from a newer version', () => {
    expect(thrownCode(() => readDasma('not json'))).toBe('notJson');
    expect(thrownCode(() => readDasma('{"format":"other"}'))).toBe('notDasma');
    expect(thrownCode(() => readDasma(JSON.stringify({ ...validFile(), formatVersion: 2 })))).toBe('newerVersion');
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it.each<[string, (f: any) => void]>([
    ['formatVersion', (f) => (f.formatVersion = 'one')],
    ['title', (f) => (f.title = 7)],
    ['characters[0].aliases', (f) => (f.characters[0].aliases = 'HAM')],
    ['characters[1].id', (f) => f.characters.push({ id: 'hamlet', name: 'X', aliases: [] })],
    ['units[1].kind', (f) => (f.units[1].kind = 'song')],
    ['units[1].characterId', (f) => (f.units[1].characterId = 'ophelia')],
    ['units[1].id', (f) => (f.units[1].id = 'u1')],
    ['units[1].overlapRanges', (f) => (f.units[1].overlapRanges = [[2, 1]])],
    ['units[1].cut', (f) => (f.units[1].cut = 'yes')],
    ['units[0].tagConfidence', (f) => (f.units[0].tagConfidence = 1.5)],
    ['units[0].source', (f) => (f.units[0].source = [{ page: 0, line: 0 }])],
    ['cast.ophelia', (f) => (f.cast = { ophelia: ['Ann'] })],
  ])('rejects a damaged %s', (path, damage) => {
    const f = validFile();
    damage(f);
    try {
      readDasma(JSON.stringify(f));
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ reason: 'invalid', path });
    }
  });
});
