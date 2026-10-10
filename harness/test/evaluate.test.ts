import { describe, expect, it } from 'vitest';
import { evaluate, type EvalConfig } from '../src/evaluate';
import { fakeTts } from './helpers/fake-tts';
import { ScriptedRecognizer, oracleWords } from './helpers/scripted-recognizer';

const config: EvalConfig = {
  sceneIds: ['earnest-act1', 'romeo-balcony'],
  modes: ['director'],
  seedFrom: 1,
  seeds: 3,
  rooms: ['close-mic'],
  patience: 0.5,
  heardConfidenceFloor: 0,
  strictness: { mode: 'word-perfect' },
  errorRate: 0.35,
  benignRate: 0.2,
  model: 'oracle',
};
const deps = { tts: fakeTts, makeRecognizer: (r: Parameters<typeof oracleWords>[0]) => new ScriptedRecognizer(oracleWords(r)) };

describe('evaluate (end to end, perfect recognizer)', () => {
  it('director mode finds planted errors without false alarms', () => {
    const { report, runs } = evaluate(config, deps);
    const agg = report.conditions['director-close-mic']!;
    expect(agg.runs).toBe(6);
    expect(runs).toHaveLength(6);
    expect(runs.every((r) => r.condition === 'director-close-mic' && r.mode === 'director' && r.character === null)).toBe(true);
    expect(agg.errorLabels).toBeGreaterThan(10);
    expect(agg.coreRecall!).toBeGreaterThanOrEqual(0.7);
    expect(agg.recallInclChecks!).toBeGreaterThanOrEqual(0.8);
    expect(agg.falseAlertsPerRun).toBeLessThanOrEqual(0.5);
    expect(agg.falseNotesPerRun).toBeLessThanOrEqual(0.5);
  });

  it('solo mode runs once per character with ≥ 4 lines, expecting only that character’s lines', () => {
    const { report, runs } = evaluate({ ...config, modes: ['solo'], seeds: 2 }, deps);
    // earnest-act1: ALGERNON, LANE; romeo-balcony: JULIET, ROMEO → 4 characters × 2 seeds.
    expect(runs).toHaveLength(8);
    expect(report.conditions['solo-close-mic']!.runs).toBe(8);
    for (const r of runs) {
      expect(r.character).not.toBeNull();
      for (const n of r.notes) expect(n.characterId).toBe(r.character);
      for (const l of r.labels) {
        expect(l.characterId).toBe(r.character);
        expect(['jumped-cue', 'chatter']).not.toContain(l.kind);
      }
      expect(r.segments.some((s) => s.seg.silent)).toBe(true);
      expect(r.heard.length).toBeGreaterThan(0);
    }
  });

  it('a solo-only scene is skipped in director mode', () => {
    const { runs } = evaluate({ ...config, sceneIds: ['hamlet-to-be'], modes: ['director', 'solo'], seeds: 1 }, deps);
    expect(runs.map((r) => r.mode)).toEqual(['solo']);
  });

  it('seedFrom selects a disjoint seed range', () => {
    const a = evaluate({ ...config, seeds: 2 }, deps).runs.map((r) => r.seed);
    const b = evaluate({ ...config, seedFrom: 11, seeds: 2 }, deps).runs.map((r) => r.seed);
    expect(new Set(a)).toEqual(new Set([1, 2]));
    expect(new Set(b)).toEqual(new Set([11, 12]));
  });

  it('is deterministic', () => {
    const cfg: EvalConfig = { ...config, modes: ['solo', 'director'], seeds: 1 };
    expect(evaluate(cfg, deps).report.conditions).toEqual(evaluate(cfg, deps).report.conditions);
  });
});
