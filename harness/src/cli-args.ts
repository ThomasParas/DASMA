import { DEFAULT_ALIGN_OPTIONS, type Strictness } from '@dasma/align';
import { DEFAULT_STABLE_SEC } from '@dasma/asr';
import type { Mode } from './evaluate';
import { ROOM_PRESETS, type RoomName } from './room';

export interface EvaluateOptions {
  modes: Mode[];
  seedFrom: number;
  seeds: number;
  rooms: RoomName[];
  patience: number;
  strictness: Strictness;
  errorRate: number;
  benignRate: number;
  heardConfidenceFloor: number;
  stableSec: number;
  noteMinConfidence: number;
  alertMinConfidence: number;
}

function unitInterval(name: string, raw: string): number {
  const n = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`--${name} must be a number from 0 to 1, got "${raw}"`);
  return n;
}

/** Defaults of the engine-setting flags, taken from the engine itself so the harness measures what ships. */
export const ENGINE_FLAG_DEFAULTS = {
  'heard-floor': String(DEFAULT_ALIGN_OPTIONS.heardConfidenceFloor),
  'stable-sec': String(DEFAULT_STABLE_SEC),
  'note-min': String(DEFAULT_ALIGN_OPTIONS.noteMinConfidence),
  'alert-min': String(DEFAULT_ALIGN_OPTIONS.alertMinConfidence),
} as const;

/** `node:util` parseArgs options for the aligner threshold flags, shared by `evaluate` and the harness scripts. */
export const ALIGN_FLAG_OPTIONS = {
  'heard-floor': { type: 'string', default: ENGINE_FLAG_DEFAULTS['heard-floor'] },
  'note-min': { type: 'string', default: ENGINE_FLAG_DEFAULTS['note-min'] },
  'alert-min': { type: 'string', default: ENGINE_FLAG_DEFAULTS['alert-min'] },
} as const;

/** `node:util` parseArgs option for the stabilizer flag (real recognizer only). */
export const STABLE_SEC_OPTION = { 'stable-sec': { type: 'string', default: ENGINE_FLAG_DEFAULTS['stable-sec'] } } as const;

export interface AlignFlags {
  heardConfidenceFloor: number;
  noteMinConfidence: number;
  alertMinConfidence: number;
}

export function parseAlignFlags(values: { 'heard-floor': string; 'note-min': string; 'alert-min': string }): AlignFlags {
  return {
    heardConfidenceFloor: unitInterval('heard-floor', values['heard-floor']),
    noteMinConfidence: unitInterval('note-min', values['note-min']),
    alertMinConfidence: unitInterval('alert-min', values['alert-min']),
  };
}

export function parseStableSec(raw: string): number {
  const stableSec = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(stableSec) || stableSec <= 0 || stableSec > 2) {
    throw new Error(`--stable-sec must be a number above 0 and at most 2, got "${raw}"`);
  }
  return stableSec;
}

/** Validate the raw string values of `evaluate`'s flags, failing early with a message that names the flag. */
export function parseEvaluateOptions(values: {
  modes: string;
  'seed-from': string;
  seeds: string;
  rooms: string;
  patience: string;
  strictness: string;
  'error-rate': string;
  'benign-rate': string;
  'heard-floor': string;
  'stable-sec': string;
  'note-min': string;
  'alert-min': string;
}): EvaluateOptions {
  if (!/^\d+$/.test(values.seeds) || Number(values.seeds) < 1) throw new Error(`--seeds must be a positive integer, got "${values.seeds}"`);
  const modes = [...new Set(values.modes.split(',').map((m) => m.trim()).filter(Boolean))];
  if (!modes.length) throw new Error('--modes needs at least one mode');
  for (const m of modes) if (m !== 'solo' && m !== 'director') throw new Error(`Unknown mode "${m}". Known: solo, director`);
  if (!/^\d+$/.test(values['seed-from']) || Number(values['seed-from']) < 1) {
    throw new Error(`--seed-from must be a positive integer, got "${values['seed-from']}"`);
  }
  const rooms = [...new Set(values.rooms.split(',').map((r) => r.trim()).filter(Boolean))];
  if (!rooms.length) throw new Error('--rooms needs at least one room');
  for (const r of rooms) if (!(r in ROOM_PRESETS)) throw new Error(`Unknown room "${r}". Known: ${Object.keys(ROOM_PRESETS).join(', ')}`);
  if (values.strictness !== 'word-perfect' && values.strictness !== 'lenient') {
    throw new Error(`--strictness must be word-perfect or lenient, got "${values.strictness}"`);
  }
  const stableSec = parseStableSec(values['stable-sec']);
  const align = parseAlignFlags(values);
  return {
    modes: modes as Mode[],
    seedFrom: Number(values['seed-from']),
    seeds: Number(values.seeds),
    rooms: rooms as RoomName[],
    patience: unitInterval('patience', values.patience),
    strictness: values.strictness === 'lenient' ? { mode: 'lenient', lineMatchThreshold: 0.8 } : { mode: 'word-perfect' },
    errorRate: unitInterval('error-rate', values['error-rate']),
    benignRate: unitInterval('benign-rate', values['benign-rate']),
    heardConfidenceFloor: align.heardConfidenceFloor,
    stableSec,
    noteMinConfidence: align.noteMinConfidence,
    alertMinConfidence: align.alertMinConfidence,
  };
}
