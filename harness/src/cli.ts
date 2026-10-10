import type { Strictness } from '@dasma/align';
import { findModel } from '@dasma/asr';
import { NodeSherpaRecognizer, loadSherpa, resolveAsrModel } from '@dasma/asr/node';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { evaluate } from './evaluate';
import { compareToBaseline, formatReport, type EvalReport } from './metrics';
import { fetchModels } from './models';
import { BASELINE_FILE, MODELS_DIR, OUT_DIR } from './paths';
import { ROOM_PRESETS, type RoomName } from './room';
import { createSherpaTts } from './tts';

const USAGE = `Usage: npm run harness -- <command> [options]

  fetch-models [--only <model-id>] [--record]  Download ASR + TTS models into harness/models (needs network).
                                              Archives are checked against the SHA-256 pinned in models.lock.json;
                                              --record (maintainers only) pins hashes for models not yet listed.
  evaluate [options]                          Generate labelled rehearsals, run the engine, score it
      --scenes all|<id,id>      default all
      --seeds <n>               default 10
      --rooms <a,b>             default close-mic,far-field   (also: far-field-hard)
      --model <id>              default zipformer-en-2023-06-21
      --patience <0..1>         default 0.5
      --strictness <mode>       word-perfect | lenient   default word-perfect
      --error-rate <0..1>       default 0.35
      --benign-rate <0..1>      default 0.2
      --out <dir>               default harness/out/<timestamp>
      --save-audio              also write each rehearsal as WAV
  gate --report <path> [--baseline <path>]    Exit 1 if results regressed vs the baseline
  baseline --report <path>                    Make a report the new baseline`;

const fromCwd = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

async function runEvaluate(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      scenes: { type: 'string', default: 'all' },
      seeds: { type: 'string', default: '10' },
      rooms: { type: 'string', default: 'close-mic,far-field' },
      model: { type: 'string', default: 'zipformer-en-2023-06-21' },
      patience: { type: 'string', default: '0.5' },
      strictness: { type: 'string', default: 'word-perfect' },
      'error-rate': { type: 'string', default: '0.35' },
      'benign-rate': { type: 'string', default: '0.2' },
      out: { type: 'string' },
      'save-audio': { type: 'boolean', default: false },
    },
  });
  const rooms = values.rooms.split(',') as RoomName[];
  for (const r of rooms) if (!(r in ROOM_PRESETS)) throw new Error(`Unknown room "${r}". Known: ${Object.keys(ROOM_PRESETS).join(', ')}`);
  const strictness: Strictness =
    values.strictness === 'lenient' ? { mode: 'lenient', lineMatchThreshold: 0.8 } : { mode: 'word-perfect' };
  const out = values.out ? fromCwd(values.out) : join(OUT_DIR, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(out, { recursive: true });

  const recognizer = new NodeSherpaRecognizer();
  await recognizer.load(resolveAsrModel(MODELS_DIR, findModel(values.model)));
  const sherpa = loadSherpa();
  const { report, runs } = evaluate(
    {
      sceneIds: values.scenes === 'all' ? 'all' : values.scenes.split(','),
      seeds: Number(values.seeds),
      rooms,
      patience: Number(values.patience),
      strictness,
      errorRate: Number(values['error-rate']),
      benignRate: Number(values['benign-rate']),
      model: values.model,
    },
    {
      tts: createSherpaTts(),
      makeRecognizer: () => {
        recognizer.reset();
        return recognizer;
      },
      onRun: ({ room, sceneId, seed, score }) =>
        console.log(`${room} ${sceneId} #${seed}: detected ${score.detected}/${score.errorLabels}, false notes ${score.falseNotes}, false alerts ${score.falseAlerts}`),
      saveAudio: values['save-audio']
        ? (name, samples, sampleRate) => {
            const file = resolve(out, `${name}.wav`);
            if (!file.startsWith(`${out}${sep}`)) throw new Error(`Refusing to write outside ${out}: ${file}`);
            sherpa.writeWave(file, { samples, sampleRate });
          }
        : undefined,
    },
  );
  recognizer.dispose();
  const md = formatReport(report);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, 'runs.json'), `${JSON.stringify(runs, null, 2)}\n`);
  writeFileSync(join(out, 'report.md'), md);
  console.log(`\n${md}\nWrote ${out}`);
}

function runGate(args: string[]): void {
  const { values } = parseArgs({ args, options: { report: { type: 'string' }, baseline: { type: 'string' } } });
  if (!values.report) throw new Error('gate needs --report <path>');
  const baselinePath = values.baseline ? fromCwd(values.baseline) : BASELINE_FILE;
  if (!existsSync(baselinePath)) {
    console.error(`No baseline at ${baselinePath}. Create one with: npm run harness -- baseline --report <path>`);
    process.exitCode = 1;
    return;
  }
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as EvalReport;
  const { pass, lines } = compareToBaseline(read(fromCwd(values.report)), read(baselinePath));
  console.log(lines.join('\n'));
  console.log(pass ? 'GATE PASS' : 'GATE FAIL');
  if (!pass) process.exitCode = 1;
}

function runBaseline(args: string[]): void {
  const { values } = parseArgs({ args, options: { report: { type: 'string' } } });
  if (!values.report) throw new Error('baseline needs --report <path>');
  mkdirSync(dirname(BASELINE_FILE), { recursive: true });
  copyFileSync(fromCwd(values.report), BASELINE_FILE);
  console.log(`Baseline set from ${values.report}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'fetch-models': {
      const { values } = parseArgs({ args, options: { only: { type: 'string' }, record: { type: 'boolean', default: false } } });
      await fetchModels(values.only, console.log, values.record);
      return;
    }
    case 'evaluate':
      return runEvaluate(args);
    case 'gate':
      return runGate(args);
    case 'baseline':
      return runBaseline(args);
    default:
      console.log(USAGE);
      if (command && command !== '--help') process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
