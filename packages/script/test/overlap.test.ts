import { describe, expect, it } from 'vitest';
import { applyOverlapMarks } from '../src/overlap';
import type { Unit } from '../src/types';

const unit = (id: string, kind: Unit['kind'], text: string): Unit => ({ id, kind, text, cut: false, tagConfidence: 1, source: [], characterId: kind === 'dialogue' ? 'x' : undefined });

describe('applyOverlapMarks', () => {
  it('turns a slash into overlap ranges on this line and the start of the next spoken line', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'I never said / that you were wrong.'), unit('u2', 'direction', '(Pause.)'), unit('u3', 'dialogue', 'Well, I did.')]);
    expect(out[0].text).toBe('I never said that you were wrong.');
    expect(out[0].overlapRanges).toEqual([[3, 7]]);
    expect(out[1].overlapRanges).toBeUndefined();
    expect(out[2].overlapRanges).toEqual([[0, 3]]);
  });

  it('ignores a slash inside a word such as "and/or"', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'Tea and/or coffee.'), unit('u2', 'dialogue', 'Tea.')]);
    expect(out[0].text).toBe('Tea and/or coffee.');
    expect(out[0].overlapRanges).toBeUndefined();
    expect(out[1].overlapRanges).toBeUndefined();
  });

  it('gives the next line at least one overlapped word when the slash ends a line', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'I never said /'), unit('u2', 'dialogue', 'You did.')]);
    expect(out[0].text).toBe('I never said');
    expect(out[0].overlapRanges).toBeUndefined();
    expect(out[1].overlapRanges).toEqual([[0, 1]]);
  });

  it('removes every overlap slash from a unit; the first one starts the overlap', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'Well, I never said / that you were wrong, no / really.'), unit('u2', 'dialogue', 'Mm.')]);
    expect(out[0].text).toBe('Well, I never said that you were wrong, no really.');
    expect(out[0].overlapRanges?.[0][0]).toBe(4);
  });

  it('keeps chained overlap ranges sorted and non-overlapping', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'one two three four / five six'), unit('u2', 'dialogue', 'alpha / beta gamma'), unit('u3', 'dialogue', 'zed')]);
    expect(out.map((u) => u.text)).toEqual(['one two three four five six', 'alpha beta gamma', 'zed']);
    expect(out[0].overlapRanges).toEqual([[4, 6]]);
    expect(out[1].overlapRanges).toEqual([[0, 3]]);
    expect(out[2].overlapRanges).toEqual([[0, 1]]);
  });
});
