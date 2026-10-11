import { buildExpected } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { UNKNOWN_CHARACTER, toAlignLines } from '../src/align-adapter';
import type { Script } from '../src/types';

describe('toAlignLines', () => {
  it('passes dialogue units to the engine, with overlap zones and an unknown speaker', () => {
    const script: Script = {
      title: 'T',
      characters: [{ id: 'nora', name: 'NORA', aliases: [] }],
      units: [
        { id: 'u1', kind: 'characterName', text: 'NORA', cut: false, tagConfidence: 1, source: [] },
        { id: 'u2', kind: 'dialogue', characterId: 'nora', text: 'I never said that.', cut: false, overlapRanges: [[2, 4]], tagConfidence: 1, source: [] },
        { id: 'u3', kind: 'direction', text: '(Pause.)', cut: false, tagConfidence: 1, source: [] },
        { id: 'u4', kind: 'dialogue', text: 'Who speaks?', cut: true, tagConfidence: 0.4, source: [] },
      ],
    };
    const lines = toAlignLines(script);
    expect(lines).toEqual([
      { id: 'u2', characterId: 'nora', text: 'I never said that.', cut: false, overlapRanges: [[2, 4]] },
      { id: 'u4', characterId: UNKNOWN_CHARACTER, text: 'Who speaks?', cut: true },
    ]);
    expect(buildExpected(lines, { mode: 'word-perfect' }).map((w) => w.zone)).toEqual(['checked', 'checked', 'overlap', 'overlap']);
  });
});
