import { describe, expect, it } from 'vitest';
import { evaluate, type EvalConfig } from '../src/evaluate';
import { fakeTts } from './helpers/fake-tts';
import { ScriptedRecognizer, oracleWords } from './helpers/scripted-recognizer';

const config: EvalConfig = {
  sceneIds: 'all',
  seeds: 3,
  rooms: ['close-mic'],
  patience: 0.5,
  strictness: { mode: 'word-perfect' },
  errorRate: 0.35,
  benignRate: 0.2,
  model: 'oracle',
};
const deps = { tts: fakeTts, makeRecognizer: (r: Parameters<typeof oracleWords>[0]) => new ScriptedRecognizer(oracleWords(r)) };

describe('evaluate (end to end, perfect recognizer)', () => {
  it('finds planted errors without false alarms', () => {
    const { report, runs } = evaluate(config, deps);
    const agg = report.conditions['close-mic']!;
    expect(agg.runs).toBe(6);
    expect(runs).toHaveLength(6);
    expect(agg.errorLabels).toBeGreaterThan(10);
    expect(agg.coreRecall).toBeGreaterThanOrEqual(0.7);
    expect(agg.recallInclChecks).toBeGreaterThanOrEqual(0.8);
    expect(agg.falseAlertsPerRun).toBeLessThanOrEqual(0.5);
    expect(agg.falseNotesPerRun).toBeLessThanOrEqual(0.5);
  });

  it('is deterministic', () => {
    const one = { ...config, seeds: 1 };
    expect(evaluate(one, deps).report.conditions).toEqual(evaluate(one, deps).report.conditions);
  });
});
