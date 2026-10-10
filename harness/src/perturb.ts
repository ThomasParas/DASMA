import { FUNCTION_WORDS, tokenize } from '@dasma/align';
import { pick, type Rng } from './rng';
import type { Scene, SceneLine } from './scenes';

export type ErrorKind =
  | 'dropped-line'
  | 'dropped-words'
  | 'added-words'
  | 'wrong-words'
  | 'transposed'
  | 'paraphrase'
  | 'jumped-cue'
  | 'called-for-line';
export type BenignKind = 'stumble' | 'chatter' | 'long-pause';
export type LabelKind = ErrorKind | BenignKind;

export const ERROR_KINDS: ErrorKind[] = [
  'dropped-line', 'dropped-words', 'added-words', 'wrong-words', 'transposed', 'paraphrase', 'jumped-cue', 'called-for-line',
];
export const BENIGN_KINDS: BenignKind[] = ['stumble', 'long-pause', 'chatter'];
export const isBenign = (kind: LabelKind): kind is BenignKind => (BENIGN_KINDS as string[]).includes(kind);

export interface Segment {
  speaker: string;
  text: string;
  pauseBefore: number;
  lineId?: string;
}

export interface Label {
  kind: LabelKind;
  lineId: string;
  characterId: string;
  segmentIndex: number;
  wordIndex: number;
}

export interface Performance {
  segments: Segment[];
  labels: Label[];
}

export interface PerturbOptions {
  errorRate: number;
  benignRate: number;
  errorKinds?: ErrorKind[];
  benignKinds?: BenignKind[];
}

