import type { Unit } from '@dasma/script';
import { useState } from 'react';
import { Button } from '../ui/Button';

export function EditTextPanel({ unit, onSave, onCancel }: { unit: Unit; onSave(text: string): void; onCancel(): void }) {
  const [text, setText] = useState(unit.text);
  return (
    <section aria-label="Edit text">
      <h2>Edit text</h2>
      <textarea
        autoFocus
        aria-label="Unit text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(text);
          }
        }}
      />
      {unit.overlapRanges && <p className="muted">Saving clears this speech's overlap marks.</p>}
      <Button variant="primary" shortcut="mod+Enter" onClick={() => onSave(text)}>
        Save
      </Button>{' '}
      <Button shortcut="Escape" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
