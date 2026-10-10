import { DEFAULT_ALIGN_OPTIONS, buildExpected, type AlignOptions, type NoteDraft, type Strictness } from '@dasma/align';
import type { Recognizer } from '@dasma/asr';
import { aggregate, finalNotes, flagRecords, scoreOutcome, type Aggregate, type EvalReport, type FlagRecord, type ScoredRun } from './metrics';
import { SOLO_BENIGN_KINDS, SOLO_ERROR_KINDS, perturbScene, type Label } from './perturb';
import { hashSeed, mulberry32 } from './rng';
import { ROOM_PRESETS, applyRoom, type RoomName } from './room';
import { runEngine } from './run-engine';
import { loadScenes, soloCharacters, toScriptLines, type Scene } from './scenes';
import { assignVoices, renderPerformance, type RenderedPerformance, type RenderedSegment, type TtsEngine } from './tts';

export type Mode = 'solo' | 'director';
export const MODES: Mode[] = ['solo', 'director'];
export const conditionName = (mode: Mode, room: RoomName): string => `${mode}-${room}`;

export interface EvalConfig {
  sceneIds: string[] | 'all';
  modes: Mode[];
  /** First seed; runs use seedFrom … seedFrom + seeds − 1. Seeds 1–10 tune, 11–30 are the held-out gate set. */
  seedFrom: number;
  seeds: number;
  rooms: RoomName[];
  patience: number;
  strictness: Strictness;
  errorRate: number;
  benignRate: number;
  model: string;
}

export interface EvalDeps {
  tts: TtsEngine;
  makeRecognizer: (rendered: RenderedPerformance) => Recognizer;
  scenes?: Scene[];
  onRun?: (info: { condition: string; character: string | null; sceneId: string; seed: number; score: ScoredRun }) => void;
  saveAudio?: (name: string, samples: Float32Array, sampleRate: number) => void;
}

export interface RunRecord {
  condition: string;
  mode: Mode;
  room: RoomName;
  /** The rehearsed character in solo mode; null in director mode. */
  character: string | null;
  sceneId: string;
  seed: number;
  labels: Label[];
  /** The notes that stand at the end of the run (last lineDone per line). */
  notes: NoteDraft[];
  flags: FlagRecord[];
  heard: Array<{ text: string; start: number; end: number; confidence: number }>;
  segments: RenderedSegment[];
  score: ScoredRun;
  durationSec: number;
  rtf: number;
}

export function evaluate(config: EvalConfig, deps: EvalDeps): { report: EvalReport; runs: RunRecord[] } {
  const scenes = deps.scenes ?? loadScenes(config.sceneIds);
  const options: AlignOptions = { ...DEFAULT_ALIGN_OPTIONS, patience: config.patience, strictness: config.strictness };
  const scored = new Map<string, Array<ScoredRun & { durationSec: number; rtf: number }>>();
  for (const mode of config.modes) for (const room of config.rooms) scored.set(conditionName(mode, room), []);
  const runs: RunRecord[] = [];
  for (const scene of scenes) {
    for (const mode of config.modes) {
      if (scene.modes && !scene.modes.includes(mode)) continue;
      const casts: Array<string | null> = mode === 'director' ? [null] : soloCharacters(scene);
      for (const character of casts) {
        const lines = toScriptLines(scene).filter((l) => character === null || l.characterId === character);
        const expected = buildExpected(lines, config.strictness);
        // Director keys match M1's, so director perturbations stay comparable; solo keys include the character.
        const who = character === null ? scene.id : `${scene.id}:${character}`;
        for (let seed = config.seedFrom; seed < config.seedFrom + config.seeds; seed++) {
          const rng = mulberry32(hashSeed(`${who}:${seed}`));
          const perf = perturbScene(scene, rng, {
            errorRate: config.errorRate,
            benignRate: config.benignRate,
            ...(character === null ? {} : { solo: character, errorKinds: SOLO_ERROR_KINDS, benignKinds: SOLO_BENIGN_KINDS }),
          });
          const voices = assignVoices([...new Set(perf.segments.map((s) => s.speaker))], rng);
          const rendered = renderPerformance(perf, voices, deps.tts);
          for (const room of config.rooms) {
            const condition = conditionName(mode, room);
            const audio = applyRoom(rendered.samples, rendered.sampleRate, ROOM_PRESETS[room], mulberry32(hashSeed(`${room}:${who}:${seed}`)));
            deps.saveAudio?.(`${condition}-${scene.id}${character === null ? '' : `-${character}`}-${seed}`, audio, rendered.sampleRate);
            const run = runEngine(audio, rendered.sampleRate, deps.makeRecognizer(rendered), expected, options);
            const notes = finalNotes(run.events);
            const flags = flagRecords(run.events);
            const score = scoreOutcome(perf.labels, notes, flags, rendered.segments);
            scored.get(condition)!.push({ ...score, durationSec: run.durationSec, rtf: run.rtf });
            runs.push({
              condition, mode, room, character, sceneId: scene.id, seed, labels: perf.labels, notes, flags,
              heard: run.heard.map(({ text, start, end, confidence }) => ({ text, start, end, confidence })),
              segments: rendered.segments, score, durationSec: run.durationSec, rtf: run.rtf,
            });
            deps.onRun?.({ condition, character, sceneId: scene.id, seed, score });
          }
        }
      }
    }
  }
  const conditions: Record<string, Aggregate> = {};
  for (const [name, list] of scored) if (list.length) conditions[name] = aggregate(list);
  return { report: { createdAt: new Date().toISOString(), config: { ...config }, conditions }, runs };
}