const ADDED = ['really', 'you know', 'indeed', 'of course', 'truly'];
const SUBSTITUTES = [
  'marvellous', 'splendid', 'dreadful', 'curious', 'perfectly', 'certainly', 'evening', 'garden', 'letter',
  'window', 'country', 'money', 'dinner', 'sister', 'journey', 'question', 'carriage', 'umbrella',
];
const CHATTER = [
  'Okay hold on everybody, let me fix this chair before we keep going with the scene.',
  'Sorry, sorry, can we take that bit again from just before the entrance please?',
];
const WORD = /^([^A-Za-z']*)([A-Za-z']+)([^A-Za-z']*)$/;

const core = (raw: string) => raw.replace(/[^A-Za-z']/g, '').toLowerCase();
const isContent = (raw: string) => {
  const c = core(raw);
  return c.length >= 4 && !FUNCTION_WORDS.has(c);
};

function replaceCore(raw: string, replacement: string): string {
  const m = WORD.exec(raw);
  return m ? `${m[1]}${replacement}${m[3]}` : replacement;
}

function swapCores(a: string, b: string): [string, string] {
  const ma = WORD.exec(a);
  const mb = WORD.exec(b);
  if (!ma || !mb) return [b, a];
  return [`${ma[1]}${mb[2]}${ma[3]}`, `${mb[1]}${ma[2]}${mb[3]}`];
}

/** Two adjacent content words that differ in core, so swapping them is a real change. */
const swappable = (words: string[], k: number): boolean =>
  k + 1 < words.length && isContent(words[k]!) && isContent(words[k + 1]!) && core(words[k]!) !== core(words[k + 1]!);

function feasible(kind: ErrorKind, line: SceneLine, next: SceneLine | undefined): boolean {
  const words = tokenize(line.text);
  switch (kind) {
    case 'dropped-line':
      return next !== undefined;
    case 'jumped-cue':
      return next !== undefined && next.character !== line.character;
    case 'dropped-words':
      return words.length >= 6;
    case 'added-words':
      return words.length >= 3;
    case 'wrong-words':
      return words.some(isContent);
    case 'transposed':
      return words.some((_, i) => swappable(words, i));
    case 'paraphrase':
      return Boolean(line.paraphrase);
    case 'called-for-line':
      return words.length >= 4;
  }
}

export function perturbScene(scene: Scene, rng: Rng, opts: PerturbOptions): Performance {
  const errorKinds = opts.errorKinds ?? ERROR_KINDS;
  const benignKinds = opts.benignKinds ?? BENIGN_KINDS;
  const segments: Segment[] = [];
  const labels: Label[] = [];
  let carriedPause: number | null = null;
  let pendingJump = false;
  let afterDrop = false;

  for (let i = 0; i < scene.lines.length; i++) {
    const line = scene.lines[i]!;
    const next = scene.lines[i + 1];
    const words = tokenize(line.text);
    const pauseBefore = carriedPause ?? 0.3 + 0.6 * rng();
    carriedPause = null;
    const label = (kind: LabelKind, segmentIndex: number, wordIndex: number) =>
      labels.push({ kind, lineId: line.id, characterId: line.character, segmentIndex, wordIndex });
    const speak = (text: string, pause: number, speaker = line.character): number => {
      segments.push({ speaker, text, pauseBefore: pause, ...(speaker === line.character ? { lineId: line.id } : {}) });
      return segments.length - 1;
    };

    if (pendingJump) {
      pendingJump = false;
      label('jumped-cue', speak(line.text, pauseBefore), 0);
      continue;
    }
    if (afterDrop) {
      // The line after a dropped line is performed clean, so the dropped-line label's
      // segment is this line's own segment and the carried gap is the one the aligner sees.
      afterDrop = false;
      speak(line.text, pauseBefore);
      continue;
    }

    let kind: LabelKind | null = null;
    const roll = rng();
    if (roll < opts.errorRate) {
      const options = errorKinds.filter((k) => feasible(k, line, next));
      kind = options.length ? pick(options, rng) : null;
    } else if (roll < opts.errorRate + opts.benignRate && benignKinds.length) {
      kind = pick(benignKinds, rng);
    }

    switch (kind) {
      case null:
        speak(line.text, pauseBefore);
        break;
      case 'dropped-line':
        label('dropped-line', segments.length, 0);
        carriedPause = 2.5 + rng();
        afterDrop = true;
        break;
      case 'jumped-cue':
        carriedPause = 0.2;
        pendingJump = true;
        break;
      case 'dropped-words': {
        const start = 1 + Math.floor(rng() * (words.length - 4));
        const count = Math.min(2 + Math.floor(rng() * 2), words.length - 1 - start);
        const out = [...words.slice(0, start), ...words.slice(start + count)];
        label('dropped-words', speak(out.join(' '), pauseBefore), start);
        break;
      }
      case 'added-words': {
        const pos = 1 + Math.floor(rng() * (words.length - 1));
        const phrase = pick(ADDED, rng).split(' ');
        const out = [...words.slice(0, pos), ...phrase, ...words.slice(pos)];
        label('added-words', speak(out.join(' '), pauseBefore), pos + phrase.length - 1);
        break;
      }
      case 'wrong-words': {
        const idxs = words.map((w, k) => (isContent(w) ? k : -1)).filter((k) => k >= 0);
        const k = pick(idxs, rng);
        const out = [...words];
        out[k] = replaceCore(words[k]!, pick(SUBSTITUTES.filter((s) => s !== core(words[k]!)), rng));
        label('wrong-words', speak(out.join(' '), pauseBefore), k);
        break;
      }
      case 'transposed': {
        const idxs = words.map((_, k) => (swappable(words, k) ? k : -1)).filter((k) => k >= 0);
        const k = pick(idxs, rng);
        const out = [...words];
        [out[k], out[k + 1]] = swapCores(words[k]!, words[k + 1]!);
        label('transposed', speak(out.join(' '), pauseBefore), k + 1);
        break;
      }
      case 'paraphrase': {
        const text = line.paraphrase!;
        label('paraphrase', speak(text, pauseBefore), tokenize(text).length - 1);
        break;
      }
      case 'called-for-line': {
        const mid = Math.floor(words.length / 2);
        speak(words.slice(0, mid).join(' '), pauseBefore);
        const call = speak('Line!', 1.5 + rng());
        speak(words.slice(mid).join(' '), 1.0);
        label('called-for-line', call, 0);
        break;
      }
      case 'stumble': {
        const pos = 1 + Math.floor(rng() * Math.max(1, words.length - 1));
        speak(words.slice(0, pos).join(' '), pauseBefore);
        label('stumble', speak(words.slice(pos - 1).join(' '), 0.4), 0);
        break;
      }
      case 'long-pause':
        label('long-pause', speak(line.text, 4 + 2 * rng()), 0);
        break;
      case 'chatter':
        speak(pick(CHATTER, rng), pauseBefore, 'DIRECTOR');
        label('chatter', speak(line.text, 1.5), 0);
        break;
    }
  }
  return { segments, labels };
}
