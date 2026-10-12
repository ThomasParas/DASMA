import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

async function reviewWith(mode: 'file' | 'dasma', cast?: Record<string, string[]>) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo);
  const next = sampleScript();
  next.units = next.units.filter((u) => u.id !== 'u2');
  services.pending.set(production.id, { mode, script: next, pages: 1, unitHints: {}, importedFrom: { kind: mode === 'dasma' ? 'dasma' : 'text', names: ['v2'] }, warnings: [], ...(cast ? { cast } : {}) });
  renderApp(`#/p/${production.id}/reimport`, services);
  await screen.findByRole('heading', { name: 'Review the new script' });
  return { services, production, user: userEvent.setup() };
}

describe('Re-import review', () => {
  it('summarises the changes and keeps the new version', async () => {
    const { services, production, user } = await reviewWith('file');
    expect(screen.getByText('0 lines changed · 0 added · 1 removed · 9 unchanged')).toBeTruthy();
    expect(screen.getByText('Your fixes are kept on unchanged lines.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/fix`));
    expect((await services.repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
    expect(services.pending.has(production.id)).toBe(false);
  });

  it('shows a save failure, re-enables the button and saves on retry', async () => {
    const { services, production, user } = await reviewWith('file');
    const addVersion = services.repo.addVersion.bind(services.repo);
    let calls = 0;
    services.repo.addVersion = async (...args) => {
      if (calls++ === 0) throw new Error('disk full');
      return addVersion(...args);
    };
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not saved: disk full');
    expect((screen.getByRole('button', { name: 'Keep as version 2' }) as HTMLButtonElement).disabled).toBe(false);
    expect(await services.repo.listVersions(production.id)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/fix`));
    expect((await services.repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
  });

  it('does not add a second version when retrying after the cast update failed', async () => {
    const { services, production, user } = await reviewWith('dasma', { lane: ['Ann'] });
    const updateProduction = services.repo.updateProduction.bind(services.repo);
    let calls = 0;
    services.repo.updateProduction = async (...args) => {
      if (calls++ === 0) throw new Error('blocked');
      return updateProduction(...args);
    };
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not saved: blocked');
    expect(services.pending.has(production.id)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/fix`));
    expect((await services.repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
    expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann'] });
  });

  it('saves once when Keep is double clicked', async () => {
    const { services, production, user } = await reviewWith('file');
    await user.dblClick(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/fix`));
    expect((await services.repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
  });

  it('cancels without saving', async () => {
    const { services, production, user } = await reviewWith('file');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}`));
    expect(await services.repo.listVersions(production.id)).toHaveLength(1);
  });

  it('filters the change list', async () => {
    const { user } = await reviewWith('file');
    await user.click(screen.getByRole('button', { name: 'Removed' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Added' }));
    expect(screen.getByText('No lines of this kind.')).toBeTruthy();
  });

  it('replaces the cast from a .dasma update that carries one', async () => {
    const { services, production, user } = await reviewWith('dasma', { lane: ['Ann'] });
    expect(screen.getByText(/0 lines retagged or re-cut/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann'] }));
  });

  it('drops cast entries for characters a .dasma update without a cast removed', async () => {
    const services = makeServices();
    const { production } = await seedProduction(services.repo, { cast: { okay: ['Sam'], lane: ['Ann'] } });
    const next = sampleScript();
    next.units = next.units.filter((u) => u.id !== 'u7' && u.id !== 'u8');
    next.characters = next.characters.filter((c) => c.id !== 'okay');
    services.pending.set(production.id, { mode: 'dasma', script: next, pages: 1, unitHints: {}, importedFrom: { kind: 'dasma', names: ['v2.dasma'] }, warnings: [] });
    renderApp(`#/p/${production.id}/reimport`, services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Keep as version 2' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/fix`));
    expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann'] });
  });

  it('explains when there is nothing to review', async () => {
    const services = makeServices();
    const { production } = await seedProduction(services.repo);
    renderApp(`#/p/${production.id}/reimport`, services);
    expect(await screen.findByText('Nothing to review.')).toBeTruthy();
  });
});
