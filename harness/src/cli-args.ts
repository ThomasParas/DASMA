import type { Strictness } from '@dasma/align';
import { ROOM_PRESETS, type RoomName } from './room';

export interface EvaluateOptions {
  seeds: number;
  rooms: RoomName[];
  patience: number;
  strictness: Strictness;
  errorRate: number;
  benignRate: number;
}

function unitInterval(name: string, raw: string): number {
  const n = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`--${name} must be a number from 0 to 1, got "${raw}"`);
  return n;
}

/** Validate the raw string values of `evaluate`'s flags, failing early with a message that names the flag. */
export function parseEvaluateOptions(values: {
  seeds: string;
  rooms: string;
  patience: string;
  strictness: string;
  'error-rate': string;
  'benign-rate': string;
}): EvaluateOptions {
  if (!/^\d+$/.test(values.seeds) || Number(values.seeds) < 1) throw new Error(`--seeds must be a positive integer, got "${values.seeds}"`);
  const rooms = [...new Set(values.rooms.split(',').map((r) => r.trim()).filter(Boolean))];
  if (!rooms.length) throw new Error('--rooms needs at least one room');
  for (const r of rooms) if (!(r in ROOM_PRESETS)) throw new Error(`Unknown room "${r}". Known: ${Object.keys(ROOM_PRESETS).join(', ')}`);
  if (values.strictness !== 'word-perfect' && values.strictness !== 'lenient') {
    throw new Error(`--strictness must be word-perfect or lenient, got "${values.strictness}"`);
  }
  return {
    seeds: Number(values.seeds),
    rooms: rooms as RoomName[],
    patience: unitInterval('patience', values.patience),
    strictness: values.strictness === 'lenient' ? { mode: 'lenient', lineMatchThreshold: 0.8 } : { mode: 'word-perfect' },
    errorRate: unitInterval('error-rate', values['error-rate']),
    benignRate: unitInterval('benign-rate', values['benign-rate']),
  };
}
