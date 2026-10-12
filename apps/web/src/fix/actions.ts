import { similarUnits, wordSpans, type CheckItem, type EditOp, type Script, type UnitHint } from '@dasma/script';

export interface Selection {
  unitIds: string[];
  anchor: string;
}

/** Selected words inside one selected unit: `tokenize` word indices, `to` exclusive. */
export interface WordSel {
  unitId: string;
  anchor: number;
  from: number;
  to: number;
}

export type PickPurpose = 'speechBy' | 'setName' | 'moveSpeeches';
export type Panel = { kind: 'none' } | { kind: 'help' } | { kind: 'picker'; purpose: PickPurpose } | { kind: 'editText' };

/** One action: it renders one button and binds its keys (spec §3.3), so a key and its button always do the same thing. */
export interface FixAction {
  id: string;
  label: string;
  keys: string[];
  group: 'nav' | 'tag' | 'edit' | 'history' | 'help';
  enabled: boolean;
  run(): void;
}

export interface FixContext {
  script: Script;
  hints: Readonly<Record<string, UnitHint>>;
  queue: CheckItem[];
  sel: Selection | null;
  words: WordSel | null;
  similar: boolean;
  panel: Panel;
  /** Applies an op; false (with a message shown) when it does not apply. */
  apply(op: EditOp): boolean;
  select(unitId: string): void;
  openPanel(panel: Panel): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export function liveSelection(script: Script, sel: Selection | null): Selection | null {
  if (!sel) return null;
  const ids = new Set(script.units.map((u) => u.id));
  const unitIds = sel.unitIds.filter((id) => ids.has(id));
  if (unitIds.length === 0) return null;
  return { unitIds, anchor: ids.has(sel.anchor) ? sel.anchor : unitIds[0] };
}

export function liveWords(script: Script, sel: Selection | null, words: WordSel | null): WordSel | null {
  if (!words || !sel || sel.unitIds.length !== 1 || sel.anchor !== words.unitId) return null;
  const u = script.units.find((x) => x.id === words.unitId);
  return u && words.to <= wordSpans(u.text).length ? words : null;
}

export function coveredBy(ranges: ReadonlyArray<readonly [number, number]> | undefined, from: number, to: number): boolean {
  for (let k = from; k < to; k++) if (!ranges?.some(([a, b]) => k >= a && k < b)) return false;
  return true;
}

/** Speakers of the closest dialogue units around a unit, nearest first (the picker's 1–9). */
export function nearbySpeakers(script: Script, anchorId: string, max = 9): string[] {
  const i = script.units.findIndex((u) => u.id === anchorId);
  if (i < 0) return [];
  const out: string[] = [];
  for (let d = 1; out.length < max && (i - d >= 0 || i + d < script.units.length); d++) {
    for (const k of [i - d, i + d]) {
      const u = script.units[k];
      if (u?.kind === 'dialogue' && u.characterId && !out.includes(u.characterId)) out.push(u.characterId);
    }
  }
  return out.slice(0, max);
}

/** The selected units, widened to the "lines like this" when apply-to-similar is ticked (spec §6.4). */
export function targetIds(ctx: FixContext): string[] {
  if (!ctx.sel) return [];
  if (!ctx.similar || ctx.sel.unitIds.length !== 1) return ctx.sel.unitIds;
  return [ctx.sel.anchor, ...similarUnits(ctx.script, ctx.hints, ctx.sel.anchor)];
}

function stepUnit(ctx: FixContext, delta: number): void {
  const { units } = ctx.script;
  if (units.length === 0) return;
  const at = ctx.sel ? units.findIndex((u) => u.id === ctx.sel!.anchor) : -1;
  const i = at < 0 ? (delta > 0 ? 0 : units.length - 1) : Math.min(units.length - 1, Math.max(0, at + delta));
  ctx.select(units[i].id);
}

function stepQueue(ctx: FixContext, delta: number): void {
  const { queue, script } = ctx;
  if (queue.length === 0) return;
  const pos = new Map(script.units.map((u, i) => [u.id, i]));
  const at = ctx.sel ? (pos.get(ctx.sel.anchor) ?? -1) : -1;
  const item =
    delta > 0
      ? (queue.find((q) => pos.get(q.unitId)! > at) ?? queue[0])
      : ([...queue].reverse().find((q) => pos.get(q.unitId)! < at) ?? queue[queue.length - 1]);
  ctx.select(item.unitId);
}

export function buildFixActions(ctx: FixContext): FixAction[] {
  const sel = ctx.sel;
  const has = !!sel && sel.unitIds.length > 0;
  const selected = sel ? ctx.script.units.filter((u) => sel.unitIds.includes(u.id)) : [];
  const wordsUnit = ctx.words ? (ctx.script.units.find((u) => u.id === ctx.words!.unitId) ?? null) : null;
  const ids = () => targetIds(ctx);
  const kind = (k: 'direction' | 'heading' | 'frontMatter') => () => void ctx.apply({ type: 'setKind', unitIds: ids(), kind: k });

  return [
    { id: 'next', label: 'Next to check', keys: ['j'], group: 'nav', enabled: ctx.queue.length > 0, run: () => stepQueue(ctx, 1) },
    { id: 'prev', label: 'Previous to check', keys: ['k'], group: 'nav', enabled: ctx.queue.length > 0, run: () => stepQueue(ctx, -1) },
    { id: 'down', label: 'Next unit', keys: ['ArrowDown'], group: 'nav', enabled: ctx.script.units.length > 0, run: () => stepUnit(ctx, 1) },
    { id: 'up', label: 'Previous unit', keys: ['ArrowUp'], group: 'nav', enabled: ctx.script.units.length > 0, run: () => stepUnit(ctx, -1) },
    { id: 'confirm', label: "It's right", keys: ['Enter'], group: 'tag', enabled: has, run: () => void ctx.apply({ type: 'confirm', unitIds: ids() }) },
    { id: 'direction', label: 'Direction', keys: ['d'], group: 'tag', enabled: has, run: kind('direction') },
    { id: 'heading', label: 'Heading', keys: ['h'], group: 'tag', enabled: has, run: kind('heading') },
    { id: 'frontMatter', label: 'Front matter', keys: ['f'], group: 'tag', enabled: has, run: kind('frontMatter') },
    {
      id: 'cut',
      label: wordsUnit ? 'Cut words' : 'Cut',
      keys: ['x'],
      group: 'edit',
      enabled: has,
      run: () => {
        if (ctx.words && wordsUnit) ctx.apply({ type: 'setCutWords', unitId: ctx.words.unitId, from: ctx.words.from, to: ctx.words.to, cut: !wordsUnit.cut });
        else ctx.apply({ type: 'setCut', unitIds: sel!.unitIds, cut: !selected.every((u) => u.cut) });
      },
    },
    { id: 'sceneBreak', label: 'Scene break before', keys: ['b'], group: 'edit', enabled: has, run: () => void ctx.apply({ type: 'insertSceneBreak', beforeUnitId: sel!.anchor }) },
    { id: 'remove', label: 'Remove', keys: ['Delete', 'Backspace'], group: 'edit', enabled: has, run: () => void ctx.apply({ type: 'remove', unitIds: ids() }) },
    { id: 'undo', label: 'Undo', keys: ['mod+z'], group: 'history', enabled: ctx.canUndo, run: ctx.undo },
    { id: 'redo', label: 'Redo', keys: ['mod+shift+z'], group: 'history', enabled: ctx.canRedo, run: ctx.redo },
    {
      id: 'help',
      label: 'Shortcuts',
      keys: ['?'],
      group: 'help',
      enabled: true,
      run: () => ctx.openPanel(ctx.panel.kind === 'help' ? { kind: 'none' } : { kind: 'help' }),
    },
  ];
}
