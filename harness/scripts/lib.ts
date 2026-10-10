import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeToken, phoneticKey, wordScore, type NoteDraft } from '@dasma/align';
import type { RunRecord } from '../src/evaluate';
import { isBenign } from '../src/perturb';
import { loadScenes, type Scene } from '../src/scenes';

export function readRuns(path: string | undefined): RunRecord[] {
  if (!path) throw new Error('Pass the path of a runs.json written by `npm run harness -- evaluate`');
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as RunRecord[];
}

export function scenesById(): Map<string, Scene> {
  return new Map(loadScenes('all').map((s) => [s.id, s]));
}

/** Lines that carry a planted (non-benign) error in this run. */
export function errorLines(run: RunRecord): Set<string> {
  return new Set(run.labels.filter((l) => !isBenign(l.kind)).map((l) => l.lineId));
}

export const describeNote = (n: NoteDraft) =>
  `${n.status}:${n.category} "${n.expected}"->"${n.heard}" ${n.confidence}`;

const norm = (w: string) => normalizeToken(w)[0] ?? w.toLowerCase();

/** The aligner's phonetic word score for a heard word against an expected word (raw text, normalized here). */
export const score = (heard: string, expected: string) =>
  wordScore(
    { norm: norm(heard), phon: phoneticKey(norm(heard)) },
    { norm: norm(expected), phon: phoneticKey(norm(expected)) },
  );
