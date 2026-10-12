import { applyEdit, FLAG_BELOW, type Script } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { buildReview, pagesOf } from '../../src/screens/reimport';
import type { PendingImport } from '../../src/services';
import { sampleScript } from '../fixtures';

function nextDraft(): Script {
  const s = sampleScript();
  s.units = s.units.filter((u) => u.id !== 'u2');
  s.units[2] = { ...s.units[2], text: 'Did you hear what I was playing, Lane? Tell me.' };
  s.units.push({ id: 'u11', kind: 'dialogue', characterId: 'lane', text: 'Yes, sir.', cut: false, tagConfidence: 0.95, source: [{ page: 2, line: 1 }] });
  return s;
}
const pending = (script: Script, mode: PendingImport['mode'] = 'file'): PendingImport => ({
  mode,
  script,
  pages: 2,
  unitHints: { u4: { band: 72, italic: false }, u11: { band: 72, italic: false } },
  importedFrom: { kind: 'text', names: ['v2.txt'] },
  warnings: [],
});

describe('buildReview', () => {
  it('carries fixes over a file re-import and lists changes in script order', () => {
    const live = applyEdit(sampleScript(), { type: 'setKind', unitIds: ['u1'], kind: 'frontMatter' });
    const r = buildReview(live, pending(nextDraft()), []);
    expect(r.counts).toEqual({ changed: 1, added: 1, removed: 1, unchanged: 8, retagged: 0 });
    expect(r.rows.map((row) => row.type)).toEqual(['removed', 'changed', 'added']);
    expect(r.result.units[0].kind).toBe('frontMatter');
    const changed = r.result.units.find((u) => u.text.endsWith('Tell me.'))!;
    expect(changed.id).toBe('u4');
    expect(changed.tagConfidence).toBeLessThan(FLAG_BELOW);
    expect(Object.keys(r.unitHints).sort()).toEqual(['u11', 'u4']);
  });

  it('takes a .dasma update as is and counts retagged or re-cut lines', () => {
    const next = sampleScript();
    next.units[5] = { ...next.units[5], cut: true };
    next.units[7] = { ...next.units[7], characterId: 'lane' };
    const r = buildReview(sampleScript(), { ...pending(next, 'dasma'), unitHints: {} }, []);
    expect(r.result).toBe(next);
    expect(r.counts).toMatchObject({ changed: 0, retagged: 2 });
    expect(r.rows.every((row) => row.type === 'retagged')).toBe(true);
  });

  it('counts pages from unit sources', () => {
    expect(pagesOf(nextDraft())).toBe(2);
  });
});
