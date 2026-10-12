// Every hand-set scoring constant of the tagger (spec §5.2). Tuned in the measure-and-tune rounds (spec §6.5); never trained.

/** A unit is flagged for review when its tagConfidence is below this. */
export const FLAG_BELOW = 0.8;
/** The manyFlagged warning fires when more than this share of units is flagged. */
export const MANY_FLAGGED_SHARE = 0.3;

/** Alias confidences (spec §5.4). */
export const EXACT_CONFIDENCE = 1;
export const CAST_LIST_MERGE_CONFIDENCE = 0.95;
export const PREFIX_MERGE_CONFIDENCE = 0.8;
export const AMBIGUOUS_CONFIDENCE = 0.5;

/** Words that start lines but are never speaker names. */
export const STOP_TOKENS = new Set([
  'I', 'A', 'O', 'OH', 'AH', 'AY', 'AYE', 'NO', 'YES', 'WELL', 'WHY', 'WHAT', 'THEN', 'NOW', 'SO', 'COME', 'GO', 'HERE', 'THERE',
  'GOOD', 'SIR', 'MADAM', 'AND', 'BUT', 'THE', 'THIS', 'THAT', 'IT', 'HE', 'SHE', 'WE', 'YOU', 'THEY', 'MY', 'THY', 'HOW',
  'ALAS', 'PEACE', 'STAY', 'LOOK', 'SEE', 'HARK', 'FAREWELL', 'ADIEU', 'INDEED', 'TRUE', 'HA', 'TIS', "'TIS", 'NAY',
  'MR', 'MRS', 'MS', 'DR', 'ST', 'SCENE', 'ACT', 'NOTE', 'TIME', 'PLACE', 'SETTING', 'CURTAIN', 'END', 'THE END',
  'BLACKOUT', 'LIGHTS', 'PAUSE', 'SILENCE', 'EXIT', 'EXEUNT', 'ENTER', 'FINIS',
]);
/** A token whose first word is one of these is never a speaker name ("ENTER HAMLET"). */
export const STOP_FIRST_WORDS = new Set(['ENTER', 'EXIT', 'EXEUNT', 'ACT', 'SCENE', 'THE END']);

/** Line-state emission log-scores (spec §5.2). "PerMark" terms are multiplied by the profile's direction-mark shares. */
export const EMISSION = {
  temperature: 1,
  base: { cue: -3, cueInline: -3, dialogue: 0, direction: -1, heading: -5, front: -2 },
  cue: { shape: 2, known: 3, inCast: 1, primary: 1.5, speakerBand: 1.5, bold: 0.5, nextCueShaped: -3, notShape: -12 },
  cueInline: { shape: 2, known: 3, inCast: 1, primary: 3, notShape: -12 },
  dialogue: { dialogueBand: 1, italic: 0.5, italicPerMark: 0.5, bracketBlock: 0.5, bracketPerMark: 1, offBandPerMark: 1, knownCueShape: -2 },
  direction: { italic: 0.5, italicPerMark: 0.5, bracketBlock: 0.5, bracketPerMark: 1, directionBand: 1, directionBandPerMark: 1.5 },
  heading: { pattern: 8, notPattern: -10 },
  front: { before: 4, after: -6 },
  sceneBreak: { direction: 6, other: -6 },
};

type State = 'cue' | 'cueInline' | 'dialogue' | 'dirIn' | 'dirOut' | 'heading' | 'front';
/** Transition log-scores; a missing entry is forbidden. dirIn: a direction inside a speech; dirOut: outside one. */
export const TRANSITIONS: Record<State, Partial<Record<State, number>>> = {
  cue: { dialogue: -0.1, dirIn: -1.5 },
  cueInline: { dialogue: -0.3, dirIn: -1.5, cue: -0.8, cueInline: -0.8, dirOut: -1.5, heading: -2.5 },
  dialogue: { dialogue: -0.3, cue: -0.8, cueInline: -0.8, dirIn: -1.5, dirOut: -1.5, heading: -2.5 },
  dirIn: { dialogue: -0.5, dirIn: -0.8, cue: -1, cueInline: -1, dirOut: -2, heading: -2.5 },
  dirOut: { dirOut: -0.5, cue: -0.5, cueInline: -0.5, heading: -1.5, dialogue: -5 },
  heading: { heading: -1, dirOut: -0.5, cue: -0.5, cueInline: -0.5, dialogue: -5 },
  front: { front: -0.1, heading: -1, dirOut: -2, cue: -2, cueInline: -2 },
};
export const START: Partial<Record<State, number>> = { front: 0, heading: -1, dirOut: -1, cue: -1, cueInline: -1, dialogue: -6 };
