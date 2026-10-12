import { ScriptImportError } from '@dasma/script';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SAMPLE_TEXT, seedProduction } from '../fixtures';
import { FakeImporter, makeServices, outcomeFor, renderApp } from '../render';

const txt = (name: string, body = SAMPLE_TEXT) => new File([body], name, { type: 'text/plain' });

describe('Import screen', () => {
  it('creates a production from pasted text, asks to keep storage, and opens Fix tags', async () => {
    const { services } = renderApp('#/new');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Paste text' }));
    await user.type(screen.getByLabelText('Title'), 'Hamlet');
    await user.click(screen.getByLabelText('Script text'));
    await user.paste(SAMPLE_TEXT);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(window.location.hash.endsWith('/fix') || !!screen.queryByRole('button', { name: 'Continue' })).toBe(true));
    if (screen.queryByRole('button', { name: 'Continue' })) await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/[^/]+\/fix$/));
    const [item] = await services.repo.listProductions();
    expect(item.production.title).toBe('Hamlet');
    expect(services.persistCalls).toBe(1);
  });

  it('shows warnings in plain words before continuing', async () => {
    const importer = new FakeImporter(outcomeFor(undefined, undefined, [{ code: 'ambiguousAlias', token: 'MAX', candidates: ['MAXINE', 'MAXWELL'] }, { code: 'noSpeakers' }]));
    renderApp('#/new', makeServices({ importer }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Paste text' }));
    await user.click(screen.getByLabelText('Script text'));
    await user.paste('anything');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const items = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    expect(items).toEqual([
      "We couldn't find character names. Is each speech labelled like NAME: or with the name on its own line?",
      'MAX could be MAXINE or MAXWELL; check those speeches.',
    ]);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.hash).toMatch(/\/fix$/));
  });

  it('offers to paste when a PDF has no text layer', async () => {
    renderApp('#/new', makeServices({ importer: new FakeImporter(new ScriptImportError('noTextLayer')) }));
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Choose files'), txt('scan.txt'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect((await screen.findByRole('alert')).textContent).toContain("Scanned PDFs aren't supported yet");
    await user.click(screen.getByRole('button', { name: 'Paste the text instead' }));
    expect(screen.getByLabelText('Script text')).toBeTruthy();
  });

  it('refuses unsupported dropped files', async () => {
    renderApp('#/new');
    const zone = (await screen.findByText(/Drop PDF or Word files/)).closest('section')!;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'notes.rtf')] } });
    expect((await screen.findByRole('alert')).textContent).toContain('Save it as .docx or PDF');
  });

  it('takes the title from the first file and imports files in the order shown', async () => {
    const importer = new FakeImporter(outcomeFor());
    renderApp('#/new', makeServices({ importer }));
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Choose files'), [txt('act1.txt'), txt('act2.txt')]);
    expect(screen.queryByLabelText('Choose files')).toBeNull();
    expect(screen.getByLabelText('Add another file')).toBeTruthy();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('act1');
    await user.click(screen.getByRole('button', { name: 'Move act2.txt up' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(importer.calls).toHaveLength(1));
    expect(importer.calls[0].sources.map((s) => s.name)).toEqual(['act2.txt', 'act1.txt']);
    expect(importer.calls[0].title).toBe('act1');
  });

  it('sends a re-import to review instead of saving it', async () => {
    const services = makeServices({ importer: new FakeImporter(outcomeFor()) });
    const { production } = await seedProduction(services.repo);
    renderApp(`#/p/${production.id}/import`, services);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Re-import script' })).toBeTruthy();
    await user.upload(screen.getByLabelText('Choose files'), txt('earnest-v2.txt'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/reimport`));
    expect(services.pending.get(production.id)?.mode).toBe('file');
    expect((await services.repo.listVersions(production.id)).length).toBe(1);
  });

  it('creates only one production when Continue is clicked twice', async () => {
    const importer = new FakeImporter(outcomeFor(undefined, undefined, [{ code: 'noSpeakers' }]));
    const { services } = renderApp('#/new', makeServices({ importer }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Paste text' }));
    await user.click(screen.getByLabelText('Script text'));
    await user.paste('anything');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const cont = await screen.findByRole('button', { name: 'Continue' });
    fireEvent.click(cont);
    fireEvent.click(cont);
    await waitFor(() => expect(window.location.hash).toMatch(/\/fix$/));
    expect(await services.repo.listProductions()).toHaveLength(1);
  });
});
