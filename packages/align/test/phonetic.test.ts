import { describe, expect, it } from 'vitest';
import { MATCH_THRESHOLD, phoneticKey, wordScore } from '../src/phonetic';

const w = (norm: string) => ({ norm, phon: phoneticKey(norm) });

describe('phoneticKey', () => {
  it('gives homophones the same primary key', () => {
    expect(phoneticKey('knight')[0]).toBe(phoneticKey('night')[0]);
  });
  it('ignores apostrophes', () => {
    expect(phoneticKey("i'm")[0]).toBe(phoneticKey('im')[0]);
  });
  it('falls back to the word itself when it has no letters', () => {
    expect(phoneticKey('')).toEqual(['', '']);
  });
});

describe('wordScore', () => {
  it('scores identical words 1', () => {
    expect(wordScore(w('expression'), w('expression'))).toBe(1);
  });
  it('scores sound-alike words of 3+ letters as a match', () => {
    expect(wordScore(w('night'), w('knight'))).toBe(0.9);
    expect(wordScore(w('sur'), w('sir'))).toBe(0.9);
    expect(wordScore(w('there'), w('their'))).toBe(0.9);
  });
  it('does not treat short sound-alikes as matches (in/on)', () => {
    const s = wordScore(w('in'), w('on'));
    expect(s).toBeLessThan(MATCH_THRESHOLD);
    expect(s).toBeCloseTo(0.6, 5);
  });
  it('scores unrelated words low', () => {
    expect(wordScore(w('feeling'), w('expression'))).toBeLessThan(0.3);
  });
  it('exports the match threshold', () => {
    expect(MATCH_THRESHOLD).toBe(0.85);
  });
});
