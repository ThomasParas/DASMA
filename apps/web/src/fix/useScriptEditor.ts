import { applyEdit, EditError, type EditOp, type Script } from '@dasma/script';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { RevConflictError } from '../db/repo';
import type { ScriptVersionRow } from '../db/schema';
import { useServices } from '../services';

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';
export const UNDO_LIMIT = 200;
export const SAVE_FAILED = 'Not saved: the browser is out of space. Export a .dasma backup now.';

export interface ScriptEditor {
  status: 'loading' | 'ready' | 'missing';
  version: ScriptVersionRow | null;
  script: Script | null;
  /** Applies one op; returns the EditError message (and changes nothing) when it does not apply. */
  apply(op: EditOp): string | null;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  saveError: string | null;
  /** Saves pending edits; resolves true only when everything is saved (false after a failed save or a conflict). */
  flush(): Promise<boolean>;
}

/** Spec §7.1: the live version in memory, whole-script undo, saves debounced and serialised, flushed on leave. */
export function useScriptEditor(productionId: string, keep: () => readonly string[]): ScriptEditor {
  const { repo, saveDebounceMs } = useServices();
  const [status, setStatus] = useState<ScriptEditor['status']>('loading');
  const [version, setVersion] = useState<ScriptVersionRow | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const script = useRef<Script | null>(null);
  const past = useRef<Script[]>([]);
  const future = useRef<Script[]>([]);
  const rev = useRef(0);
  const versionId = useRef<string | null>(null);
  const dirty = useRef(false);
  const stopped = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepRef = useRef(keep);
  useLayoutEffect(() => {
    keepRef.current = keep;
  });

  useEffect(() => {
    let live = true;
    void repo.getLiveVersion(productionId).then((v) => {
      if (!live) return;
      if (!v) {
        setStatus('missing');
        return;
      }
      script.current = v.script;
      rev.current = v.rev;
      versionId.current = v.id;
      past.current = [];
      future.current = [];
      dirty.current = false;
      stopped.current = false;
      setVersion(v);
      setStatus('ready');
    });
    return () => {
      live = false;
    };
  }, [repo, productionId]);

  const saveNow = useCallback(async (): Promise<void> => {
    if (!dirty.current || stopped.current || !versionId.current || !script.current) return;
    const snapshot = script.current;
    dirty.current = false;
    setSaveState('saving');
    try {
      rev.current = await repo.saveScript(versionId.current, snapshot, rev.current);
      if (!dirty.current) {
        setSaveState('saved');
        setSaveError(null);
      }
    } catch (err) {
      if (err instanceof RevConflictError) {
        stopped.current = true;
        setSaveState('conflict');
        setSaveError(err.message);
      } else {
        dirty.current = true;
        setSaveState('error');
        setSaveError(SAVE_FAILED);
      }
    }
  }, [repo]);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    chain.current = chain.current.then(saveNow);
    await chain.current;
    return !dirty.current && !stopped.current;
  }, [saveNow]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), saveDebounceMs);
  }, [flush, saveDebounceMs]);

  const show = useCallback(
    (next: Script) => {
      script.current = next;
      dirty.current = true;
      rerender();
      schedule();
    },
    [schedule],
  );

  const apply = useCallback(
    (op: EditOp): string | null => {
      const cur = script.current;
      if (!cur) return 'The script is still loading.';
      let next: Script;
      try {
        next = applyEdit(cur, op, { keep: keepRef.current() });
      } catch (err) {
        if (err instanceof EditError) return err.message;
        throw err;
      }
      past.current = [...past.current, cur].slice(-UNDO_LIMIT);
      future.current = [];
      show(next);
      return null;
    },
    [show],
  );

  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (!prev || !script.current) return;
    past.current = past.current.slice(0, -1);
    future.current = [script.current, ...future.current];
    show(prev);
  }, [show]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next || !script.current) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, script.current].slice(-UNDO_LIMIT);
    show(next);
  }, [show]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  return {
    status,
    version,
    script: script.current,
    apply,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    saveState,
    saveError,
    flush,
  };
}
