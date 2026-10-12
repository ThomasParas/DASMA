import { inCastList } from './characters';
import type { CueMatch } from './cues';
import { decode } from './decode';
import { SCENE_BREAK, isHeading } from './patterns';
import { nearestBand, validCues } from './profile';
import type { CleanDoc, DocProfile } from './types';
import { EMISSION, START, TRANSITIONS } from './weights';

export const STATES = ['cue', 'cueInline', 'dialogue', 'dirIn', 'dirOut', 'heading', 'front'] as const;
export type LineState = (typeof STATES)[number];
export type LineCategory = 'cue' | 'cueInline' | 'dialogue' | 'direction' | 'heading' | 'front';
export const CATEGORY: Record<LineState, LineCategory> = {
  cue: 'cue',
  cueInline: 'cueInline',
  dialogue: 'dialogue',
  dirIn: 'direction',
  dirOut: 'direction',
  heading: 'heading',
  front: 'front',
};

export interface TaggedLine {
  state: LineState;
  /** Posterior of the chosen line category (dirIn + dirOut together). */
  confidence: number;
  cue: CueMatch | null;
}

const BRACKET_BLOCK_MAX_LINES = 12;

/**
 * Lines that belong to a bracketed block opening at a line start and closing at a line end.
 * Depth is tracked character by character: the opening bracket must first return to depth 0 at
 * the end of a line (only `.,;:!?` and whitespace may follow), so `(a) text (b)` is not a block.
 */
export function bracketBlocks(texts: readonly string[]): boolean[] {
  const out = texts.map(() => false);
  for (let i = 0; i < texts.length; i++) {
    const open = texts[i][0];
    if (open !== '(' && open !== '[') continue;
    const close = open === '(' ? ')' : ']';
    const end = closingLine(texts, i, open, close);
    if (end < 0) continue;
    for (let k = i; k <= end; k++) out[k] = true;
    i = end;
  }
  return out;
}

/** The line where the bracket opening line `start` closes at a line end, or -1. */
function closingLine(texts: readonly string[], start: number, open: string, close: string): number {
  let depth = 0;
  for (let j = start; j < Math.min(texts.length, start + BRACKET_BLOCK_MAX_LINES); j++) {
    const text = texts[j];
    for (let c = 0; c < text.length; c++) {
      if (text[c] === open) depth++;
      else if (text[c] === close) depth--;
      else continue;
      if (depth === 0) return /^[\s.,;:!?]*$/.test(text.slice(c + 1)) ? j : -1;
    }
  }
  return -1;
}

interface Features {
  cue: CueMatch | null;
  knownCue: boolean;
  inCast: boolean;
  italic: boolean;
  bold: boolean;
  atSpeakerBand: boolean;
  atDialogueBand: boolean;
  atDirectionBand: boolean;
  bracketBlock: boolean;
  heading: boolean;
  beforeFront: boolean;
  nextCueShaped: boolean;
  sceneBreak: boolean;
}

