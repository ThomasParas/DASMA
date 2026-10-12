import { importScript } from '@dasma/script';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/ui/Button';

describe('web test project', () => {
  it('runs @dasma/script in jsdom with pdf.js stubbed', async () => {
    const r = await importScript({ kind: 'text', text: 'HAMLET\nTo be.\nHORATIO\nMy lord.\nHAMLET\nGo.\nHORATIO\nYes.' });
    expect(r.script.characters.map((c) => c.id)).toEqual(['hamlet', 'horatio']);
  });

  it('renders a button with its shortcut hint', () => {
    render(<Button shortcut="d">Direction</Button>);
    const b = screen.getByRole('button', { name: /Direction/ });
    expect(b.textContent).toBe('Directiond');
    expect(b.querySelector('kbd')?.textContent).toBe('d');
  });
});
