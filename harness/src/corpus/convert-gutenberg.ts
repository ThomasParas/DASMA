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
  /** Speakers allowed although no word of theirs is in the cast list. */
  castExceptions: string[];
}

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
  },
];

const HEADING = /^(ACT [IVX]+\.?|SCENE\b.*|Scene [IVX]+\..*|(FIRST|SECOND|THIRD|FOURTH|FIFTH) ACT|(THE )?PROLOGUE\.?|EPILOGUE\.?)$/;
const OWN_CUE = /^([A-Z][A-Z’'-]*(?: [A-Z][A-Z’'-]*)*)\.$/;
const INLINE_CUE = /^([A-Z][A-Z’'-]+(?: [A-Z][A-Z’'-]+)*)\. (.*)$/s;
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
  const speech = (speaker: string, said: string): void => {
    speakers.set(speaker, (speakers.get(speaker) ?? 0) + 1);
    units.push({ kind: 'dialogue', characterId: speaker, text: normalizeDirections(said) });
  };
  const paras = lines
    .slice(body, end)
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
  for (const para of paras) {
    const first = para[0];
    if (para.length === 1 && HEADING.test(first)) {
      units.push({ kind: 'heading', text: first });
      continue;
    }
    if (cfg.cueStyle === 'ownLine' && para.length > 1) {
      const m = OWN_CUE.exec(first);
      if (m) {
        speech(m[1], para.slice(1).join(cfg.verse ? '\n' : ' '));
        continue;
      }
    }
    if (cfg.cueStyle === 'inline') {
      const m = INLINE_CUE.exec(para.join(' '));
      if (m) {
        speech(m[1], m[2]);
        continue;
      }
    }
    units.push({ kind: 'direction', text: normalizeDirections(para.join(' ')).replace(/^\[(.*)\]\.?$/s, '$1').replace(/_/g, '') });
  }

  const castText = front.join(' ').toUpperCase();
  const missing = [...speakers.keys()].filter(
    (sp) => !cfg.castExceptions.includes(sp) && !sp.split(' ').some((w) => w.length > 2 && castText.includes(w)),
  );
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
