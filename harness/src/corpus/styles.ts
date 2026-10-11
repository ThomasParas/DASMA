import type { Family } from './types';

export type CueMode = 'ownCentered' | 'ownLeft' | 'ownIndented' | 'inlinePeriod' | 'inlineColon' | 'classicalAbbrev';

export interface StyleSpec {
  /** 'mixed' (word 3): mostly inlineColon in mixed case, some ownLeft. */
  cue: CueMode | 'mixed';
  cueBold: boolean;
  /** Abbreviate one-word names after their first full cue (classical 2) or always (classicalAbbrev). */
  abbreviate: boolean;
  direction: { italic: boolean; wrap: 'parens' | 'brackets' | 'none'; indent: number };
  inline: { italic: boolean; wrap: 'parens' | 'brackets' };
  speechIndent: number;
  header: boolean;
  footer: 'number' | 'dashed' | null;
  lineNumbers: 'right' | 'left' | null;
  hyphenate: boolean;
  shout: boolean;
  tabs: boolean;
}

const BASE: StyleSpec = {
  cue: 'ownCentered',
  cueBold: false,
  abbreviate: false,
  direction: { italic: false, wrap: 'parens', indent: 0 },
  inline: { italic: false, wrap: 'parens' },
  speechIndent: 0,
  header: false,
  footer: null,
  lineNumbers: null,
  hyphenate: false,
  shout: false,
  tabs: false,
};

/** Spec §6.2. Variant p reuses variant 1's style. */
export const STYLES: Record<Family, Record<'1' | '2' | '3', StyleSpec>> = {
  licensed: {
    '1': { ...BASE, cue: 'ownCentered', direction: { italic: true, wrap: 'parens', indent: 36 }, inline: { italic: true, wrap: 'parens' }, header: true, footer: 'number' },
    '2': { ...BASE, cue: 'ownIndented', direction: { italic: true, wrap: 'none', indent: 72 }, inline: { italic: true, wrap: 'parens' }, footer: 'dashed' },
    '3': { ...BASE, cue: 'inlinePeriod', direction: { italic: false, wrap: 'brackets', indent: 0 }, inline: { italic: false, wrap: 'brackets' }, footer: 'number', hyphenate: true },
  },
  word: {
    '1': { ...BASE, cue: 'inlineColon', cueBold: true },
    '2': { ...BASE, cue: 'ownCentered', cueBold: true, direction: { italic: true, wrap: 'none', indent: 36 }, inline: { italic: true, wrap: 'parens' } },
    '3': { ...BASE, cue: 'mixed', shout: true, tabs: true },
  },
  classical: {
    '1': { ...BASE, cue: 'inlinePeriod', direction: { italic: false, wrap: 'brackets', indent: 0 }, inline: { italic: false, wrap: 'brackets' } },
    '2': { ...BASE, cue: 'ownLeft', abbreviate: true, direction: { italic: true, wrap: 'none', indent: 36 }, inline: { italic: true, wrap: 'brackets' }, lineNumbers: 'right' },
    '3': { ...BASE, cue: 'classicalAbbrev', abbreviate: true, direction: { italic: false, wrap: 'brackets', indent: 48 }, inline: { italic: false, wrap: 'brackets' }, lineNumbers: 'left' },
  },
};
