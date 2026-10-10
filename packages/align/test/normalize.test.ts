import { describe, expect, it } from 'vitest';
import { numberToWords } from '../src/numbers';
import {
  FILLERS,
  FUNCTION_WORDS,
  expandContraction,
  isContraction,
  normalizeToken,
  tokenize,
} from '../src/normalize';

describe('numberToWords', () => {
  it.each([
    [0, ['zero']],
    [15, ['fifteen']],
    [40, ['forty']],
    [105, ['one', 'hundred', 'five']],
    [2000, ['two', 'thousand']],
    [3456, ['three', 'thousand', 'four', 'hundred', 'fifty', 'six']],
  ])('cardinal %i', (n, words) => {
    expect(numberToWords(n)).toEqual(words);
  });

  it('reads plausible years as years', () => {
    expect(numberToWords(1984)).toEqual(['nineteen', 'eighty', 'four']);
    expect(numberToWords(1905)).toEqual(['nineteen', 'oh', 'five']);
    expect(numberToWords(1900)).toEqual(['nineteen', 'hundred']);
    expect(numberToWords(2024)).toEqual(['twenty', 'twenty', 'four']);
  });

  it('makes ordinals', () => {
    expect(numberToWords(3, 'ordinal')).toEqual(['third']);
    expect(numberToWords(12, 'ordinal')).toEqual(['twelfth']);
    expect(numberToWords(20, 'ordinal')).toEqual(['twentieth']);
    expect(numberToWords(21, 'ordinal')).toEqual(['twenty', 'first']);
  });
});

describe('tokenize', () => {
  it('splits on whitespace and dashes, keeping punctuation attached', () => {
    expect(tokenize("I didn't think it polite to listen, sir.")).toEqual([
      'I', "didn't", 'think', 'it', 'polite', 'to', 'listen,', 'sir.',
    ]);
    expect(tokenize('Wait—what? No -- never')).toEqual(['Wait', 'what?', 'No', 'never']);
  });
});

describe('normalizeToken', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeToken('Lane?')).toEqual(['lane']);
    expect(normalizeToken("'Hello'")).toEqual(['hello']);
  });

  it('recognizer/PDF parity: curly and straight apostrophes, any case, normalize the same', () => {
    expect(normalizeToken('I’m')).toEqual(["i'm"]);
    expect(normalizeToken("I'M")).toEqual(["i'm"]);
    expect(normalizeToken("DIDN'T")).toEqual(normalizeToken('didn’t'));
  });

  it('expands numbers, ordinals and ampersands', () => {
    expect(normalizeToken('1984')).toEqual(['nineteen', 'eighty', 'four']);
    expect(normalizeToken('21st')).toEqual(['twenty', 'first']);
    expect(normalizeToken('&')).toEqual(['and']);
  });

  it("keeps leading-apostrophe words like 'tis", () => {
    expect(normalizeToken("'Tis")).toEqual(["'tis"]);
  });

  it('returns nothing for pure punctuation', () => {
    expect(normalizeToken('—')).toEqual([]);
    expect(normalizeToken('…')).toEqual([]);
  });

  it('reads thousands separators as part of one number', () => {
    expect(normalizeToken('1,000')).toEqual(['one', 'thousand']);
    expect(normalizeToken('12,500')).toEqual(['twelve', 'thousand', 'five', 'hundred']);
  });

  it('still splits comma-joined words', () => {
    expect(normalizeToken('one,two')).toEqual(['one', 'two']);
  });
});

describe('contractions', () => {
  it.each([
    ["didn't", ['did', 'not']],
    ["can't", ['can', 'not']],
    ["won't", ['will', 'not']],
    ["i'm", ['i', 'am']],
    ["they're", ['they', 'are']],
    ["it's", ['it', 'is']],
    ["'tis", ['it', 'is']],
    ["lane's", ["lane's"]],
    ['hello', ['hello']],
  ])('expands %s', (w, out) => {
    expect(expandContraction(w)).toEqual(out);
  });

  it('knows what is a contraction', () => {
    expect(isContraction("i'm")).toBe(true);
    expect(isContraction("o'er")).toBe(true);
    expect(isContraction("lane's")).toBe(false);
  });

  it.each(['constructor', 'tostring', 'hasownproperty', '__proto__'])(
    'does not look up %s as a contraction via Object.prototype',
    (w) => {
      expect(expandContraction(w)).toEqual([w]);
      expect(isContraction(w)).toBe(false);
    },
  );
});

describe('word lists', () => {
  it('has fillers and function words', () => {
    expect(FILLERS.has('um')).toBe(true);
    expect(FILLERS.has('ah')).toBe(false);
    expect(FUNCTION_WORDS.has('the')).toBe(true);
    expect(FUNCTION_WORDS.has('expression')).toBe(false);
  });
});

describe('normalizeToken: accents, symbols, abbreviations', () => {
  it('folds accents', () => {
    expect(normalizeToken('café')).toEqual(['cafe']);
    expect(normalizeToken('naïve')).toEqual(['naive']);
    expect(normalizeToken('Zoë')).toEqual(['zoe']);
  });

  it('reads dollars and percent', () => {
    expect(normalizeToken('$5')).toEqual(['five', 'dollars']);
    expect(normalizeToken('$1')).toEqual(['one', 'dollar']);
    expect(normalizeToken('$5.50')).toEqual(['five', 'dollars', 'fifty']);
    expect(normalizeToken('10%')).toEqual(['ten', 'percent']);
  });

  it('expands Mr, Mrs and Dr', () => {
    expect(normalizeToken('Mr.')).toEqual(['mister']);
    expect(normalizeToken('Mrs')).toEqual(['missus']);
    expect(normalizeToken('Dr.')).toEqual(['doctor']);
  });

  it('reads St as saint before a capitalized word, otherwise street', () => {
    expect(normalizeToken('St.', 'Paul')).toEqual(['saint']);
    expect(normalizeToken('St.', 'and')).toEqual(['street']);
    expect(normalizeToken('St.')).toEqual(['street']);
  });
});
