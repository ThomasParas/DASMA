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
export type BenignKind = 'stumble' | 'chatter' | 'long-pause' | 'aside';
export type LabelKind = ErrorKind | BenignKind;

export const ERROR_KINDS: ErrorKind[] = [
  'dropped-line', 'dropped-words', 'added-words', 'wrong-words', 'transposed', 'paraphrase', 'jumped-cue', 'called-for-line',
];
/** Director-mode default. */
export const BENIGN_KINDS: BenignKind[] = ['stumble', 'long-pause', 'chatter'];
/** Solo has no scene partner (no jumped cue) and no director (no chatter); an actor's own asides replace chatter. */
export const SOLO_ERROR_KINDS: ErrorKind[] = ERROR_KINDS.filter((k) => k !== 'jumped-cue');
export const SOLO_BENIGN_KINDS: BenignKind[] = ['stumble', 'long-pause', 'aside'];
const ALL_BENIGN: readonly string[] = ['stumble', 'long-pause', 'chatter', 'aside'];
export const isBenign = (kind: LabelKind): kind is BenignKind => ALL_BENIGN.includes(kind);

export interface Segment {
  speaker: string;
  text: string;
  pauseBefore: number;
  lineId?: string;
  /** A cue the app would play in solo mode: rendered as silence of the same length (the app ignores the mic meanwhile). */
  silent?: true;
}

export interface Label {
  kind: LabelKind;
  lineId: string;
  characterId: string;
  segmentIndex: number;
  wordIndex: number;
  /** A wrong word that is a near sound-alike of the scripted word (reported separately). */
  soundAlike?: true;
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
  /** Solo mode: the character being rehearsed. Other characters' lines become silent cues. */
  solo?: string;
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
/** Near sound-alikes that an actor can plausibly say instead and a listener can still tell apart (no true homophones). */
export const SOUND_ALIKES: ReadonlyArray<readonly [string, string]> = [
  ['accept', 'except'], ['expression', 'impression'], ['feeling', 'filling'], ['playing', 'praying'], ['play', 'pray'],
  ['bottles', 'battles'], ['pint', 'paint'], ['rarely', 'really'], ['pleasant', 'present'], ['sake', 'shake'],
  ['sir', 'sore'], ['quite', 'quiet'], ['fellow', 'follow'], ['letters', 'litters'], ['reward', 'regard'],
  ['inscription', 'subscription'], ['rule', 'role'], ['culture', 'vulture'], ['private', 'pirate'], ['matter', 'mutter'],
  ['decide', 'divide'], ['uncle', 'ankle'], ['cards', 'carts'], ['deny', 'defy'], ['country', 'county'],
  ['false', 'falls'], ['suspected', 'expected'], ['secret', 'sacred'], ['reveal', 'revel'], ['meaning', 'moaning'],
  ['explanation', 'expectation'], ['improbable', 'impossible'], ['slings', 'stings'], ['arms', 'aims'], ['sleep', 'slip'],
  ['rub', 'rob'], ['bear', 'beer'], ['whips', 'wipes'], ['wrong', 'ring'], ['weary', 'worry'],
  ['dread', 'bread'], ['conscience', 'conscious'], ['thought', 'taught'], ['moment', 'movement'], ['lose', 'loose'],
  ['action', 'auction'], ['father', 'feather'], ['speak', 'sneak'], ['word', 'world'], ['walls', 'wells'],
  ['sweet', 'sweat'], ['then', 'than'], ['love', 'live'], ['light', 'like'], ['hand', 'band'],
];
const SOUND_ALIKE = new Map(SOUND_ALIKES.flatMap(([a, b]) => [[a, b], [b, a]] as Array<[string, string]>));

export const ASIDES: readonly string[] = [
  'Wait, sorry, let me go again.',
  'Hang on, sorry, sorry.',
  'Oh no, what comes next, give me a second.',
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
      return words.some(isContent) || words.some((w) => SOUND_ALIKE.has(core(w)));
    case 'transposed':
      return words.some((_, i) => swappable(words, i));
    case 'paraphrase':
      return Boolean(line.paraphrase);
    case 'called-for-line':
      return words.length >= 4;
  }
}

