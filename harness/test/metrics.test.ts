import type { NoteDraft } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { aggregate, checkTargets, compareToBaseline, finalNotes, flagRecords, formatReport, scoreOutcome, scoreRun, type EvalReport } from '../src/metrics';
import type { Label } from '../src/perturb';
import type { TimedEvent } from '../src/run-engine';
import type { RenderedSegment } from '../src/tts';

const note = (lineId: string, category: NoteDraft['category'], status: 'note' | 'check' = 'note'): NoteDraft => ({
  lineId, characterId: 'X', category, expected: '', heard: '', confidence: status === 'note' ? 0.8 : 0.4, status, at: 0,
});

const segments: RenderedSegment[] = [
  { seg: { speaker: 'X', text: 'one two three four', pauseBefore: 0, lineId: 'A' }, start: 0, end: 2 },
  { seg: { speaker: 'X', text: 'five six seven eight', pauseBefore: 1, lineId: 'B' }, start: 3, end: 5 },
];
const labels: Label[] = [
  { kind: 'wrong-words', lineId: 'A', characterId: 'X', segmentIndex: 0, wordIndex: 1 },
  { kind: 'stumble', lineId: 'B', characterId: 'X', segmentIndex: 1, wordIndex: 0 },
];
const events: TimedEvent[] = [
  { event: { type: 'flag', note: note('A', 'wrong-words'), alert: true, at: 1.5 }, audioTime: 1.6 },
  { event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words')], at: 2 }, audioTime: 2.1 },
  { event: { type: 'flag', note: note('B', 'added-words'), alert: true, at: 4 }, audioTime: 4 },
  { event: { type: 'lineDone', lineId: 'B', notes: [note('B', 'added-words'), note('B', 'dropped-words', 'check')], at: 5 }, audioTime: 5 },
];

describe('scoreRun', () => {
  it('scores detections, false notes, false alerts, and latency', () => {
    const s = scoreRun(labels, events, segments);
    expect(s).toMatchObject({
      errorLabels: 1, detected: 1, detectedInclChecks: 1, sameCategory: 1, coreLabels: 1, coreDetected: 1,
      falseNotes: 1, falseChecks: 1, falseAlerts: 1, benignViolations: 1,
    });
    expect(s.perCategory['wrong-words']).toEqual({ labels: 1, detected: 1 });
    expect(s.alertLatencies).toHaveLength(1);
    expect(s.alertLatencies[0]).toBeCloseTo(0.6);
  });

  it('keeps only the last lineDone per line, since a later one supersedes earlier ones', () => {
    const superseded: TimedEvent[] = [
      { event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words')], at: 2 }, audioTime: 2.1 },
      { event: { type: 'lineDone', lineId: 'A', notes: [], at: 3 }, audioTime: 3.1 },
    ];
    const s = scoreRun(labels.slice(0, 1), superseded, segments);
    expect(s.detected).toBe(0);
    expect(s.falseNotes).toBe(0);
  });

  it('counts notes and alerts beyond the planted errors on an error line as false (fair counting)', () => {
    const extra: TimedEvent[] = [
      { event: { type: 'flag', note: note('A', 'wrong-words'), alert: true, at: 1.5 }, audioTime: 1.6 },
      { event: { type: 'flag', note: note('A', 'dropped-words'), alert: true, at: 1.7 }, audioTime: 1.8 },
      {
        event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words'), note('A', 'dropped-words'), note('A', 'added-words'), note('A', 'added-words', 'check')], at: 2 },
        audioTime: 2.1,
      },
    ];
    const s = scoreRun(labels.slice(0, 1), extra, segments);
    expect(s).toMatchObject({ detected: 1, falseNotes: 2, falseAlerts: 1, falseChecks: 0 });
  });

  it('two planted errors on one line allow two notes and two alerts', () => {
    const two: Label[] = [labels[0]!, { ...labels[0]!, kind: 'dropped-words', wordIndex: 3 }];
    const evs: TimedEvent[] = [
      { event: { type: 'flag', note: note('A', 'wrong-words'), alert: true, at: 1.5 }, audioTime: 1.6 },
      { event: { type: 'flag', note: note('A', 'dropped-words'), alert: true, at: 1.7 }, audioTime: 1.8 },
      { event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words'), note('A', 'dropped-words')], at: 2 }, audioTime: 2.1 },
    ];
    expect(scoreRun(two, evs, segments)).toMatchObject({ errorLabels: 2, detected: 2, falseNotes: 0, falseAlerts: 0 });
  });

  it('scoreOutcome scores stored notes and flags the same way as scoreRun scores events', () => {
    expect(scoreOutcome(labels, finalNotes(events), flagRecords(events), segments)).toEqual(scoreRun(labels, events, segments));
  });
});

describe('aggregate', () => {
  it('rolls runs up into rates', () => {
    const agg = aggregate([{ ...scoreRun(labels, events, segments), durationSec: 600, rtf: 0.2 }]);
    expect(agg).toMatchObject({ runs: 1, audioMinutes: 10, recall: 1, coreRecall: 1, falseAlertsPerRun: 1, falseNotesPerRun: 1, rtfMean: 0.2 });
    expect(agg.falseAlertsPer10Min).toBeCloseTo(1);
    expect(agg.latencyP50).toBeCloseTo(0.6);
  });
});

describe('targets and report', () => {
  const agg = aggregate([{ ...scoreRun(labels, events, segments), durationSec: 600, rtf: 0.2 }]);
  const report: EvalReport = { createdAt: '2026-10-10T00:00:00Z', config: { seeds: 1 }, conditions: { 'close-mic': agg } };

  it('checks the spec targets', () => {
    const rows = checkTargets('close-mic', agg);
    expect(rows.find((r) => r.label.startsWith('False alerts'))!.pass).toBe(true);
    expect(rows.find((r) => r.label.startsWith('Recall'))!.pass).toBe(true);
  });

  it('formats a markdown report', () => {
    const md = formatReport(report);
    expect(md).toContain('## close-mic');
    expect(md).toContain('| Recall (dropped/wrong word, dropped line)');
    expect(md).toMatch(/PASS|FAIL/);
  });

  it('gates regressions against a baseline', () => {
    expect(compareToBaseline(report, report).pass).toBe(true);
    const worse: EvalReport = { ...report, conditions: { 'close-mic': { ...agg, coreRecall: agg.coreRecall! - 0.05 } } };
    expect(compareToBaseline(worse, report).pass).toBe(false);
    const noisier: EvalReport = { ...report, conditions: { 'close-mic': { ...agg, falseAlertsPerRun: agg.falseAlertsPerRun + 0.5 } } };
    expect(compareToBaseline(noisier, report).pass).toBe(false);
  });

  it('fails the gate when a baseline condition is missing from the report', () => {
    const baseline: EvalReport = { ...report, conditions: { 'close-mic': agg, 'far-field': agg } };
    const result = compareToBaseline(report, baseline);
    expect(result.pass).toBe(false);
    expect(result.lines).toContain('far-field: FAIL condition is in the baseline but missing from the report');
  });

  it('still skips a report condition that has no baseline', () => {
    const extra: EvalReport = { ...report, conditions: { 'close-mic': agg, 'far-field': agg } };
    const result = compareToBaseline(extra, report);
    expect(result.pass).toBe(true);
    expect(result.lines).toContain('far-field: no baseline — skipped');
  });

  it('fails the gate when the report has no recall evidence but the baseline did', () => {
    const empty: EvalReport = { ...report, conditions: { 'close-mic': { ...agg, coreRecall: null } } };
    const result = compareToBaseline(empty, report);
    expect(result.pass).toBe(false);
    expect(result.lines.join('\n')).toContain('coreRecall n/a');
  });
});

describe('recall with no labels', () => {
  const clean = scoreRun([], [], segments);

  it('reports n/a (null) instead of a vacuous 1.0', () => {
    const agg = aggregate([{ ...clean, durationSec: 600, rtf: 0.2 }]);
    expect(agg).toMatchObject({ errorLabels: 0, recall: null, recallInclChecks: null, coreRecall: null, sameCategoryRate: null });
    expect(JSON.parse(JSON.stringify(agg)).coreRecall).toBeNull();
    expect(formatReport({ createdAt: 'x', config: {}, conditions: { 'close-mic': agg } })).toContain('| Recall (dropped/wrong word, dropped line) | n/a | >= 0.9 | FAIL |');
  });

  it('treats a recall target with zero labels as FAIL, not a vacuous pass', () => {
    const agg = aggregate([{ ...clean, durationSec: 600, rtf: 0.2 }]);
    for (const room of ['close-mic', 'far-field', 'far-field-hard']) {
      const row = checkTargets(room, agg).find((r) => r.label.startsWith('Recall'))!;
      expect(row.value).toBeNull();
      expect(row.pass).toBe(false);
    }
  });
});
