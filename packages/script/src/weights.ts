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
