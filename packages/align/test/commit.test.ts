import { describe, expect, it } from 'vitest';
import { commitPoint, commitPointOnTimeout } from '../src/commit';
import type { Op } from '../src/window-align';

const m = (h: number, e: number): Op => ({ kind: 'match', h, e, score: 1 });
const s = (h: number, e: number): Op => ({ kind: 'sub', h, e, score: 0 });
const i = (h: number): Op => ({ kind: 'ins', h });
const d = (e: number): Op => ({ kind: 'del', e });

describe('commitPoint', () => {
  it('commits leading matches immediately', () => {
    expect(commitPoint([m(0, 0), m(1, 1)], 3)).toBe(1);
  });
  it('confirms a substitution after C matching words', () => {
    expect(commitPoint([m(0, 0), s(1, 1), m(2, 2)], 1)).toBe(2);
    expect(commitPoint([m(0, 0), s(1, 1), m(2, 2)], 2)).toBe(0);
  });
  it('requires at least two matches after a skip, even at instant patience', () => {
    expect(commitPoint([d(0), m(0, 1)], 1)).toBe(-1);
    expect(commitPoint([d(0), m(0, 1), m(1, 2)], 1)).toBe(2);
  });
  it('confirms interleaved blocks (transposition shape)', () => {
    expect(commitPoint([m(0, 0), d(1), m(1, 2), i(2), m(3, 3)], 1)).toBe(4);
  });
  it('never commits an unconfirmed trailing deviation', () => {
    expect(commitPoint([s(0, 0)], 1)).toBe(-1);
  });
});

describe('commitPointOnTimeout', () => {
  it('commits trailing substitutions and insertions', () => {
    expect(commitPointOnTimeout([s(0, 0)])).toBe(0);
    expect(commitPointOnTimeout([m(0, 0), i(1), i(2)])).toBe(2);
  });
  it('still requires two matches after a skip', () => {
    expect(commitPointOnTimeout([m(0, 0), d(1), m(1, 2)])).toBe(0);
  });
  it('handles empty input', () => {
    expect(commitPointOnTimeout([])).toBe(-1);
  });
});
