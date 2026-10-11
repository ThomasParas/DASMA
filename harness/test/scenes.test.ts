import { describe, expect, it } from 'vitest';
import { assertSceneId, loadScenes, soloCharacters, toScriptLines, type Scene } from '../src/scenes';

describe('scenes', () => {
  it('loads all bundled scenes with unique line ids', () => {
    const scenes = loadScenes('all');
    expect(scenes.map((s) => s.id).sort()).toEqual(['earnest-act1', 'earnest-act1-cigarette', 'hamlet-to-be', 'romeo-balcony']);
    for (const s of scenes) {
      const ids = s.lines.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.source).toMatch(/Public domain/);
      for (const l of s.lines) expect(l.text).not.toMatch(/[[\]]/); // no stage directions in spoken text
    }
  });

  it('hamlet-to-be is a solo-only monologue', () => {
    const [h] = loadScenes(['hamlet-to-be']);
    expect(h!.modes).toEqual(['solo']);
    expect(soloCharacters(h!)).toEqual(['HAMLET']);
  });

  it('soloCharacters keeps characters with at least 4 lines, in first-appearance order', () => {
    const mk = (counts: Array<[string, number]>): Scene => ({
      id: 'x', title: 'x', source: 'x',
      lines: counts.flatMap(([c, n]) => Array.from({ length: n }, (_, k) => ({ id: `${c}${k}`, character: c, text: 'a b c' }))),
    });
    expect(soloCharacters(mk([['BEA', 3], ['ANN', 4], ['CY', 5]]))).toEqual(['ANN', 'CY']);
    expect(soloCharacters(mk([['ZOE', 4], ['ANN', 5]]))).toEqual(['ZOE', 'ANN']);
    expect(soloCharacters(loadScenes(['earnest-act1'])[0]!)).toEqual(['ALGERNON', 'LANE']);
    expect(soloCharacters(loadScenes(['earnest-act1-cigarette'])[0]!)).toEqual(['ALGERNON', 'JACK']);
  });

  it('loads by id and rejects unknown ids', () => {
    expect(loadScenes(['romeo-balcony'])).toHaveLength(1);
    expect(() => loadScenes(['nope'])).toThrow(/Unknown scene/);
  });

  it('converts to aligner script lines', () => {
    const [scene] = loadScenes(['earnest-act1']);
    expect(toScriptLines(scene!)[0]).toEqual({ id: 'E1', characterId: 'ALGERNON', text: 'Did you hear what I was playing, Lane?' });
  });

  it('only allows filename-safe scene ids', () => {
    expect(() => assertSceneId('romeo-balcony_2')).not.toThrow();
    for (const bad of ['../x', 'a/b', 'a b', '', 'x.json']) expect(() => assertSceneId(bad)).toThrow(/Invalid scene id/);
  });
});
