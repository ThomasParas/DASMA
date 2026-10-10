import { describe, expect, it } from 'vitest';
import { insideAny, offScriptSpans, type HeardMark } from '../src/off-script';

const marks = (pattern: string, gap = 0.05): HeardMark[] => {
  // "m" = matched word, "x" = unmatched word, "|" = a 2 s pause before the next word.
  const out: HeardMark[] = [];
  let t = 0;
  for (const c of pattern) {
    if (c === '|') {
      t += 2;
      continue;
    }
    out.push({ start: t, end: t + 0.3, matched: c === 'm' });
    t += 0.3 + gap;
  }
  return out;
};

describe('offScriptSpans', () => {
  it('finds 4+ consecutive heard words with at most one match', () => {
    const m = marks('mmmxxxxmmm');
    expect(offScriptSpans(m)).toEqual([[m[2]!.start, m[7]!.end]]);
    expect(offScriptSpans(marks('mmmxmxxmmm'))).toHaveLength(1);
  });

  it('a window with one match still counts, so three unmatched words beside a match are a span', () => {
    const m = marks('mmmxxxmmm');
    expect(offScriptSpans(m)).toEqual([[m[2]!.start, m[6]!.end]]);
  });

  it('ignores short runs and runs with two matches', () => {
    expect(offScriptSpans(marks('mmxxmm'))).toEqual([]);
    expect(offScriptSpans(marks('mmxmxmxmm'))).toEqual([]);
  });

  it('a pause longer than 1 s breaks a run', () => {
    expect(offScriptSpans(marks('mmxx|xxmm'))).toEqual([]);
  });

  it('merges overlapping windows into one span', () => {
    const m = marks('xxxxxxx');
    expect(offScriptSpans(m)).toEqual([[m[0]!.start, m[6]!.end]]);
  });

  it('insideAny needs the whole interval inside one span', () => {
    expect(insideAny([[1, 3]], 1.5, 2.5)).toBe(true);
    expect(insideAny([[1, 3]], 0.5, 2.5)).toBe(false);
  });
});
