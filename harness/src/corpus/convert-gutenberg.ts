import { slugId, type Character } from '@dasma/script';
import type { SourcePlay, SourceUnit } from './source-play';

export interface PlayConfig {
  id: string;
  gutenbergId: number;
  /** Title-page lines, emitted as the first front-matter units. */
  title: string[];
  source: string;
  cueStyle: 'ownLine' | 'inline';
  /** Join a speech's lines with \n (verse) rather than a space (hard-wrapped prose). */
  verse: boolean;
  /** Matched against untrimmed lines, so an indented contents entry doesn't count. */
  bodyStart: RegExp;
  bodyStartOccurrence: number;
  /** Matched against trimmed lines before the body: the cast list's first line… */
  frontStart: RegExp;
  /** …and the line after it (null: up to the body). */
  frontEnd: RegExp | null;
  /** Speakers allowed although no word of theirs is in the cast list (joint cues are always allowed). */
  castExceptions: string[];
  /** A cue-less paragraph that isn't a direction continues the current speaker's speech. */
  continuations: boolean;
  /** Cue-less paragraphs starting like this are stage directions; matched after a leading `_`. */
  directionStart: RegExp;
}

/** Gutenberg's stage-direction openings in the Shakespeare texts (also the default for plays that bracket every direction). */
export const STAGE_DIRECTION =
  /^(?:Enter|Re-enter|Exit|Exeunt|Manet|Flourish|Alarums?|Trumpets?|Sennet|Hautboys|Drums?|(?:Danish )?[Mm]arch|Noise|Thunder|Knock|Music|Dies|Dumb[ -]show)\b|^(?:The )?[A-Z][a-z]+ (?:rises|appears|advances|enters|exits|falls|dies|kneels)\b/;

const pd = (what: string, id: number) => `${what}. Project Gutenberg eBook #${id}, header and licence removed. Public domain in the US.`;

