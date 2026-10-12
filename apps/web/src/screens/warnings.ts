import type { ImportWarning } from '@dasma/script';

const ORDER: Record<ImportWarning['code'], number> = { noSpeakers: 0, manyFlagged: 1, mixedConventions: 2, ambiguousAlias: 3 };

/** noSpeakers and manyFlagged first (spec §5.2). */
export const warningsInOrder = (ws: ImportWarning[]): ImportWarning[] => [...ws].sort((a, b) => ORDER[a.code] - ORDER[b.code]);

export function warningText(w: ImportWarning): string {
  switch (w.code) {
    case 'noSpeakers':
      return "We couldn't find character names. Is each speech labelled like NAME: or with the name on its own line?";
    case 'manyFlagged':
      return `Many lines are unsure (${Math.round(w.share * 100)}%). Fixing will take longer than usual.`;
    case 'mixedConventions':
      return 'This script labels speakers in two ways; check the speaker of each speech.';
    case 'ambiguousAlias':
      return `${w.token} could be ${w.candidates.join(' or ')}; check those speeches.`;
  }
}
