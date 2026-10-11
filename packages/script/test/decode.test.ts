import { describe, expect, it } from 'vitest';
import { decode } from '../src/decode';

describe('decode', () => {
  it('finds the best path and never uses a forbidden transition', () => {
    const start = [0, 0];
    const transitions = [
      [0, 0],
      [Number.NEGATIVE_INFINITY, 0],
    ];
    const emissions = [
      [0, -1],
      [-5, 0],
      [0, -0.1],
    ];
    const { path, posterior } = decode(start, transitions, emissions);
    expect(path).toEqual([0, 1, 1]);
    for (const row of posterior) expect(row[0] + row[1]).toBeCloseTo(1, 10);
    expect(posterior[1][1]).toBeGreaterThan(0.9);
  });

  it('returns nothing for no lines', () => {
    expect(decode([0], [[0]], [])).toEqual({ path: [], posterior: [] });
  });
});
