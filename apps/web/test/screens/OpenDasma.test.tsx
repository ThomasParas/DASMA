import { writeDasma } from '@dasma/script';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

const dasma = (text: string, name = 'earnest.dasma') => new File([text], name);
const earnest = () => writeDasma(sampleScript(), { cast: { lane: ['Ann'] } });

async function openLibrary(seed = false) {
  const services = makeServices();
  const seeded = seed ? await seedProduction(services.repo) : null;
  renderApp('#/', services);
  const input = await screen.findByLabelText('Open .dasma file');
  return { services, seeded, input, user: userEvent.setup() };
}

describe('Opening a .dasma file', () => {
  it('creates a production and shows it', async () => {
    const { services, input, user } = await openLibrary();
    await user.upload(input, dasma(earnest()));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/[^/]+$/));
    const [item] = await services.repo.listProductions();
    expect(item.production).toMatchObject({ title: 'Earnest', origin: 'dasma', cast: { lane: ['Ann'] } });
    expect((await services.repo.getLiveVersion(item.production.id))!.importedFrom).toEqual({ kind: 'dasma', names: ['earnest.dasma'] });
  });

  it('offers to update a production with the same title', async () => {
    const { services, seeded, input, user } = await openLibrary(true);
    await user.upload(input, dasma(earnest()));
    await user.click(await screen.findByRole('button', { name: 'Update "Earnest"' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${seeded!.production.id}/reimport`));
    expect(services.pending.get(seeded!.production.id)).toMatchObject({ mode: 'dasma', cast: { lane: ['Ann'] } });
  });

  it('can import it as a new production instead', async () => {
    const { services, input, user } = await openLibrary(true);
    await user.upload(input, dasma(earnest()));
    await user.click(await screen.findByRole('button', { name: 'Import as a new production' }));
    await waitFor(async () => expect(await services.repo.listProductions()).toHaveLength(2));
  });

  it('explains files it cannot open', async () => {
    const { input, user } = await openLibrary();
    await user.upload(input, dasma('nonsense'));
    expect((await screen.findByRole('alert')).textContent).toBe("This isn't a DASMA script file.");
    await user.upload(input, dasma(earnest().replace('"formatVersion": 1', '"formatVersion": 9')));
    expect((await screen.findByRole('alert')).textContent).toBe('This file was made by a newer version of DASMA. Update the app to open it.');
    await user.upload(input, dasma(earnest().replace('"kind": "heading"', '"kind": "song"')));
    expect((await screen.findByRole('alert')).textContent).toBe("This DASMA file is damaged and can't be opened.");
  });
});
