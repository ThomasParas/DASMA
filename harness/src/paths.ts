import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MODELS_DIR = join(HARNESS_ROOT, 'models');
export const SCENES_DIR = join(HARNESS_ROOT, 'scenes');
export const OUT_DIR = join(HARNESS_ROOT, 'out');
export const BASELINE_FILE = join(HARNESS_ROOT, 'baselines', 'baseline.json');
export const LOCK_FILE = join(HARNESS_ROOT, 'models.lock.json');
