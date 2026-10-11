export type SourceKind = 'pdf' | 'docx' | 'text';

export interface RawSpan {
  text: string;
  left: number;
  right: number;
  italic: boolean;
  bold: boolean;
}

export interface RawLine {
  /** 1-based. */
  page: number;
  /** The spans' text in reading order. */
  text: string;
  /** pdf: text items; docx: runs; text: one span. */
  spans: RawSpan[];
  /** Left edge in points (pdf), twips/20 (docx) or leading-space columns × 6 (text). */
  left: number;
  right: number;
  centered: boolean;
  /** More than half the line's letters are italic. */
  italic: boolean;
  bold: boolean;
  /** Font size in points; 0 if unknown. */
  size: number;
}

export interface RawDoc {
  source: SourceKind;
  pageWidth: number;
  pages: number;
  /** False when pages were estimated (docx without page breaks, text without form feeds). */
  realPages: boolean;
  lines: RawLine[];
}

/** Where a cleaned line came from: its page and its index in `RawDoc.lines`. */
export interface SourceRef {
  page: number;
  line: number;
}

export interface CleanLine extends RawLine {
  source: SourceRef[];
}

export interface CleanDoc {
  source: SourceKind;
  pageWidth: number;
  pages: number;
  realPages: boolean;
  lines: CleanLine[];
}

export type SpeakerConvention = 'ownLine' | 'inlinePeriod' | 'inlineColon' | 'classicalAbbrev';

export interface DocProfile {
  /** Indent bands: left edges clustered within 12 pt (pdf/docx) or one text column. */
  bands: number[];
  speakerBand: number | 'centered' | null;
  dialogueBand: number | null;
  directionBand: number | null;
  primary: SpeakerConvention | null;
  /** Kept when it covers at least 15% of recurring speeches. */
  secondary: SpeakerConvention | null;
  /** Shares, 0..1, among direction-like lines (italic, bracketed or off the speaker/dialogue bands). */
  directionMarks: { italic: number; parens: number; brackets: number; ownBand: number };
  /** Names from a cast-list block, normalized cue tokens. */
  castList: string[];
  /** Candidate speaker token → count in speaker position (only tokens seen at least twice). */
  cueTokens: Map<string, number>;
  /** Index of the first line that is not front matter. */
  frontMatterEnd: number;
}

export type UnitKind = 'dialogue' | 'direction' | 'characterName' | 'heading' | 'sceneBreak' | 'frontMatter';

export interface Unit {
  id: string;
  kind: UnitKind;
  characterId?: string;
  text: string;
  cut: boolean;
  /** Half-open ranges of `tokenize` word indices spoken in overlap. */
  overlapRanges?: Array<[number, number]>;
  /** 0..1 */
  tagConfidence: number;
  source: SourceRef[];
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
}

export interface Script {
  title: string;
  characters: Character[];
  units: Unit[];
}

export type ImportInput =
  | { kind: 'pdf'; bytes: Uint8Array }
  | { kind: 'docx'; bytes: Uint8Array }
  | { kind: 'text'; text: string };

export type ImportWarning =
  | { code: 'noSpeakers' }
  | { code: 'mixedConventions'; conventions: [SpeakerConvention, SpeakerConvention] }
  | { code: 'manyFlagged'; share: number }
  | { code: 'ambiguousAlias'; token: string; candidates: string[] };

export interface ImportResult {
  script: Script;
  profile: DocProfile;
  warnings: ImportWarning[];
  pages: number;
}
