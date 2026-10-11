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

/** The line that opens a cast list (spec §5.1). */
export const CAST_LIST_HEADER =
  /^(dramatis person(ae|æ)|characters|cast( of characters)?|(the )?persons (in|of) the play|persons represented)\b/i;

/** A line made only of `*`, `#` or `~` marks: a scene break. */
export const SCENE_BREAK = /^[*#~](\s*[*#~])*$/;
