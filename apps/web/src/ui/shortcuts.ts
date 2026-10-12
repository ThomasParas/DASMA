import { useEffect, useLayoutEffect, useRef } from 'react';

type KeyInfo = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** `spec` is a key value ('j', 'J', 'Enter', '?'), optionally prefixed 'mod+' (Cmd/Ctrl) and 'shift+' (only with mod). */
export function matchesShortcut(e: KeyInfo, spec: string): boolean {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const mod = parts.includes('mod');
  if (mod !== (e.metaKey || e.ctrlKey) || e.altKey) return false;
  if (mod) return e.key.toLowerCase() === key.toLowerCase() && e.shiftKey === parts.includes('shift');
  return e.key === key;
}

const KEY_LABELS: Record<string, string> = { ArrowDown: '↓', ArrowUp: '↑', Enter: '↵', Escape: 'Esc', Delete: 'Del', Backspace: '⌫' };

export function shortcutLabel(spec: string): string {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const k = KEY_LABELS[key] ?? (parts.length ? key.toUpperCase() : key);
  const mods = parts.map((p) => (p === 'mod' ? (IS_MAC ? '⌘' : 'Ctrl') : IS_MAC ? '⇧' : 'Shift'));
  return IS_MAC ? [...mods, k].join('') : [...mods, k].join('+');
}

const NOT_TYPING = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color']);

/** True for elements that take typed text, where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !NOT_TYPING.has((el as HTMLInputElement).type);
}

export interface ShortcutBinding {
  keys: string[];
  run(): void;
  enabled?: boolean;
  /** Also fire while a text field has focus (Esc, Cmd/Ctrl+Enter). */
  allowInFields?: boolean;
  /** Also fire on auto-repeated keydowns (holding the key), for navigation. */
  allowRepeat?: boolean;
}

/** Binds keys on the window; auto-repeated keydowns fire only `allowRepeat` bindings. Enter and Space (without Cmd/Ctrl) on a focused button or link are left to the browser's own click. */
export function useShortcuts(bindings: ShortcutBinding[], active = true): void {
  const ref = useRef(bindings);
  useLayoutEffect(() => {
    ref.current = bindings;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.key === 'Enter' || e.key === ' ') && !(e.metaKey || e.ctrlKey) && (tag === 'BUTTON' || tag === 'A')) return;
      const typing = isTypingTarget(e.target);
      for (const b of ref.current) {
        if (b.enabled === false || (typing && !b.allowInFields) || (e.repeat && !b.allowRepeat)) continue;
        if (b.keys.some((k) => matchesShortcut(e, k))) {
          e.preventDefault();
          b.run();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
