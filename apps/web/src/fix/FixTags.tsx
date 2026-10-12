import { checkQueue, similarUnits, uniqueCharacterId, type EditOp, type Script } from '@dasma/script';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProductionRow } from '../db/schema';
import { navigate } from '../router';
import { NotFound } from '../screens/NotFound';
import { useServices } from '../services';
import { useShortcuts } from '../ui/shortcuts';
import { buildFixActions, liveSelection, liveWords, pickOp, type FixContext, type Panel, type Selection, type WordSel } from './actions';
import { CharacterList } from './CharacterList';
import { CharacterPicker } from './CharacterPicker';
import { CheckList } from './CheckList';
import { FixHeader } from './FixHeader';
import { FixPanel } from './FixPanel';
import { ScriptView } from './ScriptView';
import { ShortcutSheet } from './ShortcutSheet';
import { useScriptEditor, type ScriptEditor } from './useScriptEditor';

export function FixTags({ productionId }: { productionId: string }) {
  const { repo } = useServices();
  const [production, setProduction] = useState<ProductionRow | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void repo.getProduction(productionId).then((p) => {
      if (live) setProduction(p ?? null);
    });
    return () => {
      live = false;
    };
  }, [repo, productionId]);
  const keep = useCallback(() => Object.keys(production?.cast ?? {}), [production]);
  const editor = useScriptEditor(productionId, keep);

  if (editor.status === 'missing' || production === null) return <NotFound message="This production doesn't exist." />;
  if (editor.status === 'loading' || production === undefined || !editor.script || !editor.version) return <main className="page">Loading…</main>;
  return <FixWorkspace editor={editor} script={editor.script} production={production} onProductionChange={setProduction} />;
}

interface WorkspaceProps {
  editor: ScriptEditor;
  script: Script;
  production: ProductionRow;
  onProductionChange(p: ProductionRow): void;
}

export function FixWorkspace({ editor, script, production, onProductionChange }: WorkspaceProps) {
  const { repo } = useServices();
  const hints = editor.version!.unitHints;
  const [rawSel, setSel] = useState<Selection | null>(null);
  const [rawWords, setWords] = useState<WordSel | null>(null);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [message, setMessage] = useState<string | null>(null);
  const [similar, setSimilar] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const queue = useMemo(() => checkQueue(script), [script]);
  const flagged = useMemo(() => new Set(queue.map((q) => q.unitId)), [queue]);
  const sel = useMemo(() => liveSelection(script, rawSel), [script, rawSel]);
  const words = useMemo(() => liveWords(script, sel, rawWords), [script, sel, rawWords]);
  const similarIds = useMemo(() => (sel && sel.unitIds.length === 1 ? similarUnits(script, hints, sel.anchor) : []), [script, hints, sel]);

  const scriptRef = useRef(script);
  useLayoutEffect(() => {
    scriptRef.current = script;
  });

  const { apply: editorApply, undo, redo, flush } = editor;
  const apply = useCallback(
    (op: EditOp): boolean => {
      const err = editorApply(op);
      setMessage(err);
      if (err) return false;
      setSimilar(false);
      setWords(null);
      setPanel({ kind: 'none' });
      return true;
    },
    [editorApply],
  );

  const select = useCallback((unitId: string) => {
    setSel({ unitIds: [unitId], anchor: unitId });
    setWords(null);
    setMessage(null);
    setSimilar(false);
    document.getElementById(`unit-${unitId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const onUnitClick = useCallback((unitId: string, shift: boolean) => {
    setWords(null);
    setMessage(null);
    setSimilar(false);
    setSel((prev) => {
      if (!shift || !prev) return { unitIds: [unitId], anchor: unitId };
      const units = scriptRef.current.units;
      const a = units.findIndex((u) => u.id === prev.anchor);
      const b = units.findIndex((u) => u.id === unitId);
      if (a < 0 || b < 0) return { unitIds: [unitId], anchor: unitId };
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return { unitIds: units.slice(lo, hi + 1).map((u) => u.id), anchor: prev.anchor };
    });
  }, []);

  const onWordClick = useCallback((unitId: string, k: number, shift: boolean) => {
    setWords((prev) =>
      shift && prev && prev.unitId === unitId
        ? { unitId, anchor: prev.anchor, from: Math.min(prev.anchor, k), to: Math.max(prev.anchor, k) + 1 }
        : { unitId, anchor: k, from: k, to: k + 1 },
    );
  }, []);

  const ctx: FixContext = { script, hints, queue, sel, words, similar, panel, apply, select, openPanel: setPanel, undo, redo, canUndo: editor.canUndo, canRedo: editor.canRedo };
  const actions = buildFixActions(ctx);
  const onPick = (characterId: string) => {
    if (panel.kind === 'picker') apply(pickOp(ctx, panel.purpose, characterId));
  };
  const onCreate = (name: string) => {
    if (panel.kind !== 'picker') return;
    const id = uniqueCharacterId(script, name);
    apply({ type: 'batch', ops: [{ type: 'newCharacter', id, name }, pickOp(ctx, panel.purpose, id)] });
  };
  const onMerged = async (fromId: string, intoId: string) => {
    if (!production.cast[fromId]) return;
    const cast = { ...production.cast };
    cast[intoId] = [...new Set([...(cast[intoId] ?? []), ...cast[fromId]])];
    delete cast[fromId];
    onProductionChange(await repo.updateProduction(production.id, { cast }));
  };
  const PICKER_TITLES = { speechBy: 'Speech by', setName: 'Character name', moveSpeeches: 'Move speeches to' } as const;
  useShortcuts(
    actions.map((a) => ({ keys: a.keys, run: a.run, enabled: a.enabled })),
    panel.kind === 'none' || panel.kind === 'help',
  );
  useShortcuts([{ keys: ['Escape'], run: () => setPanel({ kind: 'none' }), allowInFields: true }], panel.kind !== 'none');

  const done = async () => {
    if (!(await flush())) return;
    navigate({ name: 'production', id: production.id });
  };

  return (
    <div className="fix">
      <FixHeader
        title={production.title}
        version={editor.version!.version}
        toCheck={queue.length}
        history={actions.filter((a) => a.group === 'history')}
        saveState={editor.saveState}
        saveError={editor.saveError}
        onDone={() => void done()}
      />
      <div className="fix-cols">
        <aside className="fix-left">
          <CheckList script={script} queue={queue} current={sel?.anchor ?? null} onSelect={select} />
          <CharacterList script={script} hints={hints} highlight={highlight} onHighlight={setHighlight} apply={apply} onMerged={(a, b) => void onMerged(a, b)} />
        </aside>
        <ScriptView script={script} selected={sel} words={words} flagged={flagged} highlight={highlight} onUnitClick={onUnitClick} onWordClick={onWordClick} />
        <FixPanel
          script={script}
          sel={sel}
          words={words}
          message={message}
          actions={actions.filter((a) => a.group !== 'history')}
          similarCount={similarIds.length}
          similar={similar}
          onSimilar={setSimilar}
        >
          {panel.kind === 'picker' && sel && (
            <CharacterPicker script={script} anchorId={sel.anchor} title={PICKER_TITLES[panel.purpose]} onPick={onPick} onCreate={onCreate} onClose={() => setPanel({ kind: 'none' })} />
          )}
        </FixPanel>
      </div>
      {panel.kind === 'help' && <ShortcutSheet actions={actions} onClose={() => setPanel({ kind: 'none' })} />}
    </div>
  );
}
