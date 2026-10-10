import { describe, expect, it } from 'vitest';
import { loadScenes, toScriptLines } from '../src/scenes';

describe('scenes', () => {
  it('loads all bundled scenes with unique line ids', () => {
    const scenes = loadScenes('all');
    expect(scenes.map((s) => s.id).sort()).toEqual(['earnest-act1', 'romeo-balcony']);
    for (const s of scenes) {
      const ids = s.lines.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.source).toMatch(/Public domain/);
    }
  });

  it('loads by id and rejects unknown ids', () => {
    expect(loadScenes(['romeo-balcony'])).toHaveLength(1);
    expect(() => loadScenes(['nope'])).toThrow(/Unknown scene/);
  });

  it('converts to aligner script lines', () => {
    const [scene] = loadScenes(['earnest-act1']);
    expect(toScriptLines(scene!)[0]).toEqual({ id: 'E1', characterId: 'ALGERNON', text: 'Did you hear what I was playing, Lane?' });
  });
});