export const PLAY_CONFIGS: PlayConfig[] = [
  {
    id: 'earnest',
    gutenbergId: 844,
    title: ['THE IMPORTANCE OF BEING EARNEST', 'A Trivial Comedy for Serious People', 'by Oscar Wilde'],
    source: pd('Oscar Wilde, The Importance of Being Earnest (1895)', 844),
    cueStyle: 'ownLine',
    verse: false,
    bodyStart: /^FIRST ACT$/,
    bodyStartOccurrence: 1,
    frontStart: /^THE PERSONS IN THE PLAY$/,
    frontEnd: /^THE SCENES OF THE PLAY$/,
    castExceptions: ['JACK'],
    continuations: false,
    directionStart: STAGE_DIRECTION,
  },
  {
    id: 'dolls-house',
    gutenbergId: 2542,
    title: ["A DOLL'S HOUSE", 'by Henrik Ibsen', 'translated by R. Farquharson Sharp'],
    source: pd("Henrik Ibsen, A Doll's House, tr. R. Farquharson Sharp (1910)", 2542),
    cueStyle: 'ownLine',
    verse: false,
    bodyStart: /^ACT I$/,
    bodyStartOccurrence: 1,
    frontStart: /^DRAMATIS PERSONAE$/,
    frontEnd: /^A DOLL’S HOUSE$/,
    castExceptions: ['SERVANT'],
    continuations: false,
    directionStart: STAGE_DIRECTION,
  },
  {
    id: 'hamlet',
    gutenbergId: 1524,
    title: ['THE TRAGEDY OF HAMLET, PRINCE OF DENMARK', 'by William Shakespeare'],
    source: pd('William Shakespeare, Hamlet', 1524),
    cueStyle: 'ownLine',
    verse: true,
    bodyStart: /^ACT I$/,
    bodyStartOccurrence: 1,
    frontStart: /^Dramatis Person/,
    frontEnd: null,
    castExceptions: ['BOTH', 'ALL', 'PROLOGUE', 'LUCIANUS', 'DANES'],
    continuations: true,
    directionStart: STAGE_DIRECTION,
  },
  {
    id: 'romeo',
    gutenbergId: 1513,
    title: ['THE TRAGEDY OF ROMEO AND JULIET', 'by William Shakespeare'],
    source: pd('William Shakespeare, Romeo and Juliet', 1513),
    cueStyle: 'ownLine',
    verse: true,
    bodyStart: /^(THE PROLOGUE|ACT I)$/,
    bodyStartOccurrence: 2,
    frontStart: /^Dramatis Person/,
    frontEnd: null,
    castExceptions: [],
    continuations: true,
    directionStart: STAGE_DIRECTION,
  },
  {
    id: 'seagull',
    gutenbergId: 1754,
    title: ['THE SEA-GULL', 'by Anton Chekhov'],
    source: pd('Anton Chekhov, The Sea-Gull, English translation published before 1931', 1754),
    cueStyle: 'inline',
    verse: false,
    bodyStart: /^ACT I$/,
    bodyStartOccurrence: 1,
    frontStart: /^CHARACTERS$/,
    frontEnd: /^THE SEA-GULL$/,
    castExceptions: ['ARKADINA'],
    continuations: true,
    /** Unbracketed directions: a name in capitals, or a pronoun or scene opening. */
    directionStart: /^(?:Enter|The|A|He|She|All|Two years|While|During)\b|^[A-Z][A-Z’'-]+\b/,
  },
];

const HEADING = /^(ACT [IVX]+\.?|SCENE\b.*|Scene [IVX]+\..*|(FIRST|SECOND|THIRD|FOURTH|FIFTH) ACT|(THE )?PROLOGUE\.?|EPILOGUE\.?)$/;
const OWN_CUE = /^([A-Z][A-Z’'-]*(?: [A-Z][A-Z’'-]*)*)\.$/;
const INLINE_CUE = /^([A-Z][A-Z’'-]+(?: [A-Z][A-Z’'-]+)*)\. (.*)$/s;
/** `CORNELIUS and VOLTEMAND.`, `HORATIO and MARCELLUS. [Within.] My lord`, `JACK and ALGERNON [Speaking together.] Our…` */
const JOINT_CUE = /^([A-Z][A-Z’'-]+(?: [A-Z][A-Z’'-]+)*(?: and [A-Z][A-Z’'-]+(?: [A-Z][A-Z’'-]+)*)+)(?:\.(?: (.+))?| (\[.+))$/;
/** A first line that may be a cue without its period (`BARNARDO`) or in title case (`Both.`); only known speakers count. */
const BARE_CUE = /^([A-Z][A-Za-z’'-]*(?: [A-Z][A-Za-z’'-]*)*)\.?$/;
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Gutenberg's `_[...]_` and `[_..._]` become `[...]`; `_word_` emphasis outside brackets stays. */
export function normalizeDirections(s: string): string {
  return s
    .replace(/_\[([^\]]*)\]_?/g, '[$1]')
    .replace(/\[_([^\]]*?)_\]/g, '[$1]')
    .replace(/\[([^\]]*)\]/g, (_, x: string) => `[${x.replace(/_/g, '')}]`);
}

/** Characters the standard PDF fonts (WinAnsi) cannot draw. */
export function unencodable(text: string): string[] {
  return [
    ...new Set(
      [...text].filter((c) => {
        const n = c.codePointAt(0)!;
        return !(n === 10 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || WINANSI_EXTRA.includes(c));
      }),
    ),
  ];
}

