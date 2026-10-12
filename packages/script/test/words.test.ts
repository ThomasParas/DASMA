import { tokenize } from '@dasma/align';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wordSpans } from '../src/words';

const words = (text: string): string[] => wordSpans(text).map(([s, e]) => text.slice(s, e));

describe('wordSpans', () => {
  it('gives the character span of each tokenize word', () => {
    const text = 'Well—no,  I  said--it ’tis well-known.';
    expect(words(text)).toEqual(['Well', 'no,', 'I', 'said', 'it', '’tis', 'well-known.']);
  });

  it('splits exactly where tokenize splits', () => {
    const unit = fc.constantFrom('a', 'b', ' ', '\n', '\t', '-', '—', '’', '.');
    fc.assert(
      fc.property(fc.string({ unit }), (text) => {
        expect(words(text).map((w) => w.replace(/[‘’ʼ`´]/g, "'"))).toEqual(tokenize(text));
      }),
    );
  });
});