/** Director chatter; a third of the time it quotes the opening words of an earlier line (measures backward-jump safety). */
function chatterText(scene: Scene, i: number, rng: Rng): string {
  if (i > 0 && rng() < 1 / 3) {
    const earlier = scene.lines[Math.floor(rng() * i)]!;
    const words = tokenize(earlier.text);
    const n = Math.min(words.length, 4 + Math.floor(rng() * 3));
    const quote = words.slice(0, n).join(' ').replace(/[^A-Za-z']+$/, '');
    return `Go back to "${quote}", please.`;
  }
  return pick(CHATTER, rng);
}

export function perturbScene(scene: Scene, rng: Rng, opts: PerturbOptions): Performance {
  const errorKinds = opts.errorKinds ?? ERROR_KINDS;
  const benignKinds = opts.benignKinds ?? BENIGN_KINDS;
  const segments: Segment[] = [];
  const labels: Label[] = [];
  let carriedPause: number | null = null;
  let pendingJump = false;
  let afterDrop = false;
  let pendingDrop: Label | null = null;

  for (let i = 0; i < scene.lines.length; i++) {
    const line = scene.lines[i]!;
    const nextOwn = scene.lines.slice(i + 1).find((l) => l.character === line.character);
    const next = opts.solo ? nextOwn : scene.lines[i + 1];
    const words = tokenize(line.text);
    const pauseBefore = carriedPause ?? 0.3 + 0.6 * rng();
    carriedPause = null;
    const label = (kind: LabelKind, segmentIndex: number, wordIndex: number, extra: Partial<Label> = {}): Label => {
      const l: Label = { kind, lineId: line.id, characterId: line.character, segmentIndex, wordIndex, ...extra };
      labels.push(l);
      return l;
    };
    const speak = (text: string, pause: number, speaker = line.character): number => {
      segments.push({ speaker, text, pauseBefore: pause, ...(speaker === line.character ? { lineId: line.id } : {}) });
      const index = segments.length - 1;
      if (pendingDrop) {
        pendingDrop.segmentIndex = index;
        pendingDrop = null;
      }
      return index;
    };

    if (opts.solo && line.character !== opts.solo) {
      segments.push({ speaker: line.character, text: line.text, pauseBefore, silent: true });
      continue;
    }

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
        pendingDrop = label('dropped-line', -1, 0);
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
        const contentIdxs = words.map((w, k) => (isContent(w) ? k : -1)).filter((k) => k >= 0);
        const alikeIdxs = words.map((w, k) => (SOUND_ALIKE.has(core(w)) ? k : -1)).filter((k) => k >= 0);
        const out = [...words];
        if (alikeIdxs.length && (!contentIdxs.length || rng() < 0.5)) {
          const k = pick(alikeIdxs, rng);
          out[k] = replaceCore(words[k]!, SOUND_ALIKE.get(core(words[k]!))!);
          label('wrong-words', speak(out.join(' '), pauseBefore), k, { soundAlike: true });
        } else {
          const k = pick(contentIdxs, rng);
          out[k] = replaceCore(words[k]!, pick(SUBSTITUTES.filter((s) => s !== core(words[k]!)), rng));
          label('wrong-words', speak(out.join(' '), pauseBefore), k);
        }
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
        speak(chatterText(scene, i, rng), pauseBefore, 'DIRECTOR');
        label('chatter', speak(line.text, 1.5), 0);
        break;
      case 'aside': {
        if (words.length < 3) {
          speak(line.text, pauseBefore);
          break;
        }
        const pos = 1 + Math.floor(rng() * (words.length - 2));
        const restart = rng() < 0.5;
        speak(words.slice(0, pos).join(' '), pauseBefore);
        label('aside', speak(pick(ASIDES, rng), 0.4), 0);
        speak((restart ? words : words.slice(pos)).join(' '), 0.6);
        break;
      }
    }
  }
  if (pendingDrop) throw new Error(`perturbScene: dropped-line on ${(pendingDrop as Label).lineId} has no later spoken line`);
  return { segments, labels };
}
