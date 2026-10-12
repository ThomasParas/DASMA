import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { matchesShortcut, useShortcuts } from '../../src/ui/shortcuts';

function Harness({ log }: { log: string[] }) {
  useShortcuts([
    { keys: ['j'], run: () => log.push('j') },
    { keys: ['J'], run: () => log.push('J') },
    { keys: ['mod+z'], run: () => log.push('undo') },
    { keys: ['mod+shift+z'], run: () => log.push('redo') },
    { keys: ['Escape'], run: () => log.push('esc'), allowInFields: true },
    { keys: ['Enter'], run: () => log.push('enter') },
    { keys: ['d'], run: () => log.push('d'), enabled: false },
    { keys: ['mod+Enter'], run: () => log.push('save'), allowInFields: true },
  ]);
  return (
    <>
      <input aria-label="field" />
      <input type="checkbox" aria-label="box" />
      <button type="button">Btn</button>
    </>
  );
}

describe('matchesShortcut', () => {
  const ev = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });
  it('matches keys, case and modifiers', () => {
    expect(matchesShortcut(ev('j'), 'j')).toBe(true);
    expect(matchesShortcut(ev('J', { shiftKey: true }), 'j')).toBe(false);
    expect(matchesShortcut(ev('J', { shiftKey: true }), 'J')).toBe(true);
    expect(matchesShortcut(ev('z', { metaKey: true }), 'mod+z')).toBe(true);
    expect(matchesShortcut(ev('z', { ctrlKey: true }), 'mod+z')).toBe(true);
    expect(matchesShortcut(ev('Z', { metaKey: true, shiftKey: true }), 'mod+shift+z')).toBe(true);
    expect(matchesShortcut(ev('z', { metaKey: true, shiftKey: true }), 'mod+z')).toBe(false);
    expect(matchesShortcut(ev('j', { metaKey: true }), 'j')).toBe(false);
    expect(matchesShortcut(ev('?', { shiftKey: true }), '?')).toBe(true);
  });
});

describe('useShortcuts', () => {
  it('runs bindings from the page, ignores text fields and disabled bindings', async () => {
    const log: string[] = [];
    render(<Harness log={log} />);
    const user = userEvent.setup();
    await user.keyboard('jJd');
    await user.keyboard('{Meta>}z{/Meta}{Control>}z{/Control}{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(log).toEqual(['j', 'J', 'undo', 'undo', 'redo']);
    await user.click(screen.getByLabelText('field'));
    await user.keyboard('j{Escape}');
    expect(log.slice(5)).toEqual(['esc']);
    await user.click(screen.getByLabelText('box'));
    await user.keyboard('j');
    expect(log.slice(6)).toEqual(['j']);
  });

  it('ignores auto-repeated keydowns', () => {
    const log: string[] = [];
    render(<Harness log={log} />);
    fireEvent.keyDown(document.body, { key: 'j' });
    fireEvent.keyDown(document.body, { key: 'j', repeat: true });
    fireEvent.keyDown(document.body, { key: 'j', repeat: true });
    expect(log).toEqual(['j']);
  });

  it('leaves Enter on a focused button to the browser', async () => {
    const log: string[] = [];
    render(<Harness log={log} />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Btn' }).focus();
    await user.keyboard('{Enter}');
    expect(log).toEqual([]);
  });

  it('fires Cmd/Ctrl+Enter while a button has focus', async () => {
    const log: string[] = [];
    render(<Harness log={log} />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Btn' }).focus();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(log).toEqual(['save']);
  });
});
