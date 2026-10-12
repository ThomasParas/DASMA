import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

export async function openFix(script = sampleScript(), cast?: Record<string, string[]>) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo, { script, cast });
  renderApp(`#/p/${production.id}/fix`, services);
  await screen.findByRole('listbox', { name: 'Script' });
  const stored = async () => (await services.repo.getLiveVersion(production.id))!.script;
  const unitEl = (id: string) => document.getElementById(`unit-${id}`)!;
  const selectedIds = () => [...document.querySelectorAll('[aria-selected="true"]')].map((e) => e.id.replace('unit-', ''));
  return { services, production, user: userEvent.setup(), stored, unitEl, selectedIds };
}

describe('Fix tags', () => {
  it('lists the units to check and steps through them with j and k', async () => {
    const { user, selectedIds } = await openFix();
    const list = screen.getByRole('region', { name: 'To check' });
    expect(within(list).getByRole('heading').textContent).toBe('To check (3)');
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      "heading?Morning-room in Algernon's flat",
      'new character?OKAY.',
      "new character?I'm sorry for that, for your sake.",
    ]);
    await user.keyboard('j');
    expect(selectedIds()).toEqual(['u1']);
    await user.keyboard('jk');
    expect(selectedIds()).toEqual(['u1']);
    await user.click(screen.getByRole('button', { name: /^Next to check/ }));
    expect(selectedIds()).toEqual(['u7']);
  });

  it('retags with keys and with buttons, and saves', async () => {
    const { user, stored, unitEl } = await openFix();
    await user.keyboard('j');
    await user.keyboard('f');
    expect(unitEl('u1').dataset.kind).toBe('frontMatter');
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
    await user.click(unitEl('u2'));
    await user.click(screen.getByRole('button', { name: /^Heading/ }));
    expect(unitEl('u2').dataset.kind).toBe('heading');
    await waitFor(async () => expect((await stored()).units.slice(0, 2).map((u) => u.kind)).toEqual(['frontMatter', 'heading']));
  });

  it("confirms with It's right, and undoes and redoes", async () => {
    const { user } = await openFix();
    await user.keyboard('j{Enter}');
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
    await user.keyboard('{Meta>}z{/Meta}');
    expect(screen.getByRole('heading', { name: 'To check (3)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
  });

  it('runs a focused button once when Enter is pressed on it', async () => {
    const { user } = await openFix();
    await user.keyboard('j');
    screen.getByRole('button', { name: /^It's right/ }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(screen.getByRole('heading', { name: 'To check (3)' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('selects a range with shift-click and cuts it', async () => {
    const { user, unitEl, selectedIds } = await openFix();
    await user.click(unitEl('u2'));
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4'));
    await user.keyboard('{/Shift}');
    expect(selectedIds()).toEqual(['u2', 'u3', 'u4']);
    await user.keyboard('x');
    expect(['u2', 'u3', 'u4'].every((id) => unitEl(id).classList.contains('cut'))).toBe(true);
    await user.keyboard('x');
    expect(unitEl('u3').classList.contains('cut')).toBe(false);
  });

  it('cuts selected words by splitting the unit', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u4'));
    await user.click(unitEl('u4').querySelector('[data-word="2"]')!);
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4').querySelector('[data-word="3"]')!);
    await user.keyboard('{/Shift}');
    expect(screen.getByText('Words 3–4 selected')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Cut words/ }));
    await waitFor(async () =>
      expect((await stored()).units.slice(3, 6).map((u) => [u.text, u.cut])).toEqual([
        ['Did you', false],
        ['hear what', true],
        ['I was playing, Lane?', false],
      ]),
    );
  });

  it('inserts and removes a scene break, and survives removing the selection', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u5'));
    await user.keyboard('b');
    expect(unitEl('u11').dataset.kind).toBe('sceneBreak');
    await user.click(unitEl('u11'));
    await user.keyboard('{Delete}');
    expect(document.getElementById('unit-u11')).toBeNull();
    expect(screen.getByText('Select a unit in the script.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Remove/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(unitEl('u11')).toBeTruthy();
  });

  it('shows a refused edit as a message', async () => {
    const { user, unitEl } = await openFix(sampleScript());
    await user.click(unitEl('u1'));
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u10'));
    await user.keyboard('{/Shift}');
    await user.keyboard('{Delete}');
    expect((await screen.findByRole('alert')).textContent).toBe('A script needs at least one unit.');
  });

  it('opens and closes the shortcut sheet', async () => {
    const { user } = await openFix();
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Shortcuts/ }));
    await user.click(screen.getByRole('button', { name: /^Close/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves and returns to the production page on Done', async () => {
    const { user, production, stored } = await openFix();
    await user.keyboard('jf');
    await user.click(screen.getByRole('button', { name: /^Done/ }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}`));
    expect((await stored()).units[0].kind).toBe('frontMatter');
  });

  it('stays on the screen with the error shown when Done cannot save', async () => {
    const { user, services, production } = await openFix();
    vi.spyOn(services.repo, 'saveScript').mockRejectedValue(new Error('QuotaExceededError'));
    await user.keyboard('jf');
    await user.click(screen.getByRole('button', { name: /^Done/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Not saved/);
    expect(window.location.hash).toBe(`#/p/${production.id}/fix`);
    expect(document.getElementById('unit-u1')!.dataset.kind).toBe('frontMatter');
  });
});
