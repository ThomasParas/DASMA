import { describe, expect, it } from 'vitest';
import { buildExpected, toHeardTokens } from '../src/expected';
import { MATCH_THRESHOLD } from '../src/phonetic';
import { TrigramIndex } from '../src/trigram-index';
import type { Strictness } from '../src/types';
import { heard } from './helpers/dsl';

const WP: Strictness = { mode: 'word-perfect' };
// to0 be1 or2 not3 to4 be5 that6 is7 the8 question9 to10 be11 or12 not13
const expected = buildExpected(
  [{ id: 'A', characterId: 'X', text: 'To be or not to be that is the question to be or not' }],
  WP,
);
const index = new TrigramIndex(expected);
const toks = (t: string) => toHeardTokens(heard(t), WP);

describe('TrigramIndex', () => {
  it('finds every occurrence, nearest forward first', () => {
    expect(index.find(toks('to be or'), 0, MATCH_THRESHOLD)).toEqual([0, 10]);
  });
  it('repeated phrases: prefers the nearest occurrence, forward-biased', () => {
    expect(index.find(toks('to be or'), 5, MATCH_THRESHOLD)).toEqual([10, 0]);
  });
  it('can find a phrase behind the cursor', () => {
    expect(index.find(toks('or not to'), 12, MATCH_THRESHOLD)).toEqual([2]);
  });
  it('uses only the last three tokens', () => {
    expect(index.find(toks('zebra be or not'), 0, MATCH_THRESHOLD)).toEqual([1, 11]);
  });
  it('needs three tokens', () => {
    expect(index.find(toks('be or'), 0, MATCH_THRESHOLD)).toEqual([]);
  });
  it('returns nothing for an unknown phrase', () => {
    expect(index.find(toks('the question mark'), 0, MATCH_THRESHOLD)).toEqual([]);
  });
  it('finds a sound-alike (homophone) phrase', () => {
    const idx = new TrigramIndex(buildExpected([{ id: 'B', characterId: 'X', text: 'the knight rode home' }], WP));
    expect(idx.find(toks('the night rode'), 0, MATCH_THRESHOLD)).toEqual([0]);
  });
  it('finds a phrase that matches only through a secondary phonetic key', () => {
    // gill = KL|JL, jill = JL|AL: gill's secondary key matches jill's primary key only, and the spellings are close (1 edit in 4 letters).
    const idx = new TrigramIndex(buildExpected([{ id: 'C', characterId: 'X', text: 'ask mister jill now' }], WP));
    expect(idx.find(toks('mister gill now'), 0, MATCH_THRESHOLD)).toEqual([1]);
  });
  it('rejects a key collision that scores below the threshold', () => {
    // in / on share phonetic key AN, but short words score only 0.6 (fuzzy ceiling).
    const idx = new TrigramIndex(buildExpected([{ id: 'D', characterId: 'X', text: 'go in the house' }], WP));
    expect(idx.find(toks('go on the'), 0, MATCH_THRESHOLD)).toEqual([]);
  });
});
