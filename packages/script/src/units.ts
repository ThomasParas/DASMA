import { buildCast, type Cast } from './characters';
import { SCENE_BREAK } from './patterns';
import { CATEGORY, type TaggedLine } from './tag';
import type { CleanDoc, CleanLine, DocProfile, ImportWarning, SourceRef, Unit, UnitKind } from './types';
import { AMBIGUOUS_CONFIDENCE } from './weights';

/** An italic run inside dialogue is a direction only from this many words; shorter runs are emphasis (spec §5.3). */
export const INLINE_ITALIC_MIN_WORDS = 3;

interface SpeechLine {
  text: string;
  italic: boolean[];
  source: SourceRef[];
  confidence: number;
}
interface Speaker {
  characterId?: string;
  /** min(cue line confidence, …) × alias confidence. */
  factor: number;
  cap: number;
}
type Draft = Omit<Unit, 'id'>;

/** Per-character italic mask of a line's text, from its spans. */
function italicMask(l: CleanLine): boolean[] {
  const mask = new Array<boolean>(l.text.length).fill(false);
  let cursor = 0;
  for (const s of l.spans) {
    const at = l.text.indexOf(s.text, cursor);
    if (at < 0) continue;
    if (s.italic) for (let k = at; k < at + s.text.length; k++) mask[k] = true;
    cursor = at + s.text.length;
  }
  return mask;
}

function speechLine(l: CleanLine, confidence: number, rest?: string): SpeechLine {
  const mask = italicMask(l);
  if (rest === undefined) return { text: l.text, italic: mask, source: l.source, confidence };
  const from = l.text.length - rest.length;
  return { text: rest, italic: mask.slice(from), source: l.source, confidence };
}

const hasWords = (s: string): boolean => /[\p{L}\p{N}]/u.test(s);
const tidy = (s: string): string =>
  s
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/^[\s.,;:—–-]+(?=\p{L})/u, '');

/** Splits one speech into dialogue and direction drafts (spec §5.3). */
function splitSpeech(lines: SpeechLine[], speaker: Speaker): Draft[] {
  const text = lines.map((l) => l.text).join('\n');
  const italic: boolean[] = [];
  const lineAt: number[] = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      italic.push(false);
      lineAt.push(-1); // the joining newline belongs to neither line
    }
    for (let k = 0; k < l.text.length; k++) {
      italic.push(l.italic[k] ?? false);
      lineAt.push(i);
    }
  });

  const segments: Array<[number, number]> = [];
  for (const m of text.matchAll(/\([^()]*\)|\[[^[\]]*\]/g)) segments.push([m.index!, m.index! + m[0].length]);
  const inSegment = (k: number) => segments.some(([s, e]) => k >= s && k < e);
  const hasPlain = italic.some((it, k) => !it && !inSegment(k) && /\p{L}/u.test(text[k]));
  for (let k = 0; k < text.length; ) {
    if (!italic[k] || inSegment(k)) {
      k++;
      continue;
    }
    let e = k;
    while (e < text.length && (italic[e] || /\s/.test(text[e])) && !inSegment(e)) e++;
    while (e > k && /\s/.test(text[e - 1])) e--;
    const words = text.slice(k, e).trim().split(/\s+/).filter(Boolean).length;
    if (words >= INLINE_ITALIC_MIN_WORDS && hasPlain) segments.push([k, e]);
    k = Math.max(e, k + 1);
  }
  segments.sort((a, b) => a[0] - b[0]);

  const drafts: Draft[] = [];
  const piece = (kind: UnitKind, s: number, e: number): void => {
    const body = tidy(text.slice(s, e));
    if (!hasWords(body)) return;
    const touched = [...new Set(lineAt.slice(s, Math.max(s + 1, e)).filter((i) => i >= 0))];
    const confidence = Math.min(...touched.map((i) => lines[i].confidence));
    const source = touched.flatMap((i) => lines[i].source);
    if (kind === 'dialogue') {
      const tagConfidence = Math.min(Math.min(confidence, speaker.cap) * speaker.factor, speaker.characterId ? 1 : AMBIGUOUS_CONFIDENCE);
      drafts.push({ kind, ...(speaker.characterId ? { characterId: speaker.characterId } : {}), text: body, cut: false, tagConfidence, source });
    } else drafts.push({ kind, text: body, cut: false, tagConfidence: confidence, source });
  };
  let cursor = 0;
  for (const [s, e] of segments) {
    if (s < cursor) continue;
    piece('dialogue', cursor, s);
    piece('direction', s, e);
    cursor = e;
  }
  piece('dialogue', cursor, text.length);
  return drafts;
}

