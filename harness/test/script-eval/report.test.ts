import { describe, expect, it } from 'vitest';
import { familyMetrics, formatScriptReport, gateFailures } from '../../src/script-eval/report';
import type { DocScore, Fix } from '../../src/script-eval/score';

const fixes = (flagged: boolean[]): Fix[] => flagged.map((f) => ({ kind: 'split', page: 1, flagged: f }));
const A: DocScore = { docId: 'licensed-a', family: 'licensed', pages: 10, fixes: fixes([true, true, true, true, false]), fixesByPage: [3, 1, 1, 0, 0, 0, 0, 0, 0, 0], spokenUnits: 100, speakerRight: 99, falseFlags: 4, spokenWords: 1000, textErrors: 3 };
const B: DocScore = { docId: 'licensed-b', family: 'licensed', pages: 10, fixes: fixes([true, true, true]), fixesByPage: [0, 0, 1, 2, 0, 0, 0, 0, 0, 0], spokenUnits: 100, speakerRight: 98, falseFlags: 6, spokenWords: 1000, textErrors: 2 };

describe('familyMetrics', () => {
  it('pools documents per family', () => {
    const [m] = familyMetrics([A, B]);
    expect(m).toMatchObject({ family: 'licensed', docs: 2, pages: 20, errors: 8, worstPageFixes: 3 });
    expect(m.fixesPerPage).toBeCloseTo(0.4);
    expect(m.speakerAccuracy).toBeCloseTo(0.985);
    expect(m.flaggedShare).toBeCloseTo(0.875);
    expect(m.falseFlagsPerPage).toBeCloseTo(0.5);
    expect(m.textAccuracy).toBeCloseTo(0.9975);
  });
});

describe('gateFailures', () => {
  it('names each target a family misses', () => {
    const failures = gateFailures(familyMetrics([A, B])[0]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/flaggedShare/);
  });
});

describe('formatScriptReport', () => {
  it('writes a family table with the verdict and, when verbose, one row per document', () => {
    const md = formatScriptReport('script-eval — tune', familyMetrics([A, B]), [A, B], true);
    expect(md).toContain('| licensed |');
    expect(md).toContain('FAIL');
    expect(md).toContain('licensed-a');
    expect(formatScriptReport('t', familyMetrics([A, B]), [A, B], false)).not.toContain('licensed-a');
  });
});
