import { describe, expect, it } from 'vitest';
import { buildExpected, toHeardTokens } from '../src/expected';
import type { Strictness } from '../src/types';
import { alignWindow, hasE, type Op } from '../src/window-align';
import { heard } from './helpers/dsl';

const WP: Strictness = { mode: 'word-perfect' };
const exp = (text: string) => buildExpected([{ id: 'L', characterId: 'C', text }], WP);
const toks = (text: string) => toHeardTokens(heard(text), WP);
const kinds = (ops: Op[]) => ops.map((o) => o.kind);

describe('alignWindow', () => {
  it('aligns a perfect prefix and stops (semi-global)', () => {
    const ops = alignWindow(toks('did you hear'), exp('Did you hear what I was playing'));
    expect(kinds(ops)).toEqual(['match', 'match', 'match']);
    expect(ops.filter(hasE).map((o) => o.e)).toEqual([0, 1, 2]);
  });

  it('finds a substitution', () => {
    const ops = alignWindow(toks('play with marvellous'), exp('play with wonderful expression'));
    expect(kinds(ops)).toEqual(['match', 'match', 'sub']);
    expect(ops[2]).toMatchObject({ kind: 'sub', h: 2, e: 2 });
  });

  it('skips expected words to reach a better match', () => {
    const ops = alignWindow(toks('anyone can play'), exp("I'm sorry anyone can play"));
    expect(kinds(ops)).toEqual(['del', 'del', 'match', 'match', 'match']);
  });

  it('finds an insertion', () => {
    expect(kinds(alignWindow(toks('yes really sir'), exp('yes sir')))).toEqual(['match', 'ins', 'match']);
  });

  it('returns no ops for no heard words', () => {
    expect(alignWindow([], exp('a b c'))).toEqual([]);
  });

  it('global mode consumes the whole window', () => {
    const ops = alignWindow(toks('zebra'), exp('alpha beta gamma'), { global: true });
    expect(ops.filter(hasE).map((o) => o.e).sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(ops.filter((o) => o.kind !== 'del')).toHaveLength(1);
  });

  it('global mode with no heard words deletes the whole window', () => {
    expect(kinds(alignWindow([], exp('a b c'), { global: true }))).toEqual(['del', 'del', 'del']);
  });
});