/** Spec §5.3: tagged lines → units with speakers, kinds, confidence, ids. */
export function buildUnits(doc: CleanDoc, tagged: TaggedLine[], profile: DocProfile): { units: Unit[]; cast: Cast; warnings: ImportWarning[] } {
  const tokens = tagged.flatMap((t) => ((t.state === 'cue' || t.state === 'cueInline') && t.cue ? [t.cue.token] : []));
  const cast = buildCast(tokens, profile.castList);
  const drafts: Draft[] = [];
  let speaker: Speaker | null = null;
  let speech: SpeechLine[] = [];
  let directions: CleanLine[] = [];
  let directionConf: number[] = [];

  const flushSpeech = (): void => {
    if (speech.length) drafts.push(...splitSpeech(speech, speaker ?? { factor: 1, cap: 1 }));
    speech = [];
  };
  const flushDirections = (): void => {
    if (directions.length) {
      drafts.push({
        kind: 'direction',
        text: directions.map((l) => l.text).join('\n'),
        cut: false,
        tagConfidence: Math.min(...directionConf),
        source: directions.flatMap((l) => l.source),
      });
    }
    directions = [];
    directionConf = [];
  };
  const flush = (): void => {
    flushSpeech();
    flushDirections();
  };
  const startSpeaker = (t: TaggedLine): Speaker => {
    const r = t.cue ? cast.resolve(t.cue.token) : null;
    return r ? { characterId: r.characterId, factor: r.confidence, cap: t.confidence } : { factor: 1, cap: Math.min(t.confidence, AMBIGUOUS_CONFIDENCE) };
  };

  doc.lines.forEach((l, i) => {
    const t = tagged[i];
    if (SCENE_BREAK.test(l.text)) {
      flush();
      drafts.push({ kind: 'sceneBreak', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
      return;
    }
    switch (CATEGORY[t.state]) {
      case 'front': {
        flush();
        speaker = null;
        const prev = drafts[drafts.length - 1];
        if (prev?.kind === 'frontMatter') {
          prev.text += `\n${l.text}`;
          prev.tagConfidence = Math.min(prev.tagConfidence, t.confidence);
          prev.source = [...prev.source, ...l.source];
        } else drafts.push({ kind: 'frontMatter', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
        break;
      }
      case 'heading':
        flush();
        speaker = null;
        drafts.push({ kind: 'heading', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
        break;
      case 'cue':
        flush();
        speaker = startSpeaker(t);
        drafts.push({ kind: 'characterName', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
        break;
      case 'cueInline':
        flush();
        speaker = startSpeaker(t);
        speech.push(speechLine(l, t.confidence, t.cue?.rest));
        break;
      case 'dialogue':
        flushDirections();
        speech.push(speechLine(l, t.confidence));
        break;
      case 'direction':
        flushSpeech();
        directions.push(l);
        directionConf.push(t.confidence);
        break;
    }
  });
  flush();

  const units: Unit[] = drafts.map((d, k) => ({ id: `u${k + 1}`, ...d }));
  const warnings: ImportWarning[] = cast.ambiguous.map((a) => ({ code: 'ambiguousAlias', token: a.token, candidates: a.candidates }));
  return { units, cast, warnings };
}
