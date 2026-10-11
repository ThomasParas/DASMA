import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MODELS_DIR = join(HARNESS_ROOT, 'models');
export const SCENES_DIR = join(HARNESS_ROOT, 'scenes');
export const OUT_DIR = join(HARNESS_ROOT, 'out');
export const TTS_CACHE_DIR = join(OUT_DIR, 'tts-cache');
export const BASELINE_FILE = join(HARNESS_ROOT, 'baselines', 'baseline.json');
export const LOCK_FILE = join(HARNESS_ROOT, 'models.lock.json');
export const PLAYS_DIR = join(HARNESS_ROOT, 'corpus', 'plays');
export const CORPUS_OUT_DIR = join(OUT_DIR, 'corpus');
export const LOCAL_DIR = join(HARNESS_ROOT, 'local');
export const DUMP_DIR = join(OUT_DIR, 'dump');
export const SCRIPT_EVAL_DIR = join(OUT_DIR, 'script-eval');
