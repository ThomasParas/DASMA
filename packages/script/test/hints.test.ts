import { describe, expect, it } from 'vitest';
import { importScript } from '../src/import';

describe('importScript unitHints', () => {
  it('gives every unit a hint, and each speech the cue that started it', async () => {
    const text = ['ACT I', 'HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n');
    const result = await importScript({ kind: 'text', text });
    for (const u of result.script.units) {
      expect(result.unitHints[u.id]).toBeDefined();
      if (u.kind === 'dialogue' && u.characterId) {
        const c = result.script.characters.find((x) => x.id === u.characterId)!;
        expect([c.name, ...c.aliases]).toContain(result.unitHints[u.id].cue);
      }
      if (u.kind === 'characterName') expect(result.unitHints[u.id].cue).toBe(u.text.toUpperCase());
    }
  });

  it('records inline cues too', async () => {
    const text = ['HAMLET. To be.', 'HORATIO. My lord.', 'HAMLET. Go.', 'HORATIO. Yes.'].join('\n');
    const result = await importScript({ kind: 'text', text });
    const spoken = result.script.units.filter((u) => u.kind === 'dialogue');
    expect(spoken.length).toBeGreaterThan(0);
    for (const u of spoken) expect(['HAMLET', 'HORATIO']).toContain(result.unitHints[u.id].cue);
  });

  it('puts lines with different indents on different bands', async () => {
    const text = ['HAMLET', 'To be.', '          (He sits.)', 'HORATIO', 'My lord.', '          (He stands.)', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n');
    const result = await importScript({ kind: 'text', text });
    const said = result.script.units.find((u) => u.text === 'To be.')!;
    const sits = result.script.units.find((u) => u.text.includes('He sits'))!;
    expect(result.unitHints[said.id].band).not.toBe(result.unitHints[sits.id].band);
  });
});
