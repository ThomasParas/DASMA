import { DEFAULT_ALIGN_OPTIONS, buildExpected, type HeardWord, type ScriptLineInput } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { runEngine } from '../src/run-engine';
import { ScriptedRecognizer } from './helpers/scripted-recognizer';

const LINES: ScriptLineInput[] = [
  { id: 'A', characterId: 'X', text: 'one two three four five six' },
  { id: 'B', characterId: 'Y', text: 'seven eight nine ten' },
];
const SR = 16000;
const expected = buildExpected(LINES, { mode: 'word-perfect' });
const options = { ...DEFAULT_ALIGN_OPTIONS, patience: 0 };

function words(text: string): HeardWord[] {
  return text.split(' ').map((w, i) => ({ text: w, start: 0.5 + i * 0.4, end: 0.8 + i * 0.4, confidence: 0.95, final: true }));
}

describe('runEngine', () => {
  it('runs a clean performance to completion', () => {
    const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(words('one two three four five six seven eight nine ten')), expected, options);
    expect(run.durationSec).toBe(6);
    expect(run.events.flatMap(({ event }) => (event.type === 'lineDone' ? [event.lineId] : []))).toEqual(['A', 'B']);
    expect(run.events.some(({ event }) => event.type === 'flag')).toBe(false);
  });

  it('stamps flags with the audio time at which they fired', () => {
    const heard = words('one two three four five six seven eight elephant ten');
    const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(heard), expected, options);
    const flag = run.events.find(({ event }) => event.type === 'flag');
    expect(flag).toBeDefined();
    expect(flag!.audioTime).toBeGreaterThanOrEqual(heard[8]!.end);
    expect(flag!.event).toMatchObject({ alert: true, note: { lineId: 'B', category: 'wrong-words' } });
  });

  it('returns the stabilized words it heard', () => {
    const heard = words('one two three four five six seven eight nine ten');
    const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(heard), expected, options);
    expect(run.heard.map((w) => w.text)).toEqual(heard.map((w) => w.text));
  });

  it('the audio-quality meter does not double-count heard confidence on wrong words (pass spec §8a)', () => {
    const at = (c: number) => words('one two three four five six seven eight elephant ten').map((w) => ({ ...w, confidence: c }));
    const confidenceOf = (c: number) => {
      const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(at(c)), expected, options);
      const flag = run.events.find(({ event }) => event.type === 'flag')!.event;
      return flag.type === 'flag' ? flag.note.confidence : NaN;
    };
    // A wrong-words note carries the heard confidence once (0.85 × 0.55); the meter does not scale it again.
    expect(confidenceOf(0.55)).toBe(Math.round(0.85 * 0.55 * 1000) / 1000);
    expect(confidenceOf(0.95)).toBe(Math.round(0.85 * 0.95 * 1000) / 1000);
  });

  it('the audio-quality meter scales a dropped line by the confidence of the words around it (pass spec §5.2, §8a)', () => {
    const THREE: ScriptLineInput[] = [
      { id: 'A', characterId: 'X', text: 'one two three four five six' },
      { id: 'B', characterId: 'Y', text: 'seven eight nine ten' },
      { id: 'C', characterId: 'Y', text: 'apple banana cherry grape lemon' },
    ];
    const exp3 = buildExpected(THREE, { mode: 'word-perfect' });
    const droppedLineConfidence = (c: number) => {
      const heard = words('one two three four five six apple banana cherry grape lemon').map((w) => ({ ...w, confidence: c }));
      const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(heard), exp3, { ...options, patience: 0.5 });
      const notes = run.events.flatMap(({ event }) => (event.type === 'lineDone' && event.lineId === 'B' ? event.notes : []));
      expect(notes).toEqual([expect.objectContaining({ category: 'dropped-line' })]);
      return notes[0]!.confidence;
    };
    // Confident words around it: the meter reads 1 and the dropped line keeps its base 0.95.
    expect(droppedLineConfidence(0.95)).toBe(0.95);
    // Words heard at 0.5: the meter reads clamp((0.5 − 0.3) / 0.5, 0.6, 1) = 0.6, so 0.95 × 0.6.
    expect(droppedLineConfidence(0.5)).toBe(0.57);
  });
});
