import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { shortcutLabel } from './shortcuts';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The key that runs the same handler; shown as a hint inside the button. */
  shortcut?: string;
  variant?: 'primary' | 'plain' | 'danger';
  /**
   * False: a pointer click does not move focus to the button (keyboard focus still works), so a later Enter runs
   * the page's Enter shortcut instead of clicking this button again.
   */
  keepFocus?: boolean;
}

export const keepFocusOff = (e: MouseEvent) => e.preventDefault();

export function Button({ shortcut, variant = 'plain', keepFocus = true, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} onMouseDown={keepFocus ? undefined : keepFocusOff} {...rest}>
      {children}
      {shortcut && <kbd className="kbd">{shortcutLabel(shortcut)}</kbd>}
    </button>
  );
}
