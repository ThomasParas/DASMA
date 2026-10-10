import { describe, expect, it } from 'vitest';
import { Stabilizer } from '../src/stabilizer';
import type { RawWord } from '../src/types';

const w = (text: string, start = 0): RawWord => ({ text, start, end: start + 0.3, confidence: 1 });

describe('Stabilizer', () => {
  it('never settles the last (still-changing) word and needs two stable updates', () => {
    const s = new Stabilizer(2);
    expect(s.update([w('A')], false)).toEqual([]);
    expect(s.update([w('A'), w('B')], false)).toEqual([]);
    expect(s.update([w('A'), w('B')], false).map((x) => x.text)).toEqual(['A']);
    expect(s.update([w('A'), w('B'), w('C')], false)).toEqual([]);
    expect(s.update([w('A'), w('B'), w('C')], false).map((x) => x.text)).toEqual(['B']);
  });

  it('settles everything on an endpoint and starts fresh', () => {
    const s = new Stabilizer(2);
    s.update([w('A'), w('B')], false);
    const out = s.update([w('A'), w('B')], true);
    expect(out.map((x) => x.text)).toEqual(['A', 'B']);
    expect(out.every((x) => x.final)).toBe(true);
    expect(s.update([w('C')], false)).toEqual([]);
    expect(s.update([w('C')], true).map((x) => x.text)).toEqual(['C']);
  });

  it('ignores a word that was revised before it settled', () => {
    const s = new Stabilizer(2);
    expect(s.update([w('A'), w('X'), w('Q')], false)).toEqual([]);
    expect(s.update([w('A'), w('Y'), w('Q')], false).map((x) => x.text)).toEqual(['A']);
    expect(s.update([w('A'), w('Y'), w('Q')], false).map((x) => x.text)).toEqual(['Y']);
  });
});
