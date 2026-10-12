import { checkQueue, type EditOp } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { buildFixActions, coveredBy, liveSelection, liveWords, nearbySpeakers, targetIds, type FixContext } from '../../src/fix/actions';
import { sampleScript } from '../fixtures';

function ctx(over: Partial<FixContext> = {}) {
  const script = sampleScript();
  const applied: EditOp[] = [];
  const selected: string[] = [];
  const c: FixContext = {
    script,
    hints: {},
    queue: checkQueue(script),
    sel: null,
    words: null,
    similar: false,
    panel: { kind: 'none' },
    apply: (op) => {
      applied.push(op);
      return true;
    },
    select: (id) => selected.push(id),
    openPanel: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    ...over,
  };
  const run = (id: string) => buildFixActions(c).find((a) => a.id === id)!.run();
  return { c, applied, selected, run };
}

describe('Fix actions', () => {
  it('steps through the check queue, wrapping around', () => {
    const t = ctx({ sel: { unitIds: ['u7'], anchor: 'u7' } });
    t.run('next');
    t.run('prev');
    expect(t.selected).toEqual(['u8', 'u1']);
    const end = ctx({ sel: { unitIds: ['u8'], anchor: 'u8' } });
    end.run('next');
    expect(end.selected).toEqual(['u1']);
    const none = ctx();
    none.run('next');
    none.run('prev');
    expect(none.selected).toEqual(['u1', 'u8']);
  });

  it('moves unit by unit and stops at the ends', () => {
    const t = ctx({ sel: { unitIds: ['u10'], anchor: 'u10' } });
    t.run('down');
    t.run('up');
    expect(t.selected).toEqual(['u10', 'u9']);
  });

  it('widens tag actions to similar units only when ticked', () => {
    const s = sampleScript();
    s.units.push({ id: 'u11', kind: 'heading', text: 'Another guess', cut: false, tagConfidence: 0.5, source: [] });
    const base = { script: s, queue: checkQueue(s), sel: { unitIds: ['u1'], anchor: 'u1' } };
    expect(targetIds(ctx(base).c)).toEqual(['u1']);
    expect(targetIds(ctx({ ...base, similar: true }).c)).toEqual(['u1', 'u11']);
    const t = ctx({ ...base, similar: true });
    t.run('frontMatter');
    expect(t.applied).toEqual([{ type: 'setKind', unitIds: ['u1', 'u11'], kind: 'frontMatter' }]);
  });

  it('cuts words when words are selected, otherwise toggles whole units', () => {
    const words = ctx({ sel: { unitIds: ['u4'], anchor: 'u4' }, words: { unitId: 'u4', anchor: 1, from: 1, to: 3 } });
    words.run('cut');
    expect(words.applied).toEqual([{ type: 'setCutWords', unitId: 'u4', from: 1, to: 3, cut: true }]);
    const units = ctx({ sel: { unitIds: ['u4', 'u5'], anchor: 'u4' } });
    units.run('cut');
    expect(units.applied).toEqual([{ type: 'setCut', unitIds: ['u4', 'u5'], cut: true }]);
  });

  it('disables selection actions with nothing selected', () => {
    const enabled = Object.fromEntries(buildFixActions(ctx().c).map((a) => [a.id, a.enabled]));
    expect(enabled).toMatchObject({ confirm: false, direction: false, cut: false, remove: false, sceneBreak: false, next: true, help: true });
  });

  it('drops vanished ids from the selection and words', () => {
    const s = sampleScript();
    expect(liveSelection(s, { unitIds: ['u4', 'gone'], anchor: 'gone' })).toEqual({ unitIds: ['u4'], anchor: 'u4' });
    expect(liveSelection(s, { unitIds: ['gone'], anchor: 'gone' })).toBeNull();
    const sel = { unitIds: ['u4'], anchor: 'u4' };
    expect(liveWords(s, sel, { unitId: 'u4', anchor: 0, from: 0, to: 8 })).not.toBeNull();
    expect(liveWords(s, sel, { unitId: 'u4', anchor: 0, from: 0, to: 9 })).toBeNull();
    expect(liveWords(s, { unitIds: ['u4', 'u5'], anchor: 'u4' }, { unitId: 'u4', anchor: 0, from: 0, to: 1 })).toBeNull();
  });

  it('knows which words are covered by overlap ranges and who speaks nearby', () => {
    expect(coveredBy([[1, 3]], 1, 3)).toBe(true);
    expect(coveredBy([[1, 2]], 1, 3)).toBe(false);
    expect(coveredBy(undefined, 0, 1)).toBe(false);
    expect(nearbySpeakers(sampleScript(), 'u7')).toEqual(['lane', 'okay', 'algernon']);
  });
});
