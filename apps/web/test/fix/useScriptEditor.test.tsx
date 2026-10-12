import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SAVE_FAILED, useScriptEditor } from '../../src/fix/useScriptEditor';
import { ServicesContext, type Services } from '../../src/services';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices } from '../render';

async function setup(overrides: Partial<Services> = {}) {
  const services = makeServices(overrides);
  const { production, version } = await seedProduction(services.repo);
  const wrapper = ({ children }: { children: ReactNode }) => <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
  const hook = renderHook(() => useScriptEditor(production.id, () => []), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  const stored = async () => (await services.repo.getLiveVersion(production.id))!;
  return { services, production, version, hook, stored };
}

describe('useScriptEditor', () => {
  it('loads the live version', async () => {
    const { hook } = await setup();
    expect(hook.result.current.script).toEqual(sampleScript());
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('applies an edit and saves it with the next rev', async () => {
    const { hook, stored } = await setup();
    act(() => {
      expect(hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] })).toBeNull();
    });
    expect(hook.result.current.script!.units[0].tagConfidence).toBe(1);
    await waitFor(async () => expect((await stored()).rev).toBe(1));
    expect((await stored()).script.units[0].tagConfidence).toBe(1);
    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'));
  });

  it('returns the message of an edit that does not apply and changes nothing', async () => {
    const { hook } = await setup();
    let message: string | null = null;
    act(() => {
      message = hook.result.current.apply({ type: 'confirm', unitIds: ['nope'] });
    });
    expect(message).toBe('There is no unit nope.');
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('undoes and redoes, saving each state', async () => {
    const { hook, stored } = await setup();
    act(() => void hook.result.current.apply({ type: 'remove', unitIds: ['u2'] }));
    act(() => hook.result.current.undo());
    expect(hook.result.current.script!.units).toHaveLength(10);
    expect(hook.result.current.canRedo).toBe(true);
    await waitFor(async () => expect((await stored()).script.units).toHaveLength(10));
    act(() => hook.result.current.redo());
    expect(hook.result.current.script!.units).toHaveLength(9);
    await waitFor(async () => expect((await stored()).script.units).toHaveLength(9));
  });

  it(`keeps at most ${200} undo steps`, async () => {
    const { hook } = await setup({ saveDebounceMs: 60_000 });
    for (let k = 0; k < 205; k++) act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    for (let k = 0; k < 200; k++) act(() => hook.result.current.undo());
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('stops saving after another tab saved first', async () => {
    const { services, version, hook, stored } = await setup();
    await services.repo.saveScript(version.id, { ...sampleScript(), title: 'Other tab' }, 0);
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('conflict'));
    expect(hook.result.current.saveError).toBe('This script was changed in another tab. Reload to continue.');
    const save = vi.spyOn(services.repo, 'saveScript');
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u7'] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(save).not.toHaveBeenCalled();
    expect(hook.result.current.script!.units[6].tagConfidence).toBe(1);
    expect((await stored()).script.title).toBe('Other tab');
  });

  it('saves an edit made while a save is in flight', async () => {
    const { services, hook, stored } = await setup();
    const realSave = services.repo.saveScript.bind(services.repo);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(services.repo, 'saveScript').mockImplementationOnce(async (...args) => {
      await gate;
      return realSave(...args);
    });
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('saving'));
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u7'] }));
    release();
    await waitFor(async () => expect((await stored()).rev).toBe(2));
    const saved = (await stored()).script;
    expect([saved.units[0].tagConfidence, saved.units[6].tagConfidence]).toEqual([1, 1]);
    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'));
  });

  it('keeps edits in memory after a failed save and retries on the next change', async () => {
    const { services, hook, stored } = await setup();
    vi.spyOn(services.repo, 'saveScript').mockRejectedValueOnce(new Error('QuotaExceededError'));
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('error'));
    expect(hook.result.current.saveError).toBe(SAVE_FAILED);
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u7'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'));
    const saved = (await stored()).script;
    expect([saved.units[0].tagConfidence, saved.units[6].tagConfidence]).toEqual([1, 1]);
  });

  it('flushes a pending save when unmounted', async () => {
    const { hook, stored } = await setup({ saveDebounceMs: 60_000 });
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    hook.unmount();
    await waitFor(async () => expect((await stored()).script.units[0].tagConfidence).toBe(1));
  });

  it('reports a missing production', async () => {
    const services = makeServices();
    const wrapper = ({ children }: { children: ReactNode }) => <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
    const { result } = renderHook(() => useScriptEditor('missing', () => []), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('missing'));
  });
});
