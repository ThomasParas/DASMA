/**
 * For each planted error: was it detected as a `note`, only as a `check`, or not at all? For wrong-words labels
 * also print the phonetic score of each single-word substitution and the mean heard-token confidence implied by
 * the note's confidence (confidence ÷ (0.85 × similarity factor)), to separate the two downgrade causes.
 *
 *   npx tsx harness/scripts/label-outcomes.ts harness/out/m1-default/runs.json [--misses]
 */
import type { NoteDraft } from '@dasma/align';
import { isBenign } from '../src/perturb';
import { describeNote, readRuns, scenesById, score } from './lib';

const SIMILAR_SUB_SCORE = 0.3; // mirrors packages/align/src/classify.ts
const WRONG_WORDS_BASE = 0.85; // BASE_CONFIDENCE['wrong-words']

function explain(n: NoteDraft): string {
  if (n.category !== 'wrong-words') return '';
  const e = n.expected.split(/\s+/);
  const h = n.heard.split(/\s+/);
  if (e.length !== h.length) return ' [uneven group]';
  // classify.ts downgrades the whole substitution group when any pair in it is "similar".
  const scores = e.map((w, i) => score(h[i]!, w));
  const factor = scores.some((x) => x >= SIMILAR_SUB_SCORE) ? 0.6 : 1;
  const implied = n.confidence / (WRONG_WORDS_BASE * factor);
  return ` [scores ${scores.map((x) => x.toFixed(2)).join(',')}${factor < 1 ? ' similar×0.6' : ''}, implied mean heard conf ${implied.toFixed(2)}]`;
}

const args = process.argv.slice(2);
const runs = readRuns(args.find((a) => !a.startsWith('-')));
const scenes = scenesById();
const rooms = new Map<
  string,
  { ww: string[]; status: Record<string, number>; misses: Map<string, string[]> }
>();
for (const r of runs) {
  const room = rooms.get(r.condition) ?? {
    ww: [],
    status: { note: 0, checkOnly: 0, none: 0 },
    misses: new Map<string, string[]>(),
  };
  rooms.set(r.condition, room);
  for (const l of r.labels) {
    if (isBenign(l.kind)) continue;
    const on = r.notes.filter((n) => n.lineId === l.lineId);
    const st = on.some((n) => n.status === 'note') ? 'note' : on.length ? 'checkOnly' : 'none';
    const detail = on.map((n) => describeNote(n) + explain(n)).join(' | ');
    if (st !== 'note') {
      const list = room.misses.get(l.kind) ?? [];
      room.misses.set(l.kind, list);
      list.push(`${r.sceneId}#${r.seed} ${l.lineId} [${st}] ${detail}`);
    }
    if (l.kind === 'wrong-words') {
      room.status[st]!++;
      const original = scenes
        .get(r.sceneId)!
        .lines.find((x) => x.id === l.lineId)!
        .text.split(/\s+/)[l.wordIndex];
      room.ww.push(`${r.sceneId}#${r.seed} ${l.lineId} "${original}" [${st}] ${detail}`);
    }
  }
}
for (const [name, room] of rooms) {
  console.log(`\n######## ${name}`);
  console.log('wrong-words outcome', JSON.stringify(room.status));
  for (const x of room.ww) console.log('  WW', x);
  if (args.includes('--misses')) {
    for (const [kind, list] of room.misses) {
      console.log(` missed ${kind}: ${list.length}`);
      for (const x of list) console.log('   ', x);
    }
  }
}
