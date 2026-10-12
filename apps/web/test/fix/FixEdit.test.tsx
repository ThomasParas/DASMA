import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sampleScript } from '../fixtures';
import { openFix } from './open-fix';

describe('Fix tags: text, split, join, overlap', () => {
  it('edits a unit’s text; typing never fires shortcuts', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u4'));
    await user.keyboard('e');
    const box = screen.getByLabelText('Unit text');
    await user.clear(box);
    await user.type(box, 'dh Did you hear me?');
    expect(unitEl('u4').dataset.kind).toBe('dialogue');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(async () => expect((await stored()).units[3].text).toBe('dh Did you hear me?'));
    expect(screen.queryByLabelText('Unit text')).toBeNull();
  });

  it('keeps the editor open with a message when the text is empty, and warns about overlap marks', async () => {
    const script = sampleScript();
    script.units[3] = { ...script.units[3], overlapRanges: [[0, 2]] };
    const { user, unitEl } = await openFix(script);
    await user.click(unitEl('u4'));
    await user.click(screen.getByRole('button', { name: /^Edit text/ }));
    expect(screen.getByText("Saving clears this speech's overlap marks.")).toBeTruthy();
    await user.clear(screen.getByLabelText('Unit text'));
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('use Remove');
    expect(screen.getByLabelText('Unit text')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Unit text')).toBeNull();
  });

  it('splits before the selected word and joins back', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u4'));
    await user.click(unitEl('u4').querySelector('[data-word="3"]')!);
    await user.keyboard('/');
    expect(unitEl('u4').textContent).toContain('Did you hear');
    expect(unitEl('u11').textContent).toContain('what I was playing, Lane?');
    await user.click(unitEl('u11'));
    await user.keyboard('J');
    expect(document.getElementById('unit-u11')).toBeNull();
    expect(unitEl('u4').textContent).toContain('Did you hear what I was playing, Lane?');
  });

  it('marks and clears overlap on selected words', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u4'));
    await user.click(unitEl('u4').querySelector('[data-word="5"]')!);
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4').querySelector('[data-word="6"]')!);
    await user.keyboard('{/Shift}');
    await user.keyboard('o');
    await waitFor(async () => expect((await stored()).units[3].overlapRanges).toEqual([[5, 7]]));
    await user.click(unitEl('u4').querySelector('[data-word="5"]')!);
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4').querySelector('[data-word="6"]')!);
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: /^Overlap/ }));
    await waitFor(async () => expect((await stored()).units[3].overlapRanges).toBeUndefined());
  });
});
