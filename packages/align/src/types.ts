export type Category =
  | 'dropped-line'
  | 'dropped-words'
  | 'added-words'
  | 'wrong-words'
  | 'transposed'
  | 'paraphrase'
  | 'jumped-cue'
  | 'called-for-line';

/** A word as emitted by a recognizer. Times are seconds on the run clock. */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  final: boolean;
}

/** A heard word after normalization (one HeardWord may become several tokens, e.g. numbers). */
export interface HeardToken {
  text: string;
  norm: string;
  phon: [string, string];
  start: number;
  end: number;
  confidence: number;
}

export interface ScriptLineInput {
  id: string;
  characterId: string;
  text: string;
  cut?: boolean;
  /** Half-open ranges of raw word indices (from tokenize) that are spoken in overlap. */
  overlapRanges?: Array<[number, number]>;
}

export interface ExpectedWord {
  idx: number;
  lineId: string;
  characterId: string;
  /** Index of the raw token within its line (several ExpectedWords can share one raw token). */
  wordInLine: number;
  raw: string;
  norm: string;
  phon: [string, string];
  zone: 'checked' | 'overlap';
}

export type Strictness = { mode: 'word-perfect' } | { mode: 'lenient'; lineMatchThreshold: number };

export interface NoteDraft {
  lineId: string;
  characterId: string;
  category: Category;
  expected: string;
  heard: string;
  confidence: number;
  status: 'note' | 'check';
  at: number;
}

export type AlignEvent =
  | { type: 'matched'; idx: number; at: number }
  | { type: 'suspect'; idxs: number[]; at: number }
  /**
   * A note may be flagged twice: first with alert false, then once more with alert true when the script position is
   * confirmed after it (pass spec §6.1). Consumers count alerts from flags with alert true.
   */
  | { type: 'flag'; note: NoteDraft; alert: boolean; at: number }
  | { type: 'stumble'; idx: number; heard: string; at: number }
  | { type: 'lost'; guesses: number[]; at: number }
  | { type: 'reanchored'; fromIdx: number; toIdx: number; lostFor: number; at: number }
  | { type: 'notRun'; fromIdx: number; toIdx: number; at: number }
  | { type: 'calledForLine'; idx: number; at: number }
  /** A later lineDone for the same lineId supersedes earlier ones (e.g. after a restart); consumers keep the last. */
  | { type: 'lineDone'; lineId: string; notes: NoteDraft[]; at: number };

export interface AlignOptions {
  /** 0 = instant, 1 = relaxed. */
  patience: number;
  strictness: Strictness;
  windowSize: number;
  lostAfter: number;
  longLossSec: number;
  alertMinConfidence: number;
  noteMinConfidence: number;
  /** Pass spec §5.3: floor of the heard-confidence multiplier for content-word notes (0 = full penalty). */
  heardConfidenceFloor: number;
}

export const DEFAULT_ALIGN_OPTIONS: AlignOptions = {
  patience: 0.5,
  strictness: { mode: 'word-perfect' },
  windowSize: 30,
  lostAfter: 6,
  longLossSec: 10,
  alertMinConfidence: 0.75,
  noteMinConfidence: 0.5,
  heardConfidenceFloor: 0,
};