function lineFeatures(doc: CleanDoc, profile: DocProfile): Features[] {
  const cues = validCues(doc);
  const shapes = doc.lines.map((l, i) => cues[i]?.convention === 'ownLine' || (cues[i] === null && /^\p{Lu}[\p{Lu}'’ .-]*$/u.test(l.text)));
  const blocks = bracketBlocks(doc.lines.map((l) => l.text));
  return doc.lines.map((l, i) => {
    const cue = cues[i];
    const band = nearestBand(profile.bands, l.left);
    return {
      cue,
      knownCue: cue !== null && profile.cueTokens.has(cue.token),
      inCast: cue !== null && inCastList(cue.token, profile.castList),
      italic: l.italic,
      bold: l.bold,
      atSpeakerBand: profile.speakerBand === 'centered' ? l.centered : profile.speakerBand !== null && !l.centered && band === profile.speakerBand,
      atDialogueBand: !l.centered && band === profile.dialogueBand,
      atDirectionBand: !l.centered && profile.directionBand !== null && profile.directionBand !== profile.dialogueBand && band === profile.directionBand,
      bracketBlock: blocks[i],
      heading: isHeading(l.text),
      beforeFront: i < profile.frontMatterEnd,
      nextCueShaped: shapes[i + 1] ?? false,
      sceneBreak: SCENE_BREAK.test(l.text),
    };
  });
}

function emissions(f: Features, profile: DocProfile): Record<LineState, number> {
  const W = EMISSION;
  const m = profile.directionMarks;
  const bracketMark = Math.max(m.parens, m.brackets);
  const usesConvention = (c: string) => profile.primary === c || profile.secondary === c;
  const own = f.cue?.convention === 'ownLine';
  const inline = f.cue !== null && !own;

  const cue = own
    ? W.base.cue +
      W.cue.shape +
      (f.knownCue ? W.cue.known : 0) +
      (f.inCast ? W.cue.inCast : 0) +
      (usesConvention('ownLine') ? W.cue.primary : 0) +
      (f.atSpeakerBand ? W.cue.speakerBand : 0) +
      (f.bold ? W.cue.bold : 0) +
      (f.nextCueShaped ? W.cue.nextCueShaped : 0)
    : W.base.cue + W.cue.notShape;
  const cueInline = inline
    ? W.base.cueInline +
      W.cueInline.shape +
      (f.knownCue ? W.cueInline.known : 0) +
      (f.inCast ? W.cueInline.inCast : 0) +
      (usesConvention(f.cue!.convention) ? W.cueInline.primary : 0)
    : W.base.cueInline + W.cueInline.notShape;
  const dialogue =
    W.base.dialogue +
    (f.atDialogueBand ? W.dialogue.dialogueBand : 0) -
    (f.italic ? W.dialogue.italic + W.dialogue.italicPerMark * m.italic : 0) -
    (f.bracketBlock ? W.dialogue.bracketBlock + W.dialogue.bracketPerMark * bracketMark : 0) -
    (f.atDirectionBand ? W.dialogue.offBandPerMark * m.ownBand : 0) +
    (own && f.knownCue ? W.dialogue.knownCueShape : 0);
  const direction =
    W.base.direction +
    (f.italic ? W.direction.italic + W.direction.italicPerMark * m.italic : 0) +
    (f.bracketBlock ? W.direction.bracketBlock + W.direction.bracketPerMark * bracketMark : 0) +
    (f.atDirectionBand ? W.direction.directionBand + W.direction.directionBandPerMark * m.ownBand : 0);
  const heading = W.base.heading + (f.heading ? W.heading.pattern : W.heading.notPattern);
  const front = W.base.front + (f.beforeFront ? W.front.before : W.front.after);

  const scores: Record<LineState, number> = { cue, cueInline, dialogue, dirIn: direction, dirOut: direction, heading, front };
  if (f.sceneBreak) {
    for (const s of STATES) scores[s] = s === 'dirIn' || s === 'dirOut' ? W.sceneBreak.direction : W.sceneBreak.other;
  }
  return scores;
}

/** Spec §5.2: emission scores per line, a fixed transition matrix, Viterbi for the states, forward-backward for confidence. */
export function tagLines(doc: CleanDoc, profile: DocProfile): TaggedLine[] {
  const NEG = Number.NEGATIVE_INFINITY;
  const features = lineFeatures(doc, profile);
  const emit = features.map((f) => {
    const e = emissions(f, profile);
    return STATES.map((s) => e[s] * EMISSION.temperature);
  });
  const start = STATES.map((s) => START[s] ?? NEG);
  const transitions = STATES.map((from) => STATES.map((to) => TRANSITIONS[from][to] ?? NEG));
  const { path, posterior } = decode(start, transitions, emit);
  return path.map((s, t) => {
    const state = STATES[s];
    const confidence = STATES.reduce((sum, other, k) => (CATEGORY[other] === CATEGORY[state] ? sum + posterior[t][k] : sum), 0);
    return { state, confidence: Math.min(1, confidence), cue: features[t].cue };
  });
}
