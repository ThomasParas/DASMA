import { describe, expect, it } from 'vitest';
import { tokensToWords } from '../src/words';

describe('tokensToWords', () => {
  it('joins BPE pieces into words using leading-space boundaries', () => {
    const words = tokensToWords([' YE', 'T', ' THE', 'SE', ' THOUGHT', 'S'], [0.64, 0.76, 0.96, 1.04, 1.24, 1.44], 10);
    expect(words.map((w) => w.text)).toEqual(['YET', 'THESE', 'THOUGHTS']);
    expect(words[0]!.start).toBeCloseTo(10.64);
    expect(words[0]!.end).toBeCloseTo(10.88);
    expect(words[2]!.end).toBeCloseTo(11.56);
    expect(words.every((w) => w.confidence === 1)).toBe(true);
  });

  it('handles a bare space token and the ▁ marker', () => {
    const words = tokensToWords([' ', 'LESS', '▁WITH'], [1, 1.1, 1.3], 0);
    expect(words.map((w) => w.text)).toEqual(['LESS', 'WITH']);
    expect(words[0]!.start).toBeCloseTo(1.1);
    expect(words[1]!.start).toBeCloseTo(1.3);
  });

  it('counts only text-bearing tokens toward a word confidence', () => {
    const [w] = tokensToWords([' ', 'HI'], [0, 0.5], 0, [Math.log(0.1), Math.log(0.5)]);
    expect(w!.text).toBe('HI');
    expect(w!.confidence).toBeCloseTo(0.5);
  });

  it('turns log-probabilities into a confidence', () => {
    const [w] = tokensToWords([' HI'], [0], 0, [Math.log(0.5)]);
    expect(w!.confidence).toBeCloseTo(0.5);
  });

  it('returns nothing for no tokens', () => {
    expect(tokensToWords([], [], 0)).toEqual([]);
  });
});
