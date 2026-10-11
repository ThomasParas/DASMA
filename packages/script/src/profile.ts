import { matchCue, normalizeCueToken, type CueMatch } from './cues';
import { TEXT_COLUMN } from './extract/text';
import { CAST_LIST_HEADER, isHeading } from './patterns';
import type { CleanDoc, CleanLine, DocProfile, SourceKind, SpeakerConvention } from './types';

/** A speaker token must appear at least this often in speaker position. */
export const MIN_CUE_COUNT = 2;
/** A second convention is kept when it covers at least this share of recurring speeches. */
export const SECONDARY_SHARE = 0.15;
/** Own-line cues are "centred" when at least this share of them is. */
export const CENTERED_CUE_SHARE = 0.6;
const CAST_LIST_MAX_LINES = 40;
const CAST_NAME_MAX_WORDS = 5;
const SPEECH_RUN_WINDOW = 40;
const SPEECH_LINES_SAMPLED = 30;

export function bandTolerance(source: SourceKind): number {
  return source === 'text' ? TEXT_COLUMN : 12;
}

export function clusterBands(values: number[], tol: number): number[] {
  const bands: Array<{ sum: number; n: number; last: number }> = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const b = bands[bands.length - 1];
    if (b && v - b.last <= tol) {
      b.sum += v;
      b.n++;
      b.last = v;
    } else bands.push({ sum: v, n: 1, last: v });
  }
  return bands.map((b) => b.sum / b.n);
}

export function nearestBand(bands: number[], left: number): number {
  let best = bands[0] ?? left;
  for (const b of bands) if (Math.abs(b - left) < Math.abs(best - left)) best = b;
  return best;
}

function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestN = 0;
  for (const [v, n] of [...counts].sort((a, b) => a[0] - b[0])) if (n > bestN) [best, bestN] = [v, n];
  return best;
}

/** Cue matches per line; an own-line match is dropped when the next line is also own-line shaped (title blocks, caps cast lists). */
export function validCues(doc: CleanDoc): Array<CueMatch | null> {
  const raw = doc.lines.map((l) => matchCue(l.text));
  return raw.map((m, i) => (m && m.convention === 'ownLine' && raw[i + 1]?.convention === 'ownLine' ? null : m));
}

function readCastList(lines: CleanLine[]): string[] {
  const start = lines.findIndex((l) => CAST_LIST_HEADER.test(l.text));
  if (start < 0) return [];
  const names: string[] = [];
  for (let i = start + 1; i < Math.min(lines.length, start + 1 + CAST_LIST_MAX_LINES); i++) {
    const t = lines[i].text;
    if (isHeading(t) || t.split(/\s+/).length > 12) break;
    const name = normalizeCueToken(t.split(/,|:| — | – /)[0].replace(/\.$/, ''));
    if (name && name.split(' ').length <= CAST_NAME_MAX_WORDS) names.push(name);
  }
  return names;
}

export function profileDoc(doc: CleanDoc): DocProfile {
  const lines = doc.lines;
  const bands = clusterBands(lines.filter((l) => !l.centered).map((l) => l.left), bandTolerance(doc.source));
  const band = (l: CleanLine): number => nearestBand(bands, l.left);
  const cues = validCues(doc);

  const counts = new Map<string, number>();
  for (const m of cues) if (m) counts.set(m.token, (counts.get(m.token) ?? 0) + 1);
  const cueTokens = new Map([...counts].filter(([, n]) => n >= MIN_CUE_COUNT));

  const convCount = new Map<SpeakerConvention, number>();
  for (const m of cues) if (m && cueTokens.has(m.token)) convCount.set(m.convention, (convCount.get(m.convention) ?? 0) + 1);
  const ranked = [...convCount].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((n, [, c]) => n + c, 0);
  const primary = ranked[0]?.[0] ?? null;
  const secondary = ranked[1] && ranked[1][1] / total >= SECONDARY_SHARE ? ranked[1][0] : null;

  const cueIdx = cues.flatMap((m, i) => (m && cueTokens.has(m.token) && m.convention === primary ? [i] : []));
  let speakerBand: DocProfile['speakerBand'] = null;
  if (cueIdx.length) {
    const centeredShare = cueIdx.filter((i) => lines[i].centered).length / cueIdx.length;
    speakerBand = primary === 'ownLine' && centeredShare >= CENTERED_CUE_SHARE ? 'centered' : mode(cueIdx.map((i) => band(lines[i])));
  }

  const cueSet = new Set(cues.flatMap((m, i) => (m && cueTokens.has(m.token) && m.convention === 'ownLine' ? [i] : [])));
  const speechLines: number[] = [];
  for (const i of cueIdx) {
    const from = primary === 'ownLine' ? i + 1 : i;
    for (let j = from; j < Math.min(lines.length, from + SPEECH_LINES_SAMPLED); j++) {
      if (j !== i && cues[j] && cueTokens.has(cues[j]!.token)) break;
      const l = lines[j];
      if (l.centered || l.italic || /^[([]/.test(l.text)) continue;
      speechLines.push(j);
    }
  }
  const dialogueBand = mode([...new Set(speechLines)].map((j) => band(lines[j])));

  const firstHeading = lines.findIndex((l) => isHeading(l.text));
  let firstRun = -1;
  for (let k = 0; k + 2 < cueIdx.length; k++) {
    if (cueIdx[k + 2] - cueIdx[k] <= SPEECH_RUN_WINDOW) {
      firstRun = cueIdx[k];
      break;
    }
  }
  const ends = [firstHeading, firstRun].filter((i) => i >= 0);
  const frontMatterEnd = ends.length ? Math.min(...ends) : 0;

  const directionLike = lines.filter((l, i) => {
    if (i < frontMatterEnd || cueSet.has(i)) return false;
    const offBand = !l.centered && band(l) !== dialogueBand && (speakerBand === 'centered' || band(l) !== speakerBand);
    return l.italic || /^[([]/.test(l.text) || offBand;
  });
  const share = (pick: (l: CleanLine) => boolean): number => (directionLike.length ? directionLike.filter(pick).length / directionLike.length : 0);
  const directionMarks = {
    italic: share((l) => l.italic),
    parens: share((l) => l.text.startsWith('(')),
    brackets: share((l) => l.text.startsWith('[')),
    ownBand: share((l) => !l.centered && band(l) !== dialogueBand),
  };
  const directionBand = mode(directionLike.filter((l) => !l.centered && band(l) !== dialogueBand).map(band));

  return {
    bands,
    speakerBand,
    dialogueBand,
    directionBand,
    primary,
    secondary,
    directionMarks,
    castList: readCastList(lines),
    cueTokens,
    frontMatterEnd,
  };
}
