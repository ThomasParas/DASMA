const HEADINGS = [
  /^act\s+([ivxlc]+|\d+|one|two|three|four|five)\b/i,
  /^(first|second|third|fourth|fifth|last)\s+act\b/i,
  /^scene\b/i,
  /^(the\s+)?(prologue|epilogue)\b/i,
];
const HEADING_MAX_WORDS = 12;

/** Act and scene headings (spec §5.2). "ACT DROP" is not one. */
export function isHeading(text: string): boolean {
  const t = text.trim();
  return t.split(/\s+/).length <= HEADING_MAX_WORDS && HEADINGS.some((re) => re.test(t));
}

const NUMBER_WORD = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
const ORDINAL = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last';
/** "SCENE" followed by a number, a Roman numeral (i–xxxix) or an ordinal: "SCENE III.", "Scene 2", "SCENE THE FIRST". */
const NUMBERED_SCENE = new RegExp(
  `^scene\\W*(the\\s+)?(\\d+|(?=[ivx])x{0,3}(ix|iv|v?i{0,3})|${NUMBER_WORD}|${ORDINAL})(?![\\p{L}\\p{N}])`,
  'iu',
);

/**
 * Rule S5 (spec §6.5a): a scene heading that names a place but has no number or ordinal, such as Gutenberg's
 * "SCENE. Elsinore.". Inside or at the end of a cast list it is a setting line and stays front matter. A bare "SCENE"
 * names no place, so it stays a heading.
 */
export function isSettingLine(text: string): boolean {
  const t = text.trim();
  return /^scene\W+\p{L}/iu.test(t) && isHeading(t) && !NUMBERED_SCENE.test(t);
}

/**
 * The line that opens a cast list (spec §5.1). The end-of-word check is a Unicode lookahead
 * because `\b` stays ASCII-only even under the `u` flag, so it never matches after "æ".
 */
export const CAST_LIST_HEADER =
  /^(dramatis person(ae|æ)|characters|cast( of characters)?|(the )?persons (in|of) the play|persons represented)(?![\p{L}\p{N}_])/iu;

/** A line made only of `*`, `#` or `~` marks: a scene break. */
export const SCENE_BREAK = /^[*#~](\s*[*#~])*$/;
