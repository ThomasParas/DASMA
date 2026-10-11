import type { Character, UnitKind } from '@dasma/script';

export type Family = 'licensed' | 'word' | 'classical';
export type Variant = '1' | '2' | '3' | 'p';
export type DocFormat = 'pdf' | 'docx' | 'text';

export interface DocSpec {
  family: Family;
  play: string;
  variant: Variant;
  seed: number;
}

export interface TruthUnit {
  kind: UnitKind;
  characterId?: string;
  text: string;
  /** Page the unit starts on. */
  page: number;
}

export interface TruthFile {
  docId: string;
  family: Family | 'local';
  play: string;
  variant: Variant | 'local';
  seed: number;
  format: DocFormat;
  pages: number;
  /** The play's cast, with every abbreviation the renderer used as an alias. */
  cast: Character[];
  units: TruthUnit[];
}

export interface Run {
  text: string;
  italic?: boolean;
  bold?: boolean;
}

export interface Para {
  runs: Run[];
  kind: 'front' | 'heading' | 'direction' | 'cue' | 'speech';
  /** Truth units that have text in this paragraph, in order. */
  truth: number[];
  align: 'left' | 'center';
  /** Points. */
  indent: number;
  gapBefore: boolean;
  /** Counts toward line numbers (speech lines). */
  numbered: boolean;
}

/** One drawn line of a PDF page (for the pasted-text variants). */
export interface DrawnLine {
  page: number;
  x: number;
  text: string;
  /** Paragraph index; -1 for a header, footer or line number. */
  para: number;
}

export function docId(s: DocSpec): string {
  return `${s.family}-${s.play}-v${s.variant}-s${s.seed}`;
}
