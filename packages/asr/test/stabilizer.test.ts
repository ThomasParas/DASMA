import { describe, expect, it } from 'vitest';
import { Stabilizer } from '../src/stabilizer';
import type { RawWord } from '../src/types';

const w = (text: string, start: number, end = start + 0.3): RawWord => ({ text, start, end, confidence: 1 });
const texts = (xs: Array<{ text: string }>) => xs.map((x) => x.text);

describe('Stabilizer (audio time, pass spec §7.1)', () => {
  it('releases words once unchanged for stableSec of fed audio', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    expect(s.update([w('A', 0), w('B', 0.4)], false, 0.8)).toEqual([]);
    expect(s.update([w('A', 0), w('B', 0.4)], false, 0.9)).toEqual([]);
    const out = s.update([w('A', 0), w('B', 0.4)], false, 1.0);
    expect(texts(out)).toEqual(['A', 'B']);
    expect(out.every((x) => x.final)).toBe(true);
  });

  it('holds the newest word until the recognizer is stableSec past its end', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0, 0.3)], false, 0.35);
    expect(s.update([w('A', 0, 0.3)], false, 0.45)).toEqual([]);
    expect(texts(s.update([w('A', 0, 0.3)], false, 0.55))).toEqual(['A']);
  });

  it('holds a steady newest word whose end is still growing', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    expect(s.update([w('A', 0, 0.3)], false, 0.35)).toEqual([]);
    expect(s.update([w('A', 0, 0.6)], false, 0.6)).toEqual([]); // steady for 0.25 s, but 0 s past its end
    expect(s.update([w('A', 0, 0.6)], false, 0.75)).toEqual([]);
    expect(texts(s.update([w('A', 0, 0.6)], false, 0.8))).toEqual(['A']);
  });

  it('releases at exactly stableSec despite floating-point error (1.0 - 0.8 < 0.2 in binary)', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0, 0.3)], false, 0.8);
    expect(texts(s.update([w('A', 0, 0.3)], false, 1.0))).toEqual(['A']);
  });

  it('a revised word restarts its clock', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0), w('X', 0.4)], false, 1.0);
    expect(s.update([w('A', 0), w('Y', 0.4)], false, 1.15)).toEqual([]);
    expect(texts(s.update([w('A', 0), w('Y', 0.4)], false, 1.2))).toEqual(['A']);
    expect(texts(s.update([w('A', 0), w('Y', 0.4)], false, 1.35))).toEqual(['Y']);
  });

  it('an endpoint releases everything and starts fresh', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0), w('B', 0.4)], false, 0.8);
    expect(texts(s.update([w('A', 0), w('B', 0.4)], true, 0.85))).toEqual(['A', 'B']);
    expect(s.update([w('C', 1.0)], false, 1.4)).toEqual([]);
    expect(texts(s.update([w('C', 1.0)], true, 1.45))).toEqual(['C']);
  });

  it('a hypothesis that shrinks never releases a stale word later', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    expect(s.update([w('A', 0), w('B', 0.4), w('C', 0.8)], false, 1.0)).toEqual([]);
    expect(s.update([w('A', 0)], false, 1.1)).toEqual([]);
    expect(texts(s.update([w('A', 0), w('B', 0.4), w('C', 0.8)], false, 1.3))).toEqual(['A']);
  });

  it('releases the same words at the same audio times whether fed in 0.1 s or 8 ms chunks', () => {
    const script = [w('one', 0, 0.3), w('two', 0.35, 0.65), w('three', 0.7, 1.0)];
    const releases = (step: number): Array<[string, number]> => {
      const s = new Stabilizer({ stableSec: 0.2 });
      const out: Array<[string, number]> = [];
      for (let n = 1; n * step <= 2 + 1e-9; n++) {
        const t = n * step;
        const hyp = script.filter((x) => t >= x.end + 0.1); // the recognizer shows a word 0.1 s after it ends
        for (const r of s.update(hyp, false, t)) out.push([r.text, t]);
      }
      return out;
    };
    const coarse = releases(0.1);
    const fine = releases(0.008);
    expect(coarse.map(([text]) => text)).toEqual(['one', 'two', 'three']);
    expect(fine.map(([text]) => text)).toEqual(coarse.map(([text]) => text));
    for (let k = 0; k < coarse.length; k++) expect(Math.abs(coarse[k]![1] - fine[k]![1])).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});
