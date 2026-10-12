import type { Script } from '@dasma/script';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sampleScript } from '../fixtures';
import { openFix } from './open-fix';

describe('Fix tags: speakers and characters', () => {
  it('turns a fake name into a line by a nearby speaker with s then 1', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u7'));
    await user.keyboard('s');
    const picker = screen.getByRole('region', { name: 'Speech by' });
    expect(within(picker).getAllByRole('button').slice(0, 3).map((b) => b.textContent)).toEqual(['LANE1', 'OKAY2', 'ALGERNON3']);
    await user.keyboard('1');
    await waitFor(async () => {
      const s = await stored();
      expect([s.units[6].characterId, s.units[7].characterId]).toEqual(['lane', 'lane']);
      expect(s.characters.map((c) => c.id)).toEqual(['algernon', 'lane']);
    });
  });

  it('filters the picker by typing, without firing shortcuts', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u2'));
    await user.keyboard('s');
    await user.keyboard('dhalg');
    expect(unitEl('u2').dataset.kind).toBe('direction');
    expect((screen.getByLabelText('Find a character') as HTMLInputElement).value).toBe('dhalg');
    await user.clear(screen.getByLabelText('Find a character'));
    await user.keyboard('alg{Enter}');
    await waitFor(async () => expect((await stored()).units[1]).toMatchObject({ kind: 'dialogue', characterId: 'algernon' }));
  });

  it('creates a new character in one undo step', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u2'));
    await user.click(screen.getByRole('button', { name: /^Speech by/ }));
    await user.click(screen.getByRole('button', { name: 'New character…' }));
    await user.type(screen.getByLabelText('Name of the new character'), 'Lady Bracknell');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(unitEl('u2').textContent).toContain('Lady Bracknell');
    await user.keyboard('{Meta>}z{/Meta}');
    expect(unitEl('u2').dataset.kind).toBe('direction');
    expect(screen.queryByText('Lady Bracknell')).toBeNull();
  });

  it('marks a character name with n', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u7'));
    await user.keyboard('n');
    await user.click(within(screen.getByRole('region', { name: 'Character name' })).getByRole('button', { name: /^ALGERNON/ }));
    await waitFor(async () => expect((await stored()).units[7].characterId).toBe('algernon'));
  });

  it('applies a fix to the other lines like this when ticked', async () => {
    const script: Script = sampleScript();
    for (const [id, text] of [
      ['u11', 'I told you so.'],
      ['u12', 'You never did.'],
      ['u13', 'Yes I did.'],
    ]) script.units.push({ id, kind: 'direction', text, cut: false, tagConfidence: 0.5, source: [{ page: 1, line: 11 }] });
    const { user, unitEl, stored } = await openFix(script);
    await user.click(unitEl('u11'));
    await user.click(screen.getByLabelText('Also apply to the 2 other lines like this'));
    await user.keyboard('s1');
    await waitFor(async () => expect((await stored()).units.slice(10).map((u) => u.characterId)).toEqual(['algernon', 'algernon', 'algernon']));
    expect(screen.queryByLabelText(/Also apply/)).toBeNull();
  });

  it('moves selected speeches to another character', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u10'));
    await user.click(screen.getByRole('button', { name: 'Move selected speeches to…' }));
    await user.click(within(screen.getByRole('region', { name: 'Move selected speeches to' })).getByRole('button', { name: /^LANE/ }));
    await waitFor(async () => expect((await stored()).units[9].characterId).toBe('lane'));
  });

  it('moves the other lines like this too when ticked', async () => {
    const script: Script = sampleScript();
    for (const [id, text] of [
      ['u11', 'I told you so.'],
      ['u12', 'You never did.'],
      ['u13', 'Yes I did.'],
    ]) script.units.push({ id, kind: 'dialogue', characterId: 'algernon', text, cut: false, tagConfidence: 0.5, source: [{ page: 1, line: 11 }] });
    const { user, unitEl, stored } = await openFix(script);
    await user.click(unitEl('u11'));
    await user.click(screen.getByLabelText('Also apply to the 2 other lines like this'));
    await user.click(screen.getByRole('button', { name: 'Move selected speeches to…' }));
    await user.click(within(screen.getByRole('region', { name: 'Move selected speeches to' })).getByRole('button', { name: /^LANE/ }));
    await waitFor(async () => expect((await stored()).units.slice(10).map((u) => u.characterId)).toEqual(['lane', 'lane', 'lane']));
    expect((await stored()).units[9].characterId).toBe('algernon');
  });

  it('starts each picker with an empty filter', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u2'));
    await user.keyboard('s');
    await user.keyboard('alg');
    await user.click(screen.getByRole('button', { name: /^Character name/ }));
    expect(screen.getByRole('region', { name: 'Character name' })).toBeTruthy();
    expect((screen.getByLabelText('Find a character') as HTMLInputElement).value).toBe('');
  });

  it('renames, edits aliases and highlights a character', async () => {
    const { user, stored, unitEl } = await openFix();
    const panel = screen.getByRole('region', { name: 'Characters' });
    await user.click(within(panel).getAllByRole('button', { name: 'Rename' })[2]);
    await user.clear(screen.getByLabelText('New name for OKAY'));
    await user.type(screen.getByLabelText('New name for OKAY'), 'Okay Man{Enter}');
    await user.click(within(panel).getAllByRole('button', { name: 'Edit aliases' })[0]);
    await user.clear(screen.getByLabelText('Aliases for ALGERNON'));
    await user.type(screen.getByLabelText('Aliases for ALGERNON'), 'ALGY, MONCRIEFF{Enter}');
    await waitFor(async () => {
      const s = await stored();
      expect(s.characters.map((c) => [c.name, c.aliases])).toEqual([
        ['ALGERNON', ['ALGY', 'MONCRIEFF']],
        ['LANE', []],
        ['Okay Man', []],
      ]);
    });
    await user.click(within(panel).getByRole('button', { name: 'LANE' }));
    expect(unitEl('u6').classList.contains('hl')).toBe(true);
  });

  it('merges a character and moves its cast entry', async () => {
    const { user, services, production, stored } = await openFix(sampleScript(), { okay: ['Sam'], lane: ['Ann'] });
    const panel = screen.getByRole('region', { name: 'Characters' });
    await user.click(within(panel).getAllByRole('button', { name: 'Merge into…' })[2]);
    await user.selectOptions(screen.getByLabelText('Merge OKAY into'), 'lane');
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(async () => expect((await stored()).characters.map((c) => c.id)).toEqual(['algernon', 'lane']));
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann', 'Sam'] }));
  });

  it('says so when the cast list cannot be updated after a merge', async () => {
    const { user, services, stored } = await openFix(sampleScript(), { okay: ['Sam'], lane: ['Ann'] });
    vi.spyOn(services.repo, 'updateProduction').mockRejectedValue(new Error('disk full'));
    const panel = screen.getByRole('region', { name: 'Characters' });
    await user.click(within(panel).getAllByRole('button', { name: 'Merge into…' })[2]);
    await user.selectOptions(screen.getByLabelText('Merge OKAY into'), 'lane');
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The merge was applied, but the cast list could not be updated: disk full');
    await waitFor(async () => expect((await stored()).characters.map((c) => c.id)).toEqual(['algernon', 'lane']));
  });

  it('splits a silently merged alias out (CAPULET → CAPULET’S COUSIN)', async () => {
    const script: Script = {
      title: 'R&J',
      characters: [{ id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: ['CAPULET'] }],
      units: [
        { id: 'u1', kind: 'characterName', text: 'CAPULET.', cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 1 }] },
        { id: 'u2', kind: 'dialogue', characterId: 'capulet-s-cousin', text: 'Welcome, gentlemen!', cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 2 }] },
        { id: 'u3', kind: 'characterName', text: "CAPULET'S COUSIN.", cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 3 }] },
        { id: 'u4', kind: 'dialogue', characterId: 'capulet-s-cousin', text: "By'r lady, thirty years.", cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 4 }] },
      ],
    };
    const { user, stored } = await openFix(script);
    await user.click(screen.getByRole('button', { name: 'Split out CAPULET' }));
    await waitFor(async () => expect((await stored()).units.map((u) => u.characterId)).toEqual([undefined, 'capulet', undefined, 'capulet-s-cousin']));
  });
});
