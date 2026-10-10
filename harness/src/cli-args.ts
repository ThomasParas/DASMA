import type { Strictness } from '@dasma/align';
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
}

function unitInterval(name: string, raw: string): number {
  const n = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`--${name} must be a number from 0 to 1, got "${raw}"`);
  return n;
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
  return {
    modes: modes as Mode[],
    seedFrom: Number(values['seed-from']),
    seeds: Number(values.seeds),
    rooms: rooms as RoomName[],
    patience: unitInterval('patience', values.patience),
    strictness: values.strictness === 'lenient' ? { mode: 'lenient', lineMatchThreshold: 0.8 } : { mode: 'word-perfect' },
    errorRate: unitInterval('error-rate', values['error-rate']),
    benignRate: unitInterval('benign-rate', values['benign-rate']),
    heardConfidenceFloor: unitInterval('heard-floor', values['heard-floor']),
  };
}
