/**
 * Run the evaluation with a perfect recognizer (words exactly as performed, confidence 0.95), so only the
 * engine can make mistakes. Same scenes, seeds and labels as `npm run harness -- evaluate`; close-mic audio
 * is rendered only for timings.
 *
 *   npx tsx harness/scripts/oracle-eval.ts [--patience 0.5] [--seeds 10] [--out harness/out/m1-oracle]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { evaluate } from '../src/evaluate';
import { formatReport } from '../src/metrics';
import { OUT_DIR } from '../src/paths';
import { createSherpaTts } from '../src/tts';
import { ScriptedRecognizer, oracleWords } from '../test/helpers/scripted-recognizer';

const { values } = parseArgs({
  options: {
    patience: { type: 'string', default: '0.5' },
    seeds: { type: 'string', default: '10' },
    out: { type: 'string' },
  },
});
const out = values.out ? resolve(values.out) : join(OUT_DIR, 'm1-oracle');
mkdirSync(out, { recursive: true });
const { report, runs } = evaluate(
  {
    sceneIds: 'all',
    modes: ['solo', 'director'],
    seedFrom: 1,
    seeds: Number(values.seeds),
    rooms: ['close-mic'],
    patience: Number(values.patience),
    strictness: { mode: 'word-perfect' },
    errorRate: 0.35,
    benignRate: 0.2,
    heardConfidenceFloor: 0,
    noteMinConfidence: 0.65,
    alertMinConfidence: 0.75,
    model: 'oracle (perfect recognizer, confidence 0.95)',
  },
  { tts: createSherpaTts(), makeRecognizer: (rendered) => new ScriptedRecognizer(oracleWords(rendered)) },
);
const md = formatReport(report);
writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(out, 'runs.json'), `${JSON.stringify(runs, null, 2)}\n`);
writeFileSync(join(out, 'report.md'), md);
console.log(`${md}\nWrote ${out}`);
