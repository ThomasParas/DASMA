import { Button } from '../ui/Button';
import { shortcutLabel } from '../ui/shortcuts';
import type { FixAction } from './actions';

export function ShortcutSheet({ actions, onClose }: { actions: FixAction[]; onClose(): void }) {
  return (
    <div className="sheet" role="dialog" aria-label="Keyboard shortcuts">
      <h2>Keyboard shortcuts</h2>
      <table className="grid">
        <tbody>
          {actions
            .filter((a) => a.keys.length > 0)
            .map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td>{a.keys.map(shortcutLabel).join(' or ')}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p>Shift-click to select several units, or several words inside a selected unit. In the character picker, 1–9 pick the nearby speakers.</p>
      <Button shortcut="Escape" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