export function convertGutenberg(text: string, cfg: PlayConfig): SourcePlay {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.startsWith('*** START')) + 1;
  const end = lines.findIndex((l) => l.startsWith('*** END'));
  if (start === 0 || end < 0) throw new Error(`${cfg.id}: Gutenberg START/END markers not found`);
  let seen = 0;
  let body = -1;
  for (let i = start; i < end; i++) {
    if (cfg.bodyStart.test(lines[i]) && ++seen === cfg.bodyStartOccurrence) {
      body = i;
      break;
    }
  }
  if (body < 0) throw new Error(`${cfg.id}: body start not found`);
  const pre = lines.slice(start, body).map((l) => l.trim());
  const frontFrom = pre.findIndex((l) => cfg.frontStart.test(l));
  if (frontFrom < 0) throw new Error(`${cfg.id}: cast list not found`);
  const frontTo = cfg.frontEnd ? pre.findIndex((l, i) => i > frontFrom && cfg.frontEnd!.test(l)) : -1;
  const front = pre.slice(frontFrom, frontTo < 0 ? pre.length : frontTo).filter(Boolean);

  const units: SourceUnit[] = [...cfg.title, ...front].map((t) => ({ kind: 'frontMatter' as const, text: t }));
  const speakers = new Map<string, number>();
  const speech = (speaker: string, said: string, continues = false): void => {
    speakers.set(speaker, (speakers.get(speaker) ?? 0) + 1);
    units.push({ kind: 'dialogue', characterId: speaker, text: normalizeDirections(said), ...(continues && { continues }) });
  };
  const paras = lines
    .slice(body, end)
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
  const castText = front.join(' ').toUpperCase();
  const inCast = (sp: string): boolean => sp.split(' ').some((w) => w.length > 2 && castText.includes(w));
  const known = new Set<string>();
  for (const para of paras) {
    const m = cfg.cueStyle === 'ownLine' ? para.length > 1 && OWN_CUE.exec(para[0]) : INLINE_CUE.exec(para.join(' '));
    if (m) known.add(m[1]);
  }
  const joint = new Set<string>();
  const sep = cfg.verse ? '\n' : ' ';
  /** The paragraph's speaker and spoken lines, or null when it has no cue. */
  const cueOf = (para: string[]): { speaker: string; said: string[] } | null => {
    const [first, ...rest] = para;
    const j = JOINT_CUE.exec(first);
    if (j) {
      const said = [j[2] ?? j[3] ?? '', ...rest].filter(Boolean);
      if (!said.length) return null;
      const speaker = j[1].toUpperCase();
      joint.add(speaker);
      return { speaker, said };
    }
    if (cfg.cueStyle === 'inline') {
      const m = INLINE_CUE.exec(para.join(' '));
      return m ? { speaker: m[1], said: [m[2]] } : null;
    }
    const own = OWN_CUE.exec(first);
    if (own && rest.length) return { speaker: own[1], said: rest };
    const bare = BARE_CUE.exec(first);
    if (bare && rest.length && known.has(bare[1].toUpperCase())) return { speaker: bare[1].toUpperCase(), said: rest };
    const lead = INLINE_CUE.exec(first);
    if (lead && (known.has(lead[1]) || inCast(lead[1]))) return { speaker: lead[1], said: [lead[2], ...rest] };
    return null;
  };
  /** Speaker of the last speech since the last heading. */
  let current: string | null = null;
  for (const para of paras) {
    const first = para[0];
    if (para.length === 1 && HEADING.test(first)) {
      units.push({ kind: 'heading', text: first });
      current = null;
      continue;
    }
    const cue = cueOf(para);
    if (cue) {
      speech(cue.speaker, cue.said.join(sep));
      current = cue.speaker;
      continue;
    }
    const flat = normalizeDirections(para.join(' '));
    const spoken = /[\p{L}\p{N}]/u.test(flat.replace(/\[[^\]]*\]/g, '').replace(/_/g, ''));
    // Speech of the current speaker: around an inline direction, or (continuations) after a direction or paragraph break.
    if (current !== null && spoken && !cfg.directionStart.test(flat.replace(/^_/, '')) && (cfg.continuations || flat.includes('['))) {
      speech(current, para.join(sep), true);
      continue;
    }
    units.push({ kind: 'direction', text: flat.replace(/^\[([^\]]*)\]\.?$/, '$1').replace(/_/g, '') });
  }

  const missing = [...speakers.keys()].filter((sp) => !cfg.castExceptions.includes(sp) && !joint.has(sp) && !inCast(sp));
  if (missing.length) throw new Error(`${cfg.id}: speakers not in the cast list: ${missing.join(', ')}`);
  const bad = unencodable(units.map((u) => u.text).join('\n'));
  if (bad.length) throw new Error(`${cfg.id}: characters the standard PDF fonts cannot encode: ${bad.join(' ')}`);

  const ids = new Map<string, string>();
  const cast: Character[] = [];
  for (const sp of speakers.keys()) {
    let id = slugId(sp);
    for (let n = 2; [...ids.values()].includes(id); n++) id = `${slugId(sp)}-${n}`;
    ids.set(sp, id);
    cast.push({ id, name: sp.replace(/’/g, "'"), aliases: [] });
  }
  return {
    id: cfg.id,
    title: cfg.title[0],
    source: cfg.source,
    cast,
    units: units.map((u) => (u.kind === 'dialogue' ? { ...u, characterId: ids.get(u.characterId!)! } : u)),
  };
}
