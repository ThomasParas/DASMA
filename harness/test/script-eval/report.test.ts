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

const C: DocScore = { docId: 'licensed-c', family: 'licensed', pages: 4, fixes: fixes([true, true, true, true, true, true]), fixesByPage: [6, 0, 0, 0], spokenUnits: 40, speakerRight: 40, falseFlags: 0, spokenWords: 400, textErrors: 0 };
const W: DocScore = { docId: 'word-a', family: 'word', pages: 10, fixes: fixes([true, true, true, true, true]), fixesByPage: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], spokenUnits: 100, speakerRight: 99, falseFlags: 5, spokenWords: 1000, textErrors: 2 };

describe('familyMetrics per-document mean', () => {
  it('averages fixes per page over the documents, not over the pooled pages', () => {
    const [m] = familyMetrics([A, C]);
    expect(m.errors).toBe(11);
    expect(m.fixesPerPage).toBeCloseTo(1.0); // (5/10 + 6/4) / 2; pooled would be 11/14
    expect(m.falseFlagsPerPage).toBeCloseTo(4 / 14); // pooled
  });
});

describe('gateFailures', () => {
  it('names each target a family misses', () => {
    const failures = gateFailures(familyMetrics([A, B])[0]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/flaggedShare/);
  });
});

describe('gate over several families', () => {
  const metrics = familyMetrics([A, B, W]);
  it('passes a family that meets every target and fails the other', () => {
    expect(metrics.map((m) => m.family)).toEqual(['licensed', 'word']);
    expect(gateFailures(metrics[0])).not.toEqual([]);
    expect(gateFailures(metrics[1])).toEqual([]);
  });

  it('shows PASS for the passing family and FAIL for the other', () => {
    const rows = formatScriptReport('t', metrics, [A, B, W], false).split('\n');
    expect(rows.find((r) => r.startsWith('| licensed |'))).toContain('FAIL');
    expect(rows.find((r) => r.startsWith('| word |'))).toMatch(/\| PASS \|$/);
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
