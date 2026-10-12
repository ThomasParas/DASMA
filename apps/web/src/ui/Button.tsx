import type { ButtonHTMLAttributes } from 'react';
import { shortcutLabel } from './shortcuts';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The key that runs the same handler; shown as a hint inside the button. */
  shortcut?: string;
  variant?: 'primary' | 'plain' | 'danger';
}

export function Button({ shortcut, variant = 'plain', className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
      {shortcut && <kbd className="kbd">{shortcutLabel(shortcut)}</kbd>}
    </button>
  );
}
