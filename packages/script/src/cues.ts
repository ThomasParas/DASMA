import { SCENE_BREAK, isHeading } from './patterns';
import type { SpeakerConvention } from './types';
import { STOP_FIRST_WORDS, STOP_TOKENS } from './weights';

export interface CueMatch {
  convention: SpeakerConvention;
  /** Normalized speaker token. */
  token: string;
  /** Dialogue after an inline cue; '' for an own-line cue. */
  rest: string;
}

const CAPS_WORD = "\\p{Lu}[\\p{Lu}'’-]*";
const ANY_WORD = "\\p{L}[\\p{L}'’-]*";
/** 1–4 all-capital words, an optional "." or ":", an optional parenthetical. */
const OWN_LINE = new RegExp(`^(${CAPS_WORD}(?:\\.?\\s+${CAPS_WORD}){0,3})\\s*[.:]?\\s*(\\([^)]*\\))?$`, 'u');
const INLINE_PERIOD = new RegExp(`^(${CAPS_WORD}(?:\\.?\\s+${CAPS_WORD}){0,3})\\.\\s+(\\S.*)$`, 'su');
const INLINE_COLON = new RegExp(`^(${ANY_WORD}(?:\\.?\\s+${ANY_WORD}){0,3}):\\s*(\\S.*)$`, 'su');
const CLASSICAL = /^(\p{Lu}\p{Ll}{1,5})\.\s+(\S.*)$/su;

export function normalizeCueToken(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.:]+$/, '')
    .trim();
}

export function capsShare(s: string): number {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / letters.length;
}

export function isStopToken(s: string): boolean {
  const t = normalizeCueToken(s);
  return STOP_TOKENS.has(t) || STOP_FIRST_WORDS.has(t.split(' ')[0]) || t.replace(/[^\p{L}]/gu, '').length < 2;
}

/** Spec §5.1: which speaker convention, if any, a line's text has. Recurrence is checked later, by the profile. */
export function matchCue(text: string): CueMatch | null {
  const t = text.trim();
  if (isHeading(t) || SCENE_BREAK.test(t)) return null;
  let m = OWN_LINE.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'ownLine', token: normalizeCueToken(m[1]), rest: '' };
  m = INLINE_PERIOD.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'inlinePeriod', token: normalizeCueToken(m[1]), rest: m[2] };
  m = INLINE_COLON.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'inlineColon', token: normalizeCueToken(m[1]), rest: m[2] };
  m = CLASSICAL.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'classicalAbbrev', token: normalizeCueToken(m[1]), rest: m[2] };
  return null;
}
