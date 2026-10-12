import { normalizeCueToken, type Character } from '@dasma/script';
import type { Rng } from '../rng';
import type { SourcePlay, SourceUnit } from './source-play';
import type { CueMode, StyleSpec } from './styles';
import type { Para, Run, TruthUnit } from './types';

export type DraftTruth = Omit<TruthUnit, 'page'>;
export interface BuiltParas {
  paras: Para[];
  truth: DraftTruth[];
  cast: Character[];
}

/** word 3: chance a speech is shouted, has its cue on its own line, or starts with a tab. */
export const SHOUT_RATE = 0.06;
export const OWN_LINE_RATE = 0.2;
export const TAB_RATE = 0.3;
/** Indent of an indented own-line cue (licensed 2), points. */
export const CUE_INDENT = 108;

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Shortest prefix (3–6 letters) of a one-word name that starts no other cast name; null for multi-word names. */
export function abbreviation(name: string, cast: readonly Character[]): string | null {
  if (/\s/.test(name)) return null;
  for (let len = 3; len <= 6 && len < name.length; len++) {
    const p = name.slice(0, len);
    if (!cast.some((c) => c.name !== name && c.name.startsWith(p))) return p;
  }
  return null;
}

const wrapText = (t: string, wrap: 'parens' | 'brackets' | 'none'): string => (wrap === 'parens' ? `(${t})` : wrap === 'brackets' ? `[${t}]` : t);
const plain = (t: string): string => t.replace(/_/g, '').replace(/\s+/g, ' ').trim();
/** Standalone directions and front matter: no source bracket or emphasis marks survive, only the style's own wrapper. */
const stripMarks = (t: string): string => plain(t.replace(/[[\]]/g, ''));
const hasWords = (t: string): boolean => /[\p{L}\p{N}]/u.test(t);

/** Every `_` toggles italic and is never rendered; the state carries across the lines of a piece, an unmatched `_` is dropped. */
function emphasisRuns(text: string, italic: boolean): { runs: Run[]; italic: boolean } {
  const runs: Run[] = [];
  text.split('_').forEach((part, i) => {
    if (i > 0) italic = !italic;
    if (part) runs.push(italic ? { text: part, italic: true } : { text: part });
  });
  return { runs, italic };
}

