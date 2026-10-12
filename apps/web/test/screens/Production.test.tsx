import { readDasma, toAnswerKey } from '@dasma/script';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

async function open(opts: Parameters<typeof seedProduction>[1] = {}, devTools = false) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo, opts);
  if (devTools) await services.repo.setMeta('devTools', true);
  renderApp(`#/p/${production.id}`, services);
  await screen.findByLabelText('Production title');
  return { services, production, user: userEvent.setup() };
}

describe('Production page', () => {
  it('summarises the live script with links to fix and re-import', async () => {
    const { production } = await open();
    expect(screen.getByText(/10 units · 3 to check/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fix tags' }).getAttribute('href')).toBe(`#/p/${production.id}/fix`);
    expect(screen.getByRole('link', { name: 'Re-import' }).getAttribute('href')).toBe(`#/p/${production.id}/import`);
  });

  it('renames the production on blur', async () => {
    const { services, production, user } = await open();
    const title = screen.getByLabelText('Production title');
    await user.clear(title);
    await user.type(title, 'The Importance{Enter}');
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.title).toBe('The Importance'));
  });

  it('saves actor names for a character', async () => {
    const { services, production, user } = await open();
    await user.type(screen.getByLabelText('Actors for LANE'), 'Ann Lee, Bo Diaz');
    await user.tab();
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann Lee', 'Bo Diaz'] }));
  });

  it('exports .dasma without the cast unless it is ticked', async () => {
    const { services, user } = await open({ title: 'Romeo/Juliet: Act 1', cast: { lane: ['Ann'] } });
    await user.click(screen.getByRole('button', { name: 'Export .dasma' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(services.downloads[0].name).toBe('Romeo-Juliet- Act 1.dasma');
    const plain = readDasma(services.downloads[0].text);
    expect(plain.script).toEqual({ ...sampleScript(), title: 'Romeo/Juliet: Act 1' });
    expect(plain.cast).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Export .dasma' }));
    await user.click(screen.getByLabelText('Include cast list'));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(readDasma(services.downloads[1].text).cast).toEqual({ lane: ['Ann'] });
  });

  it('leaves cast entries for characters no longer in the script out of the export', async () => {
    const { services, user } = await open({ cast: { lane: ['Ann'], ghost: ['Old Actor'] } });
    await user.click(screen.getByRole('button', { name: 'Export .dasma' }));
    await user.click(screen.getByLabelText('Include cast list'));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(readDasma(services.downloads[0].text).cast).toEqual({ lane: ['Ann'] });
  });

  it('exports an answer key named after the source file, only with developer tools on', async () => {
    const { services, user } = await open({ names: ['earnest.pdf'], kind: 'pdf' }, true);
    await user.click(screen.getByRole('button', { name: 'Export answer key' }));
    expect(services.downloads[0].name).toBe('earnest.truth.json');
    expect(JSON.parse(services.downloads[0].text)).toEqual(toAnswerKey(sampleScript(), 1));
  });

  it('hides the answer key without developer tools', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Export answer key' })).toBeNull();
  });

  it('disables the answer key for a script from several files', async () => {
    await open({ names: ['act1.pdf', 'act2.pdf'], kind: 'pdf' }, true);
    expect((screen.getByRole('button', { name: 'Export answer key' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Only for a script imported from a single file.')).toBeTruthy();
  });

  it('deletes only after the title is typed', async () => {
    const { services, production, user } = await open();
    await user.click(screen.getByText('Delete production'));
    const del = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    await user.type(screen.getByLabelText('Type the title to confirm'), 'Earnest');
    await user.click(del);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await services.repo.getProduction(production.id)).toBeUndefined();
  });

  it('says when the production does not exist', async () => {
    renderApp('#/p/missing');
    expect(await screen.findByText("This production doesn't exist.")).toBeTruthy();
  });
});