export function buildParas(play: SourcePlay, units: readonly SourceUnit[], style: StyleSpec, rng: Rng): BuiltParas {
  const paras: Para[] = [];
  const truth: DraftTruth[] = [];
  const castById = new Map(play.cast.map((c) => [c.id, c]));
  const aliases = new Map(play.cast.map((c) => [c.id, new Set<string>()]));
  const seen = new Set<string>();
  const addTruth = (t: DraftTruth): number => truth.push(t) - 1;
  const para = (runs: Run[], kind: Para['kind'], truthIdx: number[], opts: Partial<Para> = {}): void => {
    paras.push({ runs, kind, truth: truthIdx, align: 'left', indent: 0, gapBefore: false, numbered: false, ...opts });
  };

  const cueText = (id: string, mode: CueMode): string => {
    const c = castById.get(id)!;
    const ab = style.abbreviate ? abbreviation(c.name, play.cast) : null;
    let form = c.name;
    if (mode === 'classicalAbbrev') form = ab ? titleCase(ab) : c.name;
    else if (ab && seen.has(id)) form = ab;
    else if (mode === 'inlineColon' && style.cue === 'mixed') form = titleCase(c.name);
    seen.add(id);
    if (normalizeCueToken(form) !== normalizeCueToken(c.name)) aliases.get(id)!.add(normalizeCueToken(form));
    return form;
  };

  const speech = (u: SourceUnit, prev: SourceUnit | undefined): void => {
    const id = u.characterId!;
    // The rng draws happen for every speech, cued or not, so the stream doesn't depend on which cues are skipped.
    const mode: CueMode = style.cue === 'mixed' ? (rng() < OWN_LINE_RATE ? 'ownLeft' : 'inlineColon') : style.cue;
    const shout = style.shout && rng() < SHOUT_RATE;
    const tab = style.tabs && rng() < TAB_RATE;
    // Speech resumed after a direction (or a paragraph break) of the same speaker is printed without a cue, as real scripts do.
    const cueless = u.continues === true && (prev?.kind === 'direction' || (prev?.kind === 'dialogue' && prev.characterId === id));
    const cue = cueless ? '' : cueText(id, mode);
    const own = !cueless && (mode === 'ownCentered' || mode === 'ownLeft' || mode === 'ownIndented');
    if (own) {
      para([{ text: cue.toUpperCase(), bold: style.cueBold }], 'cue', [addTruth({ kind: 'characterName', text: cue.toUpperCase() })], {
        align: mode === 'ownCentered' ? 'center' : 'left',
        indent: mode === 'ownIndented' ? CUE_INDENT : 0,
        gapBefore: true,
      });
    }

    // Truth pieces, in order: dialogue text between inline directions, and the directions.
    const pieces: Array<{ kind: 'dialogue' | 'direction'; raw: string; truth: number }> = [];
    // A same-speaker continuation straight after that speaker's dialogue shows no boundary (no cue, no heading),
    // so its leading text extends the previous dialogue truth unit instead of starting a new one.
    const lastTruth = truth[truth.length - 1];
    const mergeInto =
      u.continues === true && prev?.kind === 'dialogue' && prev.characterId === id && lastTruth?.kind === 'dialogue' && lastTruth.characterId === id
        ? truth.length - 1
        : -1;
    let last = 0;
    // Newlines at a piece's edges are kept so a verse line that starts with a direction starts a new paragraph.
    const textPiece = (raw: string): void => {
      let t = raw.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/^ +| +$/g, '').replace(/^[.,;:] */, '');
      if (shout) t = t.toUpperCase();
      const truthText = t
        .split('\n')
        .map((l) => plain(l))
        .filter(Boolean)
        .join('\n');
      if (!hasWords(truthText)) return;
      if (mergeInto >= 0 && pieces.length === 0) {
        truth[mergeInto].text += `\n${truthText}`;
        pieces.push({ kind: 'dialogue', raw: t, truth: mergeInto });
        return;
      }
      pieces.push({ kind: 'dialogue', raw: t, truth: addTruth({ kind: 'dialogue', characterId: id, text: truthText }) });
    };
    for (const m of u.text.matchAll(/\[([^\]]*)\]/g)) {
      textPiece(u.text.slice(last, m.index));
      const d = wrapText(plain(m[1]), style.inline.wrap);
      pieces.push({ kind: 'direction', raw: d, truth: addTruth({ kind: 'direction', text: d }) });
      last = m.index! + m[0].length;
    }
    textPiece(u.text.slice(last));

    // Rendered lines: verse lines start new paragraphs; directions stay inline.
    const lines: Array<{ runs: Run[]; truth: number[] }> = [{ runs: [], truth: [] }];
    const current = () => lines[lines.length - 1];
    const push = (run: Run, t: number, separate: boolean): void => {
      const c = current();
      const prev = c.runs[c.runs.length - 1];
      if (separate && prev && !/\s$/.test(prev.text) && !/^\s/.test(run.text)) c.runs.push({ text: ' ' });
      c.runs.push(run);
      if (!c.truth.includes(t)) c.truth.push(t);
    };
    if (!own && !cueless) {
      const prefix = mode === 'inlineColon' ? `${cue}: ` : mode === 'classicalAbbrev' && !/\s/.test(cue) ? `${cue}. ` : `${cue.toUpperCase()}. `;
      current().runs.push({ text: prefix, bold: style.cueBold });
    }
    for (const p of pieces) {
      if (p.kind === 'direction') {
        push({ text: p.raw, italic: style.inline.italic }, p.truth, true);
        continue;
      }
      let italic = false;
      p.raw.split('\n').forEach((lineRaw, k) => {
        if (k > 0) lines.push({ runs: [], truth: [] });
        const e = emphasisRuns(lineRaw, italic);
        italic = e.italic;
        e.runs.forEach((r, j) => push(r, p.truth, j === 0));
      });
    }
    lines.forEach((l, k) => {
      if (!l.runs.some((r) => r.text.trim())) return;
      const runs = tab && k === 0 ? [{ ...l.runs[0], text: `\t${l.runs[0].text}` }, ...l.runs.slice(1)] : l.runs;
      para(runs, 'speech', l.truth, { indent: style.speechIndent, gapBefore: !own && k === 0, numbered: true });
    });
  };

  let frontIndex = 0;
  for (const [i, u] of units.entries()) {
    if (u.kind === 'frontMatter') {
      const t = stripMarks(u.text);
      para([{ text: t, bold: frontIndex === 0 }], 'front', [addTruth({ kind: 'frontMatter', text: t })], { align: frontIndex === 0 ? 'center' : 'left' });
      frontIndex++;
    } else if (u.kind === 'heading') {
      para([{ text: u.text, bold: true }], 'heading', [addTruth({ kind: 'heading', text: u.text })], { align: 'center', gapBefore: true });
    } else if (u.kind === 'direction') {
      const t = wrapText(stripMarks(u.text), style.direction.wrap);
      para([{ text: t, italic: style.direction.italic }], 'direction', [addTruth({ kind: 'direction', text: t })], {
        indent: style.direction.indent,
        gapBefore: true,
      });
    } else speech(u, units[i - 1]);
  }
  const cast = play.cast.map((c) => ({ ...c, aliases: [...aliases.get(c.id)!].sort() }));
  return { paras, truth, cast };
}
