# DASMA Engine-Change Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fix the harness so it measures fairly and repeatably, then change the matching engine and recognizer wrapper so that the new `solo-close-mic` condition meets all four MVP spec §10 solo targets on held-out seeds. This unlocks M3.

**Architecture:**
- **Step 0 (Tasks 1–6)** changes only `harness/`: cached TTS audio, a solo condition, fair false-alarm counting, more material and richer run records. It ends with a committed baseline.
- **Round 1 (Tasks 7–17)** changes `packages/align` (scoring rules and aligner behaviour) and `packages/asr` (a stabilizer measured in audio seconds, and an audio-quality meter). It ends with a measurement.
- **Round 2 (Tasks 18–21)** runs only if `solo-close-mic` still misses a target, and contains only the items that round 1's error breakdown points to.
- **Task 22** updates the docs.

**Tech Stack:** TypeScript 6 (strict), Node ≥ 24, npm workspaces, Vitest 5, fast-check, tsx, sherpa-onnx-node 1.13.8 (recognizer and Piper TTS).

**Spec:** `docs/superpowers/specs/2026-10-10-engine-pass-design.md` (the "pass spec"). The parent is `docs/superpowers/specs/2026-10-10-dasma-design.md` (the "MVP spec"). The evidence is `docs/m1-results.md`.

## Global Constraints

- `packages/align` stays pure TypeScript: no `node:*`, DOM or `@dasma/*` imports (ESLint enforces this). Its `tsconfig` has `lib: ES2022`, `types: []`.
- Everything works offline. No new runtime dependency, except the round-2 CMUdict data module (Task 20), which is vendored and committed.
- Targets are never loosened (MVP spec §10). `solo-close-mic` gates on:
  - false alerts ≤ 1 per 10 min (Patience 0.5);
  - false notes ≤ 1 per 10 min (Patience 0.5);
  - core recall ≥ 0.90 (Patience 0.5);
  - alert latency p50 < 0.5 s (Patience 0).
- Seeds 1–10 are the **tuning** set and seeds 11–30 the **held-out gate** set. Nothing is ever tuned by looking at seeds 11–30.
- There are at most two measure-and-tune rounds. After round 2 is measured, the pass ends.
- Work on branch `feat/engine-pass`. Every task ends green on `npm test`, `npm run lint` and `npm run typecheck`.
- When a deliberate rule change alters an existing test's expected value, the commit message names the test and the rule.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

These are the inputs a person will meet that the spec implies but no headline test covers, with the behaviour they should expect. Each one has a pinning test in the task named:

1. **A cache file truncated by an interrupted run** is re-rendered silently, never a crash or garbage audio (Task 1).
2. **Two heard words whose concatenation is a script word, when the script itself has them as two words** (e.g. "any one" written as "any one") stay two words (Task 7).
3. **A backward jump that is confirmed, then the run ends (`finalize`) before the redo reaches the later lines:** those lines get their earlier results back, not "dropped line" (Task 14).
4. **A recognizer hypothesis that shrinks** (a word disappears before it was released) must not release a stale word later. An endpoint must reset the stabilizer clock state (Task 16).
5. **A solo character with exactly 4 lines** is included, and one with 3 is not. **A scene that ends on cue lines** ends with silence, not with a crash or a label pointing past the end (Tasks 3–4).

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `harness/src/tts-cache.ts` (new) | Disk cache wrapping a `TtsEngine` | 1 |
| `harness/src/metrics.ts` | Scoring split into `scoreOutcome`, fair counting, sound-alike rate, renamed targets | 2, 3, 5 |
| `harness/src/perturb.ts` | Solo cues, asides, sound-alikes, quoting chatter | 3 |
| `harness/src/tts.ts` | Silent (cue) segments | 5 |
| `harness/src/scenes.ts`, `harness/scenes/*.json` | `modes`, `soloCharacters`, two new scenes | 4 |
| `harness/src/evaluate.ts`, `run-engine.ts`, `cli.ts`, `cli-args.ts`, `paths.ts` | Modes, conditions, seed ranges, run records, flags | 5, 11, 16 |
| `harness/scripts/*.ts` | Analysis scripts on the new run records; threshold sweep | 5, 19 |
| `packages/align/src/normalize.ts`, `expected.ts` | Accents, symbols, abbreviations | 7 |
| `packages/align/src/phonetic.ts` | Letter-agreement guard; (round 2) phoneme similarity | 8, 20 |
| `packages/align/src/classify.ts` | Note metadata, confidence floor, per-pair similarity, evidence-based deletions, recognizer joins | 9, 10 |
| `packages/align/src/types.ts` | `AlignOptions.heardConfidenceFloor` | 9 |
| `packages/align/src/off-script.ts` (new) | Off-script run detection | 13 |
| `packages/align/src/aligner.ts` | Rejoin, anchored alerts, off-script downgrade, backward safety, Patience-0 re-alignment | 7, 12–15 |
| `packages/asr/src/quality.ts` (new) | `AudioQualityMeter` | 11 |
| `packages/asr/src/stabilizer.ts`, `node/node-recognizer.ts` | Stabilizer in audio seconds | 16 |
| `docs/engine-pass-results.md` (new) | Step 0, round 1 and round 2 results; M3 GO or NO-GO | 6, 17, 21 |

---

## Step 0 — The measuring tool

### Task 1: TTS render cache

**Files:**
- Create: `harness/src/tts-cache.ts`
- Modify: `harness/src/paths.ts`, `harness/src/tts.ts:24-26`, `harness/src/cli.ts` (the `tts:` line in `runEvaluate`)
- Test: `harness/test/tts-cache.test.ts`

**Interfaces:**
- Consumes: `TtsEngine` from `harness/src/tts.ts`, i.e. `synth(text, sid, speed): { samples: Float32Array; sampleRate: number }`.
- Produces:
  - `cacheKey(modelId: string, sid: number, speed: number, text: string): string`
  - `cachedTts(inner: TtsEngine, dir: string, modelId: string): TtsEngine`
  - `TTS_MODEL_ID` (in `tts.ts`) and `TTS_CACHE_DIR` (in `paths.ts`).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/engine-pass
```

- [ ] **Step 2: Write the failing test** — `harness/test/tts-cache.test.ts`

```ts
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TtsEngine } from '../src/tts';
import { cacheKey, cachedTts } from '../src/tts-cache';

/** Like Piper: a different render every call, so only the cache can make audio repeatable. */
function counting(): TtsEngine & { calls: number } {
  const engine = {
    calls: 0,
    synth(text: string, sid: number, speed: number) {
      engine.calls++;
      return { samples: Float32Array.from([text.length, sid, speed, Math.random()]), sampleRate: 22050 };
    },
  };
  return engine;
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'dasma-tts-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('cachedTts', () => {
  it('renders once, then returns identical audio from disk', () => {
    const inner = counting();
    const tts = cachedTts(inner, tmp(), 'model-a');
    const a = tts.synth('Yes, sir.', 14, 1);
    const b = tts.synth('Yes, sir.', 14, 1);
    expect(inner.calls).toBe(1);
    expect(b.sampleRate).toBe(22050);
    expect(Array.from(b.samples)).toEqual(Array.from(a.samples));
  });

  it('a second wrapper on the same directory (a new process) reads the cache', () => {
    const dir = tmp();
    const first = cachedTts(counting(), dir, 'model-a').synth('Hello', 3, 1);
    const inner = counting();
    const again = cachedTts(inner, dir, 'model-a').synth('Hello', 3, 1);
    expect(inner.calls).toBe(0);
    expect(Array.from(again.samples)).toEqual(Array.from(first.samples));
  });

  it('keys on model, voice, speed and text', () => {
    const keys = [cacheKey('m', 1, 1, 't'), cacheKey('n', 1, 1, 't'), cacheKey('m', 2, 1, 't'), cacheKey('m', 1, 1.1, 't'), cacheKey('m', 1, 1, 'u')];
    expect(new Set(keys).size).toBe(5);
    expect(cacheKey('m', 1, 1, 't')).toBe(keys[0]);
  });

  it('re-renders a truncated cache file instead of failing (Review Focus 1)', () => {
    const dir = tmp();
    const inner = counting();
    const tts = cachedTts(inner, dir, 'model-a');
    tts.synth('Line', 3, 1);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    writeFileSync(join(dir, files[0]!), Buffer.from([1, 2, 3, 4, 5, 6]));
    const out = tts.synth('Line', 3, 1);
    expect(inner.calls).toBe(2);
    expect(out.samples.length).toBe(4);
    expect(readdirSync(dir)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run harness/test/tts-cache.test.ts`
Expected: FAIL, because it cannot resolve `../src/tts-cache`.

- [ ] **Step 4: Implement** — `harness/src/tts-cache.ts`

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TtsEngine } from './tts';

type Audio = { samples: Float32Array; sampleRate: number };

export function cacheKey(modelId: string, sid: number, speed: number, text: string): string {
  return createHash('sha256').update(JSON.stringify([modelId, sid, speed, text])).digest('hex');
}

/** File layout: uint32 LE sample rate, then float32 LE samples. */
function encode(a: Audio): Buffer {
  const buf = Buffer.alloc(4 + a.samples.length * 4);
  buf.writeUInt32LE(a.sampleRate, 0);
  Buffer.from(a.samples.buffer, a.samples.byteOffset, a.samples.byteLength).copy(buf, 4);
  return buf;
}

function decode(buf: Buffer): Audio | null {
  if (buf.length < 4 || (buf.length - 4) % 4 !== 0) return null;
  const sampleRate = buf.readUInt32LE(0);
  if (sampleRate === 0) return null;
  // slice() copies into a fresh, 4-byte-aligned ArrayBuffer.
  const samples = new Float32Array(buf.buffer.slice(buf.byteOffset + 4, buf.byteOffset + buf.length));
  return { samples, sampleRate };
}

/**
 * Piper/VITS samples noise, so the same text renders differently each time. Wrapping the engine in this cache
 * renders each (model, voice, speed, text) once and reads it back afterwards, which makes harness runs repeatable.
 */
export function cachedTts(inner: TtsEngine, dir: string, modelId: string): TtsEngine {
  mkdirSync(dir, { recursive: true });
  return {
    synth(text, sid, speed) {
      const file = join(dir, `${cacheKey(modelId, sid, speed, text)}.f32`);
      const hit = existsSync(file) ? decode(readFileSync(file)) : null;
      if (hit) return hit;
      const audio = inner.synth(text, sid, speed);
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, encode(audio));
      renameSync(tmp, file);
      return audio;
    },
  };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run harness/test/tts-cache.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the cache into the CLI**

In `harness/src/paths.ts`, add after `OUT_DIR`:

```ts
export const TTS_CACHE_DIR = join(OUT_DIR, 'tts-cache');
```

In `harness/src/tts.ts`, replace the `TTS_MODEL_DIR` line with:

```ts
export const TTS_MODEL_ID = 'vits-piper-en_US-libritts_r-medium';
export const TTS_MODEL_DIR = join(MODELS_DIR, TTS_MODEL_ID);
```

In `harness/src/cli.ts`:
- Import `cachedTts` from `./tts-cache`, `TTS_CACHE_DIR` from `./paths`, and `TTS_MODEL_ID` from `./tts`.
- In `runEvaluate`, replace `tts: createSherpaTts(),` with:

```ts
      tts: cachedTts(createSherpaTts(), TTS_CACHE_DIR, TTS_MODEL_ID),
```

`harness/out/` is already git-ignored, so the cache never enters git.

- [ ] **Step 7: Run the full checks**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add harness/src/tts-cache.ts harness/src/paths.ts harness/src/tts.ts harness/src/cli.ts harness/test/tts-cache.test.ts
git commit -m "feat(harness): cache rendered TTS audio so runs are repeatable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fair false-alarm counting

The old rule ignored every line that carried a planted error. The new rule, from pass spec §4.4: on an error line with *k* labels, notes beyond the first *k* are false, and likewise alerts beyond the first *k*. Lines with no planted error count as before.

**Files:**
- Modify: `harness/src/metrics.ts:31-75` (`scoreRun`)
- Test: `harness/test/metrics.test.ts`

**Interfaces:**
- Consumes: `TimedEvent` from `run-engine.ts`, `Label` from `perturb.ts`, `RenderedSegment` from `tts.ts`.
- Produces (exported from `metrics.ts`):
  - `interface FlagRecord { note: NoteDraft; alert: boolean; audioTime: number }`
  - `finalNotes(events: TimedEvent[]): NoteDraft[]`, the last `lineDone` per line, flattened.
  - `flagRecords(events: TimedEvent[]): FlagRecord[]`
  - `scoreOutcome(labels: Label[], notes: NoteDraft[], flags: FlagRecord[], segments: RenderedSegment[]): ScoredRun`
  - `scoreRun(labels, events, segments)`, unchanged signature, now `scoreOutcome(labels, finalNotes(events), flagRecords(events), segments)`.

- [ ] **Step 1: Write the failing tests.** Append to the `describe('scoreRun', …)` block in `harness/test/metrics.test.ts`:

```ts
  it('counts notes and alerts beyond the planted errors on an error line as false (fair counting)', () => {
    const extra: TimedEvent[] = [
      { event: { type: 'flag', note: note('A', 'wrong-words'), alert: true, at: 1.5 }, audioTime: 1.6 },
      { event: { type: 'flag', note: note('A', 'dropped-words'), alert: true, at: 1.7 }, audioTime: 1.8 },
      {
        event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words'), note('A', 'dropped-words'), note('A', 'added-words'), note('A', 'added-words', 'check')], at: 2 },
        audioTime: 2.1,
      },
    ];
    const s = scoreRun(labels.slice(0, 1), extra, segments);
    expect(s).toMatchObject({ detected: 1, falseNotes: 2, falseAlerts: 1, falseChecks: 0 });
  });

  it('two planted errors on one line allow two notes and two alerts', () => {
    const two: Label[] = [labels[0]!, { ...labels[0]!, kind: 'dropped-words', wordIndex: 3 }];
    const evs: TimedEvent[] = [
      { event: { type: 'flag', note: note('A', 'wrong-words'), alert: true, at: 1.5 }, audioTime: 1.6 },
      { event: { type: 'flag', note: note('A', 'dropped-words'), alert: true, at: 1.7 }, audioTime: 1.8 },
      { event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words'), note('A', 'dropped-words')], at: 2 }, audioTime: 2.1 },
    ];
    expect(scoreRun(two, evs, segments)).toMatchObject({ errorLabels: 2, detected: 2, falseNotes: 0, falseAlerts: 0 });
  });

  it('scoreOutcome scores stored notes and flags the same way as scoreRun scores events', () => {
    expect(scoreOutcome(labels, finalNotes(events), flagRecords(events), segments)).toEqual(scoreRun(labels, events, segments));
  });
```

Update the import line at the top of the file:

```ts
import { aggregate, checkTargets, compareToBaseline, finalNotes, flagRecords, formatReport, scoreOutcome, scoreRun, type EvalReport } from '../src/metrics';
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run harness/test/metrics.test.ts`
Expected: FAIL. The new tests fail because `finalNotes`/`flagRecords`/`scoreOutcome` are not exported, and fair counting gives `falseNotes: 0`.

- [ ] **Step 3: Implement.** In `harness/src/metrics.ts`, replace the whole `scoreRun` function with:

```ts
export interface FlagRecord {
  note: NoteDraft;
  alert: boolean;
  audioTime: number;
}

/** The notes that stand at the end of a run: a later lineDone for the same line supersedes earlier ones. */
export function finalNotes(events: TimedEvent[]): NoteDraft[] {
  const finalByLine = new Map<string, NoteDraft[]>();
  for (const { event } of events) if (event.type === 'lineDone') finalByLine.set(event.lineId, event.notes);
  return [...finalByLine.values()].flat();
}

export function flagRecords(events: TimedEvent[]): FlagRecord[] {
  return events.flatMap(({ event, audioTime }) => (event.type === 'flag' ? [{ note: event.note, alert: event.alert, audioTime }] : []));
}

export function scoreRun(labels: Label[], events: TimedEvent[], segments: RenderedSegment[]): ScoredRun {
  return scoreOutcome(labels, finalNotes(events), flagRecords(events), segments);
}

export function scoreOutcome(labels: Label[], notes: NoteDraft[], flags: FlagRecord[], segments: RenderedSegment[]): ScoredRun {
  const errors = labels.filter((l) => !isBenign(l.kind));
  const errorsPerLine = new Map<string, number>();
  for (const l of errors) errorsPerLine.set(l.lineId, (errorsPerLine.get(l.lineId) ?? 0) + 1);
  const benignLines = new Set(labels.filter((l) => isBenign(l.kind)).map((l) => l.lineId));
  const s: ScoredRun = {
    errorLabels: 0, detected: 0, detectedInclChecks: 0, sameCategory: 0, coreLabels: 0, coreDetected: 0,
    perCategory: {}, falseNotes: 0, falseChecks: 0, falseAlerts: 0, benignViolations: 0, alertLatencies: [],
  };
  for (const label of errors) {
    const onLine = notes.filter((n) => n.lineId === label.lineId);
    const hit = onLine.some((n) => n.status === 'note');
    const cat = (s.perCategory[label.kind] ??= { labels: 0, detected: 0 });
    s.errorLabels++;
    cat.labels++;
    if (hit) {
      s.detected++;
      cat.detected++;
    }
    if (onLine.length) s.detectedInclChecks++;
    if (onLine.some((n) => n.status === 'note' && n.category === label.kind)) s.sameCategory++;
    if (CORE_KINDS.has(label.kind)) {
      s.coreLabels++;
      if (hit) s.coreDetected++;
    }
    const t = labelTime(label, segments);
    const alert = flags.find((f) => f.alert && f.note.lineId === label.lineId);
    if (t !== null && alert) s.alertLatencies.push(Math.max(0, alert.audioTime - t));
  }
  // Fair counting (pass spec §4.4): on a line with k planted errors, the first k notes and the first k alerts
  // can be detections; any beyond that are false. Lines with no planted error count every note and alert as false.
  const notesSeen = new Map<string, number>();
  for (const n of notes) {
    const k = errorsPerLine.get(n.lineId) ?? 0;
    if (n.status !== 'note') {
      if (k === 0) s.falseChecks++;
      continue;
    }
    if (k === 0) {
      s.falseNotes++;
      if (benignLines.has(n.lineId)) s.benignViolations++;
      continue;
    }
    const seen = (notesSeen.get(n.lineId) ?? 0) + 1;
    notesSeen.set(n.lineId, seen);
    if (seen > k) s.falseNotes++;
  }
  const alertsSeen = new Map<string, number>();
  for (const f of flags) {
    if (!f.alert) continue;
    const seen = (alertsSeen.get(f.note.lineId) ?? 0) + 1;
    alertsSeen.set(f.note.lineId, seen);
    if (seen > (errorsPerLine.get(f.note.lineId) ?? 0)) s.falseAlerts++;
  }
  return s;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run harness/test/metrics.test.ts`
Expected: PASS. The existing `scores detections, false notes, false alerts, and latency` test is unchanged and still passes: line A has one error, one note and one alert; line B has none.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add harness/src/metrics.ts harness/test/metrics.test.ts
git commit -m "feat(harness): count extra notes and alerts on error lines as false alarms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Perturbations — solo cues, asides, sound-alikes, quoting chatter

**Files:**
- Modify: `harness/src/perturb.ts` (types, lists, `feasible`, `perturbScene`)
- Modify: `harness/src/metrics.ts` (sound-alike detection rate)
- Test: `harness/test/perturb.test.ts`, `harness/test/metrics.test.ts`

**Interfaces:**
- Consumes: `Scene`, `SceneLine` (scenes.ts); `pick`, `Rng` (rng.ts); `tokenize`, `FUNCTION_WORDS` (`@dasma/align`).
- Produces (perturb.ts):
  - `type BenignKind = 'stumble' | 'chatter' | 'long-pause' | 'aside'`
  - `BENIGN_KINDS` (director default, unchanged: stumble, long-pause, chatter)
  - `SOLO_ERROR_KINDS: ErrorKind[]` (all except `jumped-cue`)
  - `SOLO_BENIGN_KINDS: BenignKind[]` (stumble, long-pause, aside)
  - `isBenign(kind)`, which now also treats `aside` as benign
  - `Label.soundAlike?: true`
  - `Segment.silent?: true`, a cue the app would play; it is rendered as silence of its spoken length
  - `PerturbOptions.solo?: string`, the character being rehearsed
  - `SOUND_ALIKES: ReadonlyArray<readonly [string, string]>`, `ASIDES: readonly string[]`
- Produces (metrics.ts): `ScoredRun.soundAlike: { labels: number; detected: number }`, plus `Aggregate.soundAlikeLabels: number` and `Aggregate.soundAlikeRecall: number | null`.

- [ ] **Step 1: Write the failing perturb tests.** Add to `harness/test/perturb.test.ts`:

```ts
// add to the import from '../src/perturb':  SOLO_BENIGN_KINDS, SOLO_ERROR_KINDS, SOUND_ALIKES, isBenign

describe('perturbScene: solo', () => {
  it("the other characters' lines become silent cues; only the soloist's lines are spoken or labelled", () => {
    const p = run({ errorRate: 0.6, benignRate: 0.3, solo: 'ANN', errorKinds: SOLO_ERROR_KINDS, benignKinds: SOLO_BENIGN_KINDS }, 3);
    for (const seg of p.segments) {
      if (seg.speaker === 'BEN') {
        expect(seg.silent).toBe(true);
        expect(seg.lineId).toBeUndefined();
      } else {
        expect(seg.silent).toBeUndefined();
      }
    }
    expect(p.segments.filter((s) => s.silent).map((s) => s.text)).toEqual([SCENE.lines[1]!.text, SCENE.lines[3]!.text]);
    for (const label of p.labels) {
      expect(label.characterId).toBe('ANN');
      expect(p.segments[label.segmentIndex]!.silent).toBeUndefined();
    }
  });

  it('a dropped line in solo points at the soloist’s next spoken line, past the cue', () => {
    const p = run({ errorRate: 1, benignRate: 0, solo: 'ANN', errorKinds: ['dropped-line'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1']);
    const seg = p.segments[p.labels[0]!.segmentIndex]!;
    expect(seg.lineId).toBe('A2');
    expect(seg.silent).toBeUndefined();
  });

  it('an aside is benign, interrupts the line, and is followed by the rest of the line or a restart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = run({ errorRate: 0, benignRate: 1, solo: 'ANN', benignKinds: ['aside'] }, seed);
      const asides = p.labels.filter((l) => l.kind === 'aside');
      expect(asides.length).toBeGreaterThan(0);
      for (const label of asides) {
        expect(isBenign(label.kind)).toBe(true);
        const after = p.segments[label.segmentIndex + 1]!;
        expect(after.lineId).toBe(label.lineId);
      }
    }
  });
});

describe('perturbScene: sound-alikes and quoting chatter', () => {
  it('sound-alike substitutions come from the list, change one word, and are flagged', () => {
    const alike = new Map(SOUND_ALIKES.flatMap(([a, b]) => [[a, b], [b, a]] as Array<[string, string]>));
    let seen = 0;
    for (const scene of loadScenes('all')) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = perturbScene(scene, mulberry32(seed), { errorRate: 1, benignRate: 0, errorKinds: ['wrong-words'] });
        for (const label of p.labels.filter((l) => l.soundAlike)) {
          seen++;
          const original = tokenize(scene.lines.find((l) => l.id === label.lineId)!.text);
          const spoken = tokenize(p.segments[label.segmentIndex]!.text);
          const core = (w: string) => w.replace(/[^A-Za-z']/g, '').toLowerCase();
          expect(alike.get(core(original[label.wordIndex]!))).toBe(core(spoken[label.wordIndex]!));
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('the sound-alike list holds distinct, non-identical spellings', () => {
    for (const [a, b] of SOUND_ALIKES) {
      expect(a).not.toBe(b);
      expect(a).toBe(a.toLowerCase());
      expect(b).toBe(b.toLowerCase());
    }
  });

  it('some director chatter quotes the opening words of an earlier line', () => {
    const scene = loadScenes(['earnest-act1'])[0]!;
    const quotes: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const p = perturbScene(scene, mulberry32(seed), { errorRate: 0, benignRate: 1, benignKinds: ['chatter'] });
      quotes.push(...p.segments.filter((s) => s.speaker === 'DIRECTOR' && s.text.startsWith('Go back to')).map((s) => s.text));
    }
    expect(quotes.length).toBeGreaterThan(5);
    const openings = scene.lines.map((l) => tokenize(l.text).slice(0, 4).join(' ').replace(/[^A-Za-z']+$/, ''));
    for (const q of quotes) expect(openings.some((o) => q.includes(o))).toBe(true);
  });
});
```

Then extend the existing `keeps every label anchored…` test so it also covers solo. Inside its `for (const scene …)` loop, after the director loop body, add:

```ts
      for (const character of [...new Set(scene.lines.map((l) => l.character))]) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = perturbScene(scene, mulberry32(seed), {
            errorRate: 0.4, benignRate: 0.3, solo: character, errorKinds: SOLO_ERROR_KINDS, benignKinds: SOLO_BENIGN_KINDS,
          });
          for (const label of p.labels) {
            const seg = p.segments[label.segmentIndex];
            expect(seg, `solo ${character} ${scene.id} #${seed}: ${label.kind} points past the end`).toBeDefined();
            expect(seg!.silent, `solo ${character} ${scene.id} #${seed}: ${label.kind} points at a cue`).toBeUndefined();
            expect(label.characterId).toBe(character);
          }
        }
      }
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run harness/test/perturb.test.ts`
Expected: FAIL. The imports `SOLO_ERROR_KINDS` etc. are undefined, and `solo` is not an option.

- [ ] **Step 3: Implement in `harness/src/perturb.ts`.**

Types and lists (replace the existing `BenignKind`, `BENIGN_KINDS`, `isBenign`, `Segment`, `Label` and `PerturbOptions` declarations):

```ts
export type BenignKind = 'stumble' | 'chatter' | 'long-pause' | 'aside';
export type LabelKind = ErrorKind | BenignKind;

export const ERROR_KINDS: ErrorKind[] = [
  'dropped-line', 'dropped-words', 'added-words', 'wrong-words', 'transposed', 'paraphrase', 'jumped-cue', 'called-for-line',
];
/** Director-mode default. */
export const BENIGN_KINDS: BenignKind[] = ['stumble', 'long-pause', 'chatter'];
/** Solo has no scene partner (no jumped cue) and no director (no chatter); an actor's own asides replace chatter. */
export const SOLO_ERROR_KINDS: ErrorKind[] = ERROR_KINDS.filter((k) => k !== 'jumped-cue');
export const SOLO_BENIGN_KINDS: BenignKind[] = ['stumble', 'long-pause', 'aside'];
const ALL_BENIGN: readonly string[] = ['stumble', 'long-pause', 'chatter', 'aside'];
export const isBenign = (kind: LabelKind): kind is BenignKind => ALL_BENIGN.includes(kind);

export interface Segment {
  speaker: string;
  text: string;
  pauseBefore: number;
  lineId?: string;
  /** A cue the app would play in solo mode: rendered as silence of the same length (the app ignores the mic meanwhile). */
  silent?: true;
}

export interface Label {
  kind: LabelKind;
  lineId: string;
  characterId: string;
  segmentIndex: number;
  wordIndex: number;
  /** A wrong word that is a near sound-alike of the scripted word (reported separately). */
  soundAlike?: true;
}

export interface PerturbOptions {
  errorRate: number;
  benignRate: number;
  errorKinds?: ErrorKind[];
  benignKinds?: BenignKind[];
  /** Solo mode: the character being rehearsed. Other characters' lines become silent cues. */
  solo?: string;
}
```

Add after `CHATTER`:

```ts
/** Near sound-alikes that an actor can plausibly say instead and a listener can still tell apart (no true homophones). */
export const SOUND_ALIKES: ReadonlyArray<readonly [string, string]> = [
  ['accept', 'except'], ['expression', 'impression'], ['feeling', 'filling'], ['playing', 'praying'], ['play', 'pray'],
  ['bottles', 'battles'], ['pint', 'paint'], ['rarely', 'really'], ['pleasant', 'present'], ['sake', 'shake'],
  ['sir', 'sore'], ['quite', 'quiet'], ['fellow', 'follow'], ['letters', 'litters'], ['reward', 'regard'],
  ['inscription', 'subscription'], ['rule', 'role'], ['culture', 'vulture'], ['private', 'pirate'], ['matter', 'mutter'],
  ['decide', 'divide'], ['uncle', 'ankle'], ['cards', 'carts'], ['deny', 'defy'], ['country', 'county'],
  ['false', 'falls'], ['suspected', 'expected'], ['secret', 'sacred'], ['reveal', 'revel'], ['meaning', 'moaning'],
  ['explanation', 'expectation'], ['improbable', 'impossible'], ['slings', 'stings'], ['arms', 'alms'], ['sleep', 'slip'],
  ['rub', 'rob'], ['bear', 'beer'], ['whips', 'wipes'], ['wrong', 'ring'], ['weary', 'worry'],
  ['dread', 'bread'], ['conscience', 'conscious'], ['thought', 'taught'], ['moment', 'movement'], ['lose', 'loose'],
  ['action', 'auction'], ['father', 'farther'], ['speak', 'sneak'], ['word', 'world'], ['walls', 'wells'],
  ['sweet', 'sweat'], ['then', 'than'], ['love', 'live'], ['light', 'like'], ['hand', 'band'],
];
const SOUND_ALIKE = new Map(SOUND_ALIKES.flatMap(([a, b]) => [[a, b], [b, a]] as Array<[string, string]>));

export const ASIDES: readonly string[] = [
  'Wait, sorry, let me go again.',
  'Hang on, sorry, sorry.',
  'Oh no, what comes next, give me a second.',
];
```

Replace the `wrong-words` branch in `feasible` with:

```ts
    case 'wrong-words':
      return words.some(isContent) || words.some((w) => SOUND_ALIKE.has(core(w)));
```

Add a chatter helper above `perturbScene`:

```ts
/** Director chatter; a third of the time it quotes the opening words of an earlier line (measures backward-jump safety). */
function chatterText(scene: Scene, i: number, rng: Rng): string {
  if (i > 0 && rng() < 1 / 3) {
    const earlier = scene.lines[Math.floor(rng() * i)]!;
    const words = tokenize(earlier.text);
    const n = Math.min(words.length, 4 + Math.floor(rng() * 3));
    const quote = words.slice(0, n).join(' ').replace(/[^A-Za-z']+$/, '');
    return `Go back to "${quote}", please.`;
  }
  return pick(CHATTER, rng);
}
```

In `perturbScene`, make these changes.

(a) Track the dropped-line label so it is resolved to the next *spoken* segment (in solo, cues may come in between). Replace `let afterDrop = false;` with:

```ts
  let afterDrop = false;
  let pendingDrop: Label | null = null;
```

(b) Inside the loop, replace the `next`, `label` and `speak` definitions with:

```ts
    const nextOwn = scene.lines.slice(i + 1).find((l) => l.character === line.character);
    const next = opts.solo ? nextOwn : scene.lines[i + 1];
    const words = tokenize(line.text);
    const pauseBefore = carriedPause ?? 0.3 + 0.6 * rng();
    carriedPause = null;
    const label = (kind: LabelKind, segmentIndex: number, wordIndex: number, extra: Partial<Label> = {}): Label => {
      const l: Label = { kind, lineId: line.id, characterId: line.character, segmentIndex, wordIndex, ...extra };
      labels.push(l);
      return l;
    };
    const speak = (text: string, pause: number, speaker = line.character): number => {
      segments.push({ speaker, text, pauseBefore: pause, ...(speaker === line.character ? { lineId: line.id } : {}) });
      const index = segments.length - 1;
      if (pendingDrop) {
        pendingDrop.segmentIndex = index;
        pendingDrop = null;
      }
      return index;
    };

    if (opts.solo && line.character !== opts.solo) {
      segments.push({ speaker: line.character, text: line.text, pauseBefore, silent: true });
      continue;
    }
```

Here `line` and `scene.lines[i + 1]` are as before. The cue check comes *before* the `pendingJump`/`afterDrop` checks, so a cue never consumes them.

(c) Replace the `dropped-line` case with:

```ts
      case 'dropped-line':
        pendingDrop = label('dropped-line', -1, 0);
        carriedPause = 2.5 + rng();
        afterDrop = true;
        break;
```

(d) Replace the `wrong-words` case with:

```ts
      case 'wrong-words': {
        const contentIdxs = words.map((w, k) => (isContent(w) ? k : -1)).filter((k) => k >= 0);
        const alikeIdxs = words.map((w, k) => (SOUND_ALIKE.has(core(w)) ? k : -1)).filter((k) => k >= 0);
        const out = [...words];
        if (alikeIdxs.length && (!contentIdxs.length || rng() < 0.5)) {
          const k = pick(alikeIdxs, rng);
          out[k] = replaceCore(words[k]!, SOUND_ALIKE.get(core(words[k]!))!);
          label('wrong-words', speak(out.join(' '), pauseBefore), k, { soundAlike: true });
        } else {
          const k = pick(contentIdxs, rng);
          out[k] = replaceCore(words[k]!, pick(SUBSTITUTES.filter((s) => s !== core(words[k]!)), rng));
          label('wrong-words', speak(out.join(' '), pauseBefore), k);
        }
        break;
      }
```

(e) Replace the `chatter` case and add `aside`:

```ts
      case 'chatter':
        speak(chatterText(scene, i, rng), pauseBefore, 'DIRECTOR');
        label('chatter', speak(line.text, 1.5), 0);
        break;
      case 'aside': {
        if (words.length < 3) {
          speak(line.text, pauseBefore);
          break;
        }
        const pos = 1 + Math.floor(rng() * (words.length - 2));
        const restart = rng() < 0.5;
        speak(words.slice(0, pos).join(' '), pauseBefore);
        label('aside', speak(pick(ASIDES, rng), 0.4), 0);
        speak((restart ? words : words.slice(pos)).join(' '), 0.6);
        break;
      }
```

(f) After the loop, a scene that ends on a drop with no later spoken segment must not leave a label pointing at -1. The `feasible` check prevents this, because `next`/`nextOwn` must exist. Add a guard before `return`:

```ts
  if (pendingDrop) throw new Error(`perturbScene: dropped-line on ${pendingDrop.lineId} has no later spoken line`);
```

- [ ] **Step 4: Sound-alike rate in metrics.** In `harness/src/metrics.ts`:
- Add `soundAlike: { labels: number; detected: number };` to `ScoredRun`.
- Initialise it as `soundAlike: { labels: 0, detected: 0 }` in `scoreOutcome`'s `s`.
- In the per-label loop, after `if (hit) {…}`, add:

```ts
    if (label.soundAlike) {
      s.soundAlike.labels++;
      if (hit) s.soundAlike.detected++;
    }
```

In `Aggregate`, add `soundAlikeLabels: number;` and `soundAlikeRecall: number | null;`. In `aggregate`'s return object, add:

```ts
    soundAlikeLabels: sum((r) => r.soundAlike.labels),
    soundAlikeRecall: ratio(sum((r) => r.soundAlike.detected), sum((r) => r.soundAlike.labels)),
```

In `formatReport`, add `'soundAlikeRecall'` to the metric key list after `'sameCategoryRate'`.

Add to `harness/test/metrics.test.ts`:

```ts
describe('sound-alike detection rate', () => {
  it('is reported separately and is null when none were planted', () => {
    const alike: Label[] = [{ ...labels[0]!, soundAlike: true }];
    const s = scoreRun(alike, events, segments);
    expect(s.soundAlike).toEqual({ labels: 1, detected: 1 });
    expect(aggregate([{ ...s, durationSec: 60, rtf: 0 }]).soundAlikeRecall).toBe(1);
    expect(aggregate([{ ...scoreRun([], [], segments), durationSec: 60, rtf: 0 }]).soundAlikeRecall).toBeNull();
  });
});
```

- [ ] **Step 5: Run and confirm everything passes**

Run: `npx vitest run harness/test/perturb.test.ts harness/test/metrics.test.ts`
Expected: PASS. If `sound-alike substitutions… seen > 20` fails, the bundled scenes contain too few list words. Task 4 adds scenes, so for this task alone lower the check to `toBeGreaterThan(5)` and restore it to `> 20` in Task 4. Ledger the ruling.

- [ ] **Step 6: Full checks, then commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green. `evaluate.test.ts` stays green, because director perturbations change but its thresholds are loose.

```bash
git add harness/src/perturb.ts harness/src/metrics.ts harness/test/perturb.test.ts harness/test/metrics.test.ts
git commit -m "feat(harness): solo cues, actor asides, sound-alike errors and quoting chatter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Scenes — solo-only scenes, `soloCharacters`, two new public-domain scenes

**Files:**
- Modify: `harness/src/scenes.ts`
- Create: `harness/scenes/earnest-act1-cigarette.json`, `harness/scenes/hamlet-to-be.json`
- Test: `harness/test/scenes.test.ts`

**Interfaces:**
- Produces:
  - `Scene.modes?: Array<'solo' | 'director'>` (absent means both)
  - `soloCharacters(scene: Scene, minLines = 4): string[]`, the characters with at least `minLines` lines, in first-appearance order.

- [ ] **Step 1: Write the failing tests.** Replace the first test in `harness/test/scenes.test.ts` and add new ones:

```ts
import { describe, expect, it } from 'vitest';
import { assertSceneId, loadScenes, soloCharacters, toScriptLines, type Scene } from '../src/scenes';

describe('scenes', () => {
  it('loads all bundled scenes with unique line ids', () => {
    const scenes = loadScenes('all');
    expect(scenes.map((s) => s.id).sort()).toEqual(['earnest-act1', 'earnest-act1-cigarette', 'hamlet-to-be', 'romeo-balcony']);
    for (const s of scenes) {
      const ids = s.lines.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.source).toMatch(/Public domain/);
      for (const l of s.lines) expect(l.text).not.toMatch(/[[\]]/); // no stage directions in spoken text
    }
  });

  it('hamlet-to-be is a solo-only monologue', () => {
    const [h] = loadScenes(['hamlet-to-be']);
    expect(h!.modes).toEqual(['solo']);
    expect(soloCharacters(h!)).toEqual(['HAMLET']);
  });

  it('soloCharacters keeps characters with at least 4 lines, in first-appearance order (Review Focus 5)', () => {
    const mk = (counts: Array<[string, number]>): Scene => ({
      id: 'x', title: 'x', source: 'x',
      lines: counts.flatMap(([c, n]) => Array.from({ length: n }, (_, k) => ({ id: `${c}${k}`, character: c, text: 'a b c' }))),
    });
    expect(soloCharacters(mk([['BEA', 3], ['ANN', 4], ['CY', 5]]))).toEqual(['ANN', 'CY']);
    expect(soloCharacters(loadScenes(['earnest-act1'])[0]!)).toEqual(['ALGERNON', 'LANE']);
    expect(soloCharacters(loadScenes(['earnest-act1-cigarette'])[0]!)).toEqual(['ALGERNON', 'JACK']);
  });

  // keep the existing 'loads by id…', 'converts to aligner script lines' and 'only allows filename-safe scene ids' tests unchanged
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run harness/test/scenes.test.ts`
Expected: FAIL (`soloCharacters` is not exported; the new scenes are missing).

- [ ] **Step 3: Implement `harness/src/scenes.ts`.** Add to `Scene`:

```ts
  /** Which evaluation modes use this scene; absent = both. A monologue is solo-only. */
  modes?: Array<'solo' | 'director'>;
```

Add:

```ts
/** Characters with at least `minLines` lines, in order of first appearance: each gets its own solo run. */
export function soloCharacters(scene: Scene, minLines = 4): string[] {
  const counts = new Map<string, number>();
  for (const l of scene.lines) counts.set(l.character, (counts.get(l.character) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= minLines).map(([c]) => c);
}
```

- [ ] **Step 4: Add the scenes.** Spoken text only; stage directions are omitted. Modern spellings are used where an archaic elision would be a normalization problem outside this pass (pass spec §4.5).

`harness/scenes/earnest-act1-cigarette.json`:

```json
{
  "id": "earnest-act1-cigarette",
  "title": "The Importance of Being Earnest — the cigarette case (Act I)",
  "source": "Oscar Wilde, The Importance of Being Earnest (1895). Public domain.",
  "lines": [
    { "id": "C1", "character": "ALGERNON", "text": "Lane, have you got the cigarette case Mr. Worthing left in the smoking-room the last time he dined here?" },
    { "id": "C2", "character": "LANE", "text": "Yes, sir." },
    { "id": "C3", "character": "JACK", "text": "Do you mean to say you have had my cigarette case all this time? I wish to goodness you had let me know. I have been writing frantic letters to Scotland Yard about it. I was very nearly offering a large reward.", "paraphrase": "You mean you've had my cigarette case the whole time? I wish you had told me. I've been sending desperate letters to Scotland Yard about it, and I almost offered a big reward." },
    { "id": "C4", "character": "ALGERNON", "text": "Well, I wish you would offer one. I happen to be more than usually hard up." },
    { "id": "C5", "character": "JACK", "text": "There is no good offering a large reward now that the thing is found." },
    { "id": "C6", "character": "ALGERNON", "text": "I think that is rather mean of you, Ernest, I must say. However, it makes no matter, for, now that I look at the inscription inside, I find that the thing isn't yours after all." },
    { "id": "C7", "character": "JACK", "text": "Of course it's mine. You have seen me with it a hundred times, and you have no right whatsoever to read what is written inside. It is a very ungentlemanly thing to read a private cigarette case.", "paraphrase": "Of course it's mine. You've seen me with it countless times, and you have no right at all to read the inside. Reading someone's private cigarette case is very rude." },
    { "id": "C8", "character": "ALGERNON", "text": "Oh! it is absurd to have a hard and fast rule about what one should read and what one shouldn't. More than half of modern culture depends on what one shouldn't read." },
    { "id": "C9", "character": "JACK", "text": "I am quite aware of the fact, and I don't propose to discuss modern culture. It isn't the sort of thing one should talk of in private. I simply want my cigarette case back." },
    { "id": "C10", "character": "ALGERNON", "text": "Yes; but this isn't your cigarette case. This cigarette case is a present from some one of the name of Cecily, and you said you didn't know any one of that name." },
    { "id": "C11", "character": "JACK", "text": "Well, if you want to know, Cecily happens to be my aunt." },
    { "id": "C12", "character": "ALGERNON", "text": "Your aunt!" },
    { "id": "C13", "character": "JACK", "text": "Yes. Charming old lady she is, too. Lives at Tunbridge Wells. Just give it back to me, Algy.", "paraphrase": "Yes. She's a lovely old lady, too, and she lives in Tunbridge Wells. Just hand it back to me, Algy." },
    { "id": "C14", "character": "ALGERNON", "text": "But why does she call herself little Cecily if she is your aunt and lives at Tunbridge Wells? From little Cecily with her fondest love." },
    { "id": "C15", "character": "JACK", "text": "My dear fellow, what on earth is there in that? Some aunts are tall, some aunts are not tall. That is a matter that surely an aunt may be allowed to decide for herself. For Heaven's sake give me back my cigarette case." },
    { "id": "C16", "character": "ALGERNON", "text": "Yes. But why does your aunt call you her uncle? From little Cecily, with her fondest love to her dear Uncle Jack. Besides, your name isn't Jack at all; it is Ernest." },
    { "id": "C17", "character": "JACK", "text": "It isn't Ernest; it's Jack." },
    { "id": "C18", "character": "ALGERNON", "text": "You have always told me it was Ernest. I have introduced you to every one as Ernest. You answer to the name of Ernest. You look as if your name was Ernest. It's on your cards. Here is one of them. Mr. Ernest Worthing.", "paraphrase": "You've always said it was Ernest. I've introduced you to everyone as Ernest, you answer to Ernest, and you look like an Ernest. It's printed on your cards. Here's one: Mr. Ernest Worthing." },
    { "id": "C19", "character": "JACK", "text": "Well, my name is Ernest in town and Jack in the country, and the cigarette case was given to me in the country." },
    { "id": "C20", "character": "ALGERNON", "text": "Yes, but that does not account for the fact that your small Aunt Cecily, who lives at Tunbridge Wells, calls you her dear uncle. Come, old boy, you had much better have the thing out at once." },
    { "id": "C21", "character": "JACK", "text": "My dear Algy, you talk exactly as if you were a dentist. It is very vulgar to talk like a dentist when one isn't a dentist. It produces a false impression." },
    { "id": "C22", "character": "ALGERNON", "text": "Well, that is exactly what dentists always do. Now, go on! Tell me the whole thing. I may mention that I have always suspected you of being a confirmed and secret Bunburyist; and I am quite sure of it now." },
    { "id": "C23", "character": "JACK", "text": "Bunburyist? What on earth do you mean by a Bunburyist?" },
    { "id": "C24", "character": "ALGERNON", "text": "I'll reveal to you the meaning of that incomparable expression as soon as you are kind enough to inform me why you are Ernest in town and Jack in the country." },
    { "id": "C25", "character": "JACK", "text": "Well, produce my cigarette case first." },
    { "id": "C26", "character": "ALGERNON", "text": "Here it is. Now produce your explanation, and pray make it improbable." },
    { "id": "C27", "character": "JACK", "text": "My dear fellow, there is nothing improbable about my explanation at all. In fact it's perfectly ordinary." }
  ]
}
```

`harness/scenes/hamlet-to-be.json`:

```json
{
  "id": "hamlet-to-be",
  "title": "Hamlet — \"To be, or not to be\" (Act III, Scene i)",
  "source": "William Shakespeare, Hamlet (c. 1600), modern spellings. Public domain.",
  "modes": ["solo"],
  "lines": [
    { "id": "H1", "character": "HAMLET", "text": "To be, or not to be, that is the question." },
    { "id": "H2", "character": "HAMLET", "text": "Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles, and by opposing end them.", "paraphrase": "Is it nobler to put up with the blows of terrible luck, or to fight against a sea of troubles and end them by fighting back?" },
    { "id": "H3", "character": "HAMLET", "text": "To die, to sleep, no more; and by a sleep to say we end the heartache and the thousand natural shocks that flesh is heir to." },
    { "id": "H4", "character": "HAMLET", "text": "'Tis a consummation devoutly to be wished." },
    { "id": "H5", "character": "HAMLET", "text": "To die, to sleep; to sleep, perchance to dream; ay, there's the rub, for in that sleep of death what dreams may come, when we have shuffled off this mortal coil, must give us pause.", "paraphrase": "To die is to sleep, and to sleep is maybe to dream; that's the catch, because the dreams that might come in death, once we've left this life behind, should make us stop and think." },
    { "id": "H6", "character": "HAMLET", "text": "There's the respect that makes calamity of so long life." },
    { "id": "H7", "character": "HAMLET", "text": "For who would bear the whips and scorns of time, the oppressor's wrong, the proud man's contumely, the pangs of despised love, the law's delay, the insolence of office, and the spurns that patient merit of the unworthy takes, when he himself might his quietus make with a bare bodkin?" },
    { "id": "H8", "character": "HAMLET", "text": "Who would fardels bear, to grunt and sweat under a weary life, but that the dread of something after death, the undiscovered country from whose bourn no traveller returns, puzzles the will, and makes us rather bear those ills we have than fly to others that we know not of?" },
    { "id": "H9", "character": "HAMLET", "text": "Thus conscience does make cowards of us all, and thus the native hue of resolution is sicklied over with the pale cast of thought, and enterprises of great pith and moment with this regard their currents turn awry, and lose the name of action.", "paraphrase": "So thinking too much makes cowards of us all, and our natural boldness is weakened by worry, and great plans with this in mind go wrong and never turn into action." }
  ]
}
```

- [ ] **Step 5: Run and confirm everything passes**

Run: `npx vitest run harness/test/scenes.test.ts harness/test/perturb.test.ts`
Expected: PASS. Restore `seen > 20` in the sound-alike test if Task 3 lowered it.

- [ ] **Step 6: Full checks, then commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green. `evaluate.test.ts` uses `sceneIds: 'all'` and asserts `runs === 6`, so it now sees more scenes. Change its `config.sceneIds` to `['earnest-act1', 'romeo-balcony']`; Task 5 rewrites this test anyway.

```bash
git add harness/src/scenes.ts harness/scenes/earnest-act1-cigarette.json harness/scenes/hamlet-to-be.json harness/test/scenes.test.ts harness/test/evaluate.test.ts
git commit -m "feat(harness): add cigarette-case two-hander and Hamlet monologue; solo character selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Solo mode in `evaluate`, condition names, seed ranges, richer run records

**Files:**
- Modify: `harness/src/evaluate.ts` (rewrite of `EvalConfig`, `RunRecord`, `evaluate`), `harness/src/run-engine.ts`, `harness/src/tts.ts` (`renderPerformance`), `harness/src/metrics.ts` (`TARGETS`), `harness/src/cli-args.ts`, `harness/src/cli.ts`
- Modify: `harness/test/helpers/scripted-recognizer.ts` (`oracleWords` skips silent cues)
- Modify: `harness/scripts/{lib,similarity-whatif,metric-caveats,false-note-table,label-outcomes,false-note-causes,oracle-eval,trace-run}.ts`
- Test: `harness/test/evaluate.test.ts`, `harness/test/cli-args.test.ts`, `harness/test/tts.test.ts`, `harness/test/metrics.test.ts`, `harness/test/run-engine.test.ts`

**Interfaces:**
- Consumes:
  - `soloCharacters`, `Scene.modes` (Task 4)
  - `SOLO_ERROR_KINDS`, `SOLO_BENIGN_KINDS`, `Segment.silent` (Task 3)
  - `scoreOutcome`, `finalNotes`, `flagRecords`, `FlagRecord` (Task 2)
- Produces:
  - `type Mode = 'solo' | 'director'`, `MODES: Mode[]`, `conditionName(mode: Mode, room: RoomName): string` (in evaluate.ts)
  - `EvalConfig.modes: Mode[]`, `EvalConfig.seedFrom: number`
  - `RunRecord`: `{ condition, mode, room, character: string | null, sceneId, seed, labels, notes, flags: FlagRecord[], heard: Array<{ text: string; start: number; end: number; confidence: number }>, segments: RenderedSegment[], score, durationSec, rtf }`
  - `EngineRun.heard: HeardWord[]`
  - `TARGETS` keys `solo-close-mic`, `director-far-field`, `director-far-field-hard`
  - `EvaluateOptions.modes: Mode[]`, `EvaluateOptions.seedFrom: number`
  - CLI flags `--modes <solo,director>` (default both) and `--seed-from <n>` (default 1)

- [ ] **Step 1: Write the failing tests.**

`harness/test/tts.test.ts`, add:

```ts
  it('renders a silent (cue) segment as silence of the same length', () => {
    const perf: Performance = {
      segments: [
        { speaker: 'A', text: 'one two', pauseBefore: 0, lineId: 'L1' },
        { speaker: 'B', text: 'three four five', pauseBefore: 0, silent: true },
      ],
      labels: [],
    };
    const r = renderPerformance(perf, { A: 1, B: 2 }, fakeTts);
    expect(r.segments[1]!.end - r.segments[1]!.start).toBeCloseTo(0.96);
    const cue = r.samples.subarray(Math.round(r.segments[1]!.start * 16000), Math.round(r.segments[1]!.end * 16000));
    expect(cue.every((x) => x === 0)).toBe(true);
    expect(r.samples[100]).toBeCloseTo(0.1);
  });
```

`harness/test/evaluate.test.ts`, replace the file:

```ts
import { describe, expect, it } from 'vitest';
import { evaluate, type EvalConfig } from '../src/evaluate';
import { fakeTts } from './helpers/fake-tts';
import { ScriptedRecognizer, oracleWords } from './helpers/scripted-recognizer';

const config: EvalConfig = {
  sceneIds: ['earnest-act1', 'romeo-balcony'],
  modes: ['director'],
  seedFrom: 1,
  seeds: 3,
  rooms: ['close-mic'],
  patience: 0.5,
  strictness: { mode: 'word-perfect' },
  errorRate: 0.35,
  benignRate: 0.2,
  model: 'oracle',
};
const deps = { tts: fakeTts, makeRecognizer: (r: Parameters<typeof oracleWords>[0]) => new ScriptedRecognizer(oracleWords(r)) };

describe('evaluate (end to end, perfect recognizer)', () => {
  it('director mode finds planted errors without false alarms', () => {
    const { report, runs } = evaluate(config, deps);
    const agg = report.conditions['director-close-mic']!;
    expect(agg.runs).toBe(6);
    expect(runs).toHaveLength(6);
    expect(runs.every((r) => r.condition === 'director-close-mic' && r.mode === 'director' && r.character === null)).toBe(true);
    expect(agg.errorLabels).toBeGreaterThan(10);
    expect(agg.coreRecall!).toBeGreaterThanOrEqual(0.7);
    expect(agg.falseAlertsPerRun).toBeLessThanOrEqual(0.5);
    expect(agg.falseNotesPerRun).toBeLessThanOrEqual(0.5);
  });

  it('solo mode runs once per character with ≥ 4 lines, expecting only that character’s lines', () => {
    const { report, runs } = evaluate({ ...config, modes: ['solo'], seeds: 2 }, deps);
    // earnest-act1: ALGERNON, LANE; romeo-balcony: JULIET, ROMEO → 4 characters × 2 seeds.
    expect(runs).toHaveLength(8);
    expect(report.conditions['solo-close-mic']!.runs).toBe(8);
    for (const r of runs) {
      expect(r.character).not.toBeNull();
      for (const n of r.notes) expect(n.characterId).toBe(r.character);
      for (const l of r.labels) {
        expect(l.characterId).toBe(r.character);
        expect(['jumped-cue', 'chatter']).not.toContain(l.kind);
      }
      expect(r.segments.some((s) => s.seg.silent)).toBe(true);
      expect(r.heard.length).toBeGreaterThan(0);
    }
  });

  it('a solo-only scene is skipped in director mode', () => {
    const { runs } = evaluate({ ...config, sceneIds: ['hamlet-to-be'], modes: ['director', 'solo'], seeds: 1 }, deps);
    expect(runs.map((r) => r.mode)).toEqual(['solo']);
  });

  it('seedFrom selects a disjoint seed range', () => {
    const a = evaluate({ ...config, seeds: 2 }, deps).runs.map((r) => r.seed);
    const b = evaluate({ ...config, seedFrom: 11, seeds: 2 }, deps).runs.map((r) => r.seed);
    expect(new Set(a)).toEqual(new Set([1, 2]));
    expect(new Set(b)).toEqual(new Set([11, 12]));
  });

  it('is deterministic', () => {
    const cfg: EvalConfig = { ...config, modes: ['solo', 'director'], seeds: 1 };
    expect(evaluate(cfg, deps).report.conditions).toEqual(evaluate(cfg, deps).report.conditions);
  });
});
```

`harness/test/cli-args.test.ts`:
- Add `modes: 'solo,director'` and `'seed-from': '1'` to `base`.
- Change the defaults expectation to include `modes: ['solo', 'director'], seedFrom: 1`.
- Add:

```ts
  it('parses --modes and --seed-from', () => {
    expect(parse({ modes: 'director', 'seed-from': '11' })).toMatchObject({ modes: ['director'], seedFrom: 11 });
    expect(parse({ modes: 'solo, solo ,director' }).modes).toEqual(['solo', 'director']);
  });

  it('rejects an unknown mode and a bad --seed-from', () => {
    expect(() => parse({ modes: 'solo,chorus' })).toThrow(/Unknown mode "chorus"\. Known: solo, director/);
    expect(() => parse({ modes: '' })).toThrow(/--modes needs at least one mode/);
    for (const bad of ['0', '-1', '1.5', 'x', '']) expect(() => parse({ 'seed-from': bad })).toThrow(/--seed-from must be a positive integer/);
  });
```

`harness/test/metrics.test.ts`: change every `'close-mic'` condition key to `'solo-close-mic'`, `'far-field'` to `'director-far-field'`, and `'far-field-hard'` to `'director-far-field-hard'`. This applies to the report objects, the `checkTargets` calls, the expected `'## close-mic'` string (now `'## solo-close-mic'`) and the gate line strings.

`harness/test/run-engine.test.ts`, add:

```ts
  it('returns the stabilized words it heard', () => {
    const heard = words('one two three four five six seven eight nine ten');
    const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(heard), expected, options);
    expect(run.heard.map((w) => w.text)).toEqual(heard.map((w) => w.text));
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run harness/test`
Expected: FAIL in the tests above (missing `modes`, `seedFrom`, `heard`, `silent` rendering, renamed targets).

- [ ] **Step 3: Implement.**

`harness/src/tts.ts` in `renderPerformance`: replace the line `const audio = tts.synth(…)` and the `chunks.push(pad, audio.samples)` line with:

```ts
    const audio = tts.synth(seg.text, voices[seg.speaker] ?? VOICE_POOL[0]!, speed);
    if (!sampleRate) sampleRate = audio.sampleRate;
    const pad = new Float32Array(Math.round(seg.pauseBefore * sampleRate));
    // A solo cue is played by the app, which ignores the mic meanwhile: the mic hears silence of the cue's length.
    chunks.push(pad, seg.silent ? new Float32Array(audio.samples.length) : audio.samples);
```

The existing `if (!sampleRate) …` line moves up as shown; do not duplicate it.

`harness/test/helpers/scripted-recognizer.ts` in `oracleWords`: change `rendered.segments.flatMap(({ seg, start, end }) => {` to

```ts
  return rendered.segments
    .filter(({ seg }) => !seg.silent)
    .flatMap(({ seg, start, end }) => {
```

`harness/src/run-engine.ts`: add `heard: HeardWord[]` to `EngineRun`, collect it, and return it:

```ts
import { createAligner, type AlignEvent, type AlignOptions, type ExpectedWord, type HeardWord } from '@dasma/align';
// …
export interface EngineRun {
  events: TimedEvent[];
  heard: HeardWord[];
  rtf: number;
  durationSec: number;
}
// in runEngine:
  const heard: HeardWord[] = [];
  const off = recognizer.onWords((words) => {
    heard.push(...words);
    aligner.push(words);
  });
// …
  return { events, heard, rtf: recognizer.realtimeFactor(), durationSec };
```

`harness/src/metrics.ts`: replace the `TARGETS` definition with:

```ts
export const TARGETS: Record<string, Target[]> = {
  'solo-close-mic': [
    { metric: 'falseAlertsPer10Min', op: '<=', value: 1, label: 'False alerts per 10 min' },
    { metric: 'falseNotesPer10Min', op: '<=', value: 1, label: 'False notes per 10 min' },
    { metric: 'coreRecall', op: '>=', value: 0.9, label: 'Recall (dropped/wrong word, dropped line)' },
    { metric: 'latencyP50', op: '<', value: 0.5, label: 'Alert latency p50, s (meaningful at --patience 0)' },
  ],
  'director-far-field': FAR,
  'director-far-field-hard': FAR,
};
```

Rename `checkTargets`'s first parameter from `room` to `condition`.

`harness/src/evaluate.ts`: replace the file body (keep the imports, adjusted) with:

```ts
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
```

`harness/src/cli-args.ts`: add `modes` and `seedFrom` to `EvaluateOptions` and its parsing:

```ts
import type { Mode } from './evaluate';
// EvaluateOptions gains:
  modes: Mode[];
  seedFrom: number;
// parseEvaluateOptions' values parameter gains:  modes: string; 'seed-from': string;
// and before the return:
  const modes = [...new Set(values.modes.split(',').map((m) => m.trim()).filter(Boolean))];
  if (!modes.length) throw new Error('--modes needs at least one mode');
  for (const m of modes) if (m !== 'solo' && m !== 'director') throw new Error(`Unknown mode "${m}". Known: solo, director`);
  if (!/^\d+$/.test(values['seed-from']) || Number(values['seed-from']) < 1) {
    throw new Error(`--seed-from must be a positive integer, got "${values['seed-from']}"`);
  }
// and in the returned object:
    modes: modes as Mode[],
    seedFrom: Number(values['seed-from']),
```

`harness/src/cli.ts`:
- Add `modes: { type: 'string', default: 'solo,director' }` and `'seed-from': { type: 'string', default: '1' }` to `runEvaluate`'s `parseArgs` options.
- Pass `modes: opts.modes, seedFrom: opts.seedFrom` in the `evaluate` config.
- Change `onRun` to log ``${condition}${character ? ` ${character}` : ''} ${sceneId} #${seed}: …``.
- In `USAGE`, add:

```
      --modes <a,b>             solo | director, default solo,director
      --seed-from <n>           first seed, default 1 (tuning 1–10, held-out gate 11–30)
```

- [ ] **Step 4: Update the analysis scripts.**
- In `harness/scripts/{similarity-whatif,metric-caveats,false-note-table,label-outcomes,false-note-causes}.ts`, replace every `r.room` / `run.room` used as a grouping key with `r.condition` / `run.condition`.
- In `harness/scripts/oracle-eval.ts`, add `modes: ['solo', 'director'], seedFrom: 1,` to the `evaluate` config.
- In `harness/scripts/trace-run.ts`, add the same two fields wherever it builds an `EvalConfig`. If it takes a room argument, accept a condition name (`solo-close-mic`) instead, and for solo add a fourth argument for the character.

Then run:

```bash
grep -rn "\.room\b\|'close-mic'\|'far-field'" harness/scripts
```

Expected: only `rooms: [...]` config literals and `room` passed to `applyRoom` remain.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green (the typecheck covers `harness/scripts`).

- [ ] **Step 6: Commit**

```bash
git add harness/src harness/test harness/scripts
git commit -m "feat(harness): solo condition, mode-room conditions, seed ranges, flags and transcripts in run records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Step 0 exit — repeatability check, baseline, results doc

No code changes. This task runs the real models; they must already be fetched (`npm run harness -- fetch-models`).

**Files:**
- Modify: `harness/baselines/baseline.json`
- Create: `docs/engine-pass-results.md`

- [ ] **Step 1: Repeatability check.** Run the same small configuration twice; both runs share the TTS cache.

```bash
npm run harness -- evaluate --scenes earnest-act1 --seeds 2 --modes solo,director --rooms close-mic --out harness/out/s0-repeat-a
npm run harness -- evaluate --scenes earnest-act1 --seeds 2 --modes solo,director --rooms close-mic --out harness/out/s0-repeat-b
node -e "const a=require('./harness/out/s0-repeat-a/report.json').conditions,b=require('./harness/out/s0-repeat-b/report.json').conditions;const strip=o=>JSON.stringify(o,(k,v)=>k==='rtfMean'?undefined:v);console.log(strip(a)===strip(b)?'IDENTICAL':'DIFFERENT')"
```

Expected: `IDENTICAL`. `rtfMean` is wall-clock and is excluded.
- If the result is `DIFFERENT`, stop and investigate before going on (`systematic-debugging`).
- Likely causes: a renderer path that bypasses `cachedTts`, or recognizer state leaking between runs. `makeRecognizer` must call `reset()`.

- [ ] **Step 2: Tuning-set run** (diagnosis only; results are not reported as pass/fail):

```bash
npm run harness -- evaluate --seeds 10 --modes solo,director --rooms close-mic,far-field,far-field-hard --out harness/out/s0-tune
```

- [ ] **Step 3: Held-out gate runs**, at the default Patience and at Patience 0 for latency:

```bash
npm run harness -- evaluate --seed-from 11 --seeds 20 --modes solo,director --rooms close-mic,far-field,far-field-hard --out harness/out/s0-gate
npm run harness -- evaluate --seed-from 11 --seeds 20 --modes solo --rooms close-mic --patience 0 --out harness/out/s0-gate-p0
```

These are long runs (expect roughly 30–90 min each on first render, much less once the cache is warm). Run them in the background and wait on the process.

- [ ] **Step 4: Make the default-Patience gate run the baseline**

```bash
npm run harness -- baseline --report harness/out/s0-gate/report.json
```

- [ ] **Step 5: Write `docs/engine-pass-results.md`**, with this structure:

```markdown
# DASMA — Engine-Change Pass Results

Spec: docs/superpowers/specs/2026-10-10-engine-pass-design.md · Numbers are per machine (TTS audio is cached per machine).

## Step 0 — baseline (engine unchanged since M1)

Config: scenes all · held-out seeds 11–30 · error rate 0.35 · benign rate 0.2 · model zipformer-en-2023-06-21.
Repeatability: two identical runs gave identical conditions (rtf excluded).

### solo-close-mic (the M3 gate)
| Target | Patience | Value | Required | Result |
|---|---|---|---|---|
| False alerts per 10 min | 0.5 | … | ≤ 1 | … |
| False notes per 10 min | 0.5 | … | ≤ 1 | … |
| Core recall | 0.5 | … | ≥ 0.90 | … |
| Alert latency p50 | 0 | … | < 0.5 s | … |

### Director conditions (tracked)
| Condition | False alerts / scene | False notes / scene | Core recall |
|---|---|---|---|
| director-close-mic | … | … | … |
| director-far-field | … | … | … |
| director-far-field-hard | … | … | … |

### Where the solo false alarms come from (tuning seeds 1–10)
<output of: npx tsx harness/scripts/false-note-causes.ts harness/out/s0-tune/runs.json, solo-close-mic rows>
```

Fill every `…` from `harness/out/s0-gate/report.md` and `harness/out/s0-gate-p0/report.md`.

- [ ] **Step 6: Commit**

```bash
git add harness/baselines/baseline.json docs/engine-pass-results.md
git commit -m "docs(engine-pass): step 0 baseline on held-out seeds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Round 1 — Engine changes

Test helpers used below, all existing:
- `packages/align/test/helpers/dsl.ts`: `heard(text, opts)` builds 0.3 s words with 0.05 s gaps; `|` is a 1 s pause. `runScenario(lines, words, opts)` feeds words on a 0.1 s clock and returns `{ events, lineNotes, flags, types, expected }`.
- `packages/align/test/helpers/fixtures.ts`: `EARNEST` (L1–L5; word indices L1 0–7, L2 8–15, L3 16–26, L4 27–36, L5 37–38), `LONG_SCENE` (L1–L15) and `textOf(id, lines?)`.

### Task 7: Normalization — accents, symbols, abbreviations, split and joined recognizer words

**Files:**
- Modify: `packages/align/src/normalize.ts` (`normalizeToken`), `packages/align/src/expected.ts` (`buildExpected`), `packages/align/src/aligner.ts` (`handleToken`, plus two helpers)
- Test: `packages/align/test/normalize.test.ts`, `packages/align/test/aligner.test.ts`

**Interfaces:**
- Produces: `normalizeToken(raw: string, next?: string): string[]`, where `next` is the following raw token, used only to read "St" as saint or street.
- No public aligner API change.

- [ ] **Step 1: Write the failing normalize tests.** Append to `packages/align/test/normalize.test.ts`:

```ts
describe('normalizeToken: accents, symbols, abbreviations', () => {
  it('folds accents', () => {
    expect(normalizeToken('café')).toEqual(['cafe']);
    expect(normalizeToken('naïve')).toEqual(['naive']);
    expect(normalizeToken('Zoë')).toEqual(['zoe']);
  });

  it('reads dollars and percent', () => {
    expect(normalizeToken('$5')).toEqual(['five', 'dollars']);
    expect(normalizeToken('$1')).toEqual(['one', 'dollar']);
    expect(normalizeToken('$5.50')).toEqual(['five', 'dollars', 'fifty']);
    expect(normalizeToken('10%')).toEqual(['ten', 'percent']);
  });

  it('expands Mr, Mrs and Dr', () => {
    expect(normalizeToken('Mr.')).toEqual(['mister']);
    expect(normalizeToken('Mrs')).toEqual(['missus']);
    expect(normalizeToken('Dr.')).toEqual(['doctor']);
  });

  it('reads St as saint before a capitalized word, otherwise street', () => {
    expect(normalizeToken('St.', 'Paul')).toEqual(['saint']);
    expect(normalizeToken('St.', 'and')).toEqual(['street']);
    expect(normalizeToken('St.')).toEqual(['street']);
  });
});
```

- [ ] **Step 2: Write the failing aligner tests.** Add to `packages/align/test/aligner.test.ts`. Add `LONG_SCENE` to the fixtures import, and add the helper below the existing `perf`:

```ts
const perfLong = (...ids: string[]) => ids.map((id) => textOf(id, LONG_SCENE)).join(' ');
const NOR: ScriptLineInput[] = [{ id: 'N1', characterId: 'JULIET', text: 'It is nor hand, nor foot, nor arm, nor face.' }];

describe('aligner: recognizer word boundaries and abbreviations', () => {
  it.each([0, 0.5])('rejoins a word the recognizer split ("any one" for "Anyone", patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'any one can play accurately, but I play with wonderful expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('keeps two heard words apart when the script has them as two words (Review Focus 2)', () => {
    const ANY: ScriptLineInput[] = [
      { id: 'A1', characterId: 'X', text: 'Pick any one card you like.' },
      { id: 'A2', characterId: 'Y', text: 'Anyone can do that.' },
    ];
    const r = runScenario(ANY, heard('Pick any one card you like. Anyone can do that.'), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it.each([0, 0.5])('splits a heard word that runs one script word into the next ("norhan", patience %s)', (patience) => {
    const r = runScenario(NOR, heard('It is norhan nor foot nor arm nor face'), { patience });
    expect(r.lineNotes).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  it('does not split a real different word that merely starts the same ("normal")', () => {
    const r = runScenario(NOR, heard('It is normal nor foot nor arm nor face'), P0);
    expect(r.lineNotes.length).toBeGreaterThan(0);
  });

  it('reads "Mr." in the script as "mister"', () => {
    const l10 = textOf('L10', LONG_SCENE).replace('Mr.', 'mister');
    const text = [perfLong('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'), l10, perfLong('L11')].join(' ');
    expect(runScenario(LONG_SCENE, heard(text), P0).lineNotes).toEqual([]);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run packages/align/test/normalize.test.ts packages/align/test/aligner.test.ts`
Expected: FAIL. A probe while planning showed today's engine gives:
- "any one": an added-words "any" note plus a wrong-words "Anyone→one" note;
- "norhan": a dropped-words note that alerts;
- "Mr.": a wrong-words "Mr→mister" note.

- [ ] **Step 4: Implement normalization.** In `packages/align/src/normalize.ts`, add above `normalizeToken`:

```ts
const ABBREVIATIONS: Record<string, string> = { mr: 'mister', mrs: 'missus', dr: 'doctor' };
```

Replace the first two lines of `normalizeToken` and its signature:

```ts
/** `next` is the following raw token, used only to read "St" as saint (before a capitalized name) or street. */
export function normalizeToken(raw: string, next?: string): string[] {
  const lowered = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\$(\d[\d,]*)/g, (_, n: string) => ` ${n} ${n === '1' ? 'dollar' : 'dollars'} `)
    .replace(/(\d)\s*%/g, '$1 percent');
  const cleaned = lowered.replace(/(\d),(?=\d{3}(?!\d))/g, '$1').replace(/[^a-z0-9' ]+/g, ' ');
```

Inside the `for (const piece …)` loop, right after `if (!part) continue;`, add:

```ts
    if (Object.hasOwn(ABBREVIATIONS, part)) {
      out.push(ABBREVIATIONS[part]!);
      continue;
    }
    if (part === 'st') {
      out.push(next !== undefined && /^[A-Z]/.test(next) ? 'saint' : 'street');
      continue;
    }
```

In `packages/align/src/expected.ts` `buildExpected`, pass the next raw token:

```ts
    tokenize(line.text).forEach((raw, wordInLine, all) => {
      const overlap = ranges.some(([s, e]) => wordInLine >= s && wordInLine < e);
      for (const n of normalizeToken(raw, all[wordInLine + 1])) {
```

- [ ] **Step 5: Implement split and rejoin in the aligner.** In `packages/align/src/aligner.ts`:
- Import `phoneticKey` from `./phonetic` alongside `MATCH_THRESHOLD, wordScore`.
- Add a constant near the others: `const REJOIN_GAP_SEC = 0.3;`
- Inside `createAligner`, after `windowAt`, add:

```ts
  /** "any one" heard for a scripted "anyone" (pass spec §5.5); never when the first word alone is scripted here. */
  function rejoin(a: HeardToken, b: HeardToken): HeardToken | null {
    if (b.start - a.end > REJOIN_GAP_SEC) return null;
    const norm = a.norm + b.norm;
    const win = windowAt();
    const j = win.findIndex((w) => w.norm === norm);
    if (j < 0 || win.slice(0, j + 1).some((w) => wordScore(a, w) >= MATCH_THRESHOLD)) return null;
    return { text: `${a.text}${b.text}`, norm, phon: phoneticKey(norm), start: a.start, end: b.end, confidence: Math.min(a.confidence, b.confidence) };
  }

  /** "norhan" heard for a scripted "nor hand" (pass spec §5.1): one script word run into the start of the next. */
  function split(tok: HeardToken): HeardToken[] | null {
    const win = windowAt();
    if (win.some((w) => wordScore(tok, w) >= MATCH_THRESHOLD)) return null;
    for (let k = 0; k + 1 < win.length; k++) {
      const a = win[k]!;
      const b = win[k + 1]!;
      if (!tok.norm.startsWith(a.norm)) continue;
      const rest = tok.norm.slice(a.norm.length);
      if (rest.length < 2 || !(b.norm.startsWith(rest) || phoneticKey(rest)[0] === b.phon[0])) continue;
      const mid = tok.start + (tok.end - tok.start) * (a.norm.length / tok.norm.length);
      return [
        { ...tok, norm: a.norm, phon: a.phon, end: mid },
        { ...tok, norm: b.norm, phon: b.phon, start: mid },
      ];
    }
    return null;
  }
```

In `handleToken`, replace the tail, from `H.push(tok);` to the end of the function, with:

```ts
    if (lost) {
      H.push(tok);
      if (H.length > LOST_BUFFER) H.shift();
      tryReanchor(tok.end);
      return;
    }
    for (const piece of split(tok) ?? [tok]) {
      if (lost) {
        H.push(piece);
        tryReanchor(piece.end);
        continue;
      }
      const last = H.at(-1);
      const joined = last ? rejoin(last, piece) : null;
      if (joined) H[H.length - 1] = joined;
      else H.push(piece);
      step(piece.end, false);
    }
```

- [ ] **Step 6: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS, including the noise property tests.

- [ ] **Step 7: Full checks, then commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add packages/align/src/normalize.ts packages/align/src/expected.ts packages/align/src/aligner.ts packages/align/test/normalize.test.ts packages/align/test/aligner.test.ts
git commit -m "feat(align): fold accents, read \$/%/Mr/Mrs/Dr/St, split and rejoin recognizer word boundaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sound-alikes must also agree in letters

**Files:**
- Modify: `packages/align/src/phonetic.ts` (`wordScore`)
- Test: `packages/align/test/phonetic.test.ts`, `packages/align/test/aligner.test.ts`

**Interfaces:**
- Produces: `SOUND_ALIKE_MAX_LETTER_DISTANCE = 0.4` (exported constant). The `wordScore` signature is unchanged.

- [ ] **Step 1: Write the failing tests.** In `packages/align/test/phonetic.test.ts`, inside `describe('wordScore')`:

```ts
  it('needs the letters to broadly agree too: sorry is not a sound-alike of sir', () => {
    expect(wordScore(w('sorry'), w('sir'))).toBeLessThan(MATCH_THRESHOLD);
    expect(wordScore(w('sir'), w('sorry'))).toBeLessThan(MATCH_THRESHOLD);
    expect(wordScore(w('sore'), w('sir'))).toBeLessThan(MATCH_THRESHOLD);
  });

  it('still accepts true homophones and near spellings', () => {
    for (const [a, b] of [['night', 'knight'], ['there', 'their'], ['sur', 'sir'], ['piece', 'peace']]) {
      expect(wordScore(w(a!), w(b!)), `${a}/${b}`).toBe(0.9);
    }
  });
```

In `packages/align/test/aligner.test.ts`, inside `describe('aligner: line errors')`:

```ts
  it('"Yes, sorry" for "Yes, sir" is a wrong word, not a sound-alike match', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1', 'L2', 'L3', 'L4')} Yes, sorry.`), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'wrong-words', expected: 'sir', heard: 'sorry', status: 'note' })]);
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/align/test/phonetic.test.ts packages/align/test/aligner.test.ts`
Expected: FAIL. `wordScore(sorry, sir)` is 0.9, and the aligner gives no notes.

- [ ] **Step 3: Implement.** In `packages/align/src/phonetic.ts`:

```ts
/** A sound-alike counts as a match only if the spellings are also close: normalized letter edit distance ≤ this. */
export const SOUND_ALIKE_MAX_LETTER_DISTANCE = 0.4;

const letters = (norm: string) => norm.replace(/[^a-z]/g, '');

export function wordScore(h: Scorable, e: Scorable): number {
  if (h.norm === e.norm) return 1;
  const [hp, hs] = h.phon;
  const [ep, es] = e.phon;
  const soundAlike = hp === ep || hp === es || hs === ep;
  const hl = letters(h.norm);
  const el = letters(e.norm);
  if (soundAlike && Math.min(hl.length, el.length) >= 3 && levenshtein(hl, el) / Math.max(hl.length, el.length) <= SOUND_ALIKE_MAX_LETTER_DISTANCE) {
    return 0.9;
  }
  const len = Math.max(hp.length, ep.length, 1);
  return Math.max(0, 0.6 * (1 - levenshtein(hp, ep) / len));
}
```

Remove the now-unused `letterCount` helper.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS. This includes `accepts homophones` (night/knight), the noise property tests (vowel mutations stay within distance 0.4), and the 85%-detection test.

- [ ] **Step 5: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src/phonetic.ts packages/align/test/phonetic.test.ts packages/align/test/aligner.test.ts
git commit -m "fix(align): a sound-alike match also needs close spelling (sir is not sorry)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Note metadata, heard-confidence floor, per-pair similarity downgrade

**Files:**
- Modify: `packages/align/src/classify.ts` (`ClassifyContext`, `Classified`, `makeNote`, `add`, every `add(…)` call site, `classifyBlock`), `packages/align/src/types.ts` (`AlignOptions`, `DEFAULT_ALIGN_OPTIONS`), `packages/align/src/aligner.ts` (pass the floor into `classifyOps`), `packages/align/src/index.ts` (export `NoteMeta`)
- Test: `packages/align/test/classify.test.ts`

**Interfaces:**
- Produces:
  - `interface NoteMeta { from: number; to: number; quiet: boolean }`. `from` and `to` are inclusive indices into the `ops` passed to `classifyOps`, spanning the ops the note came from. `quiet: true` means the note may never alert (set in Task 10).
  - `Classified.meta: Map<NoteDraft, NoteMeta>`
  - `ClassifyContext.heardConfidenceFloor: number`
  - `AlignOptions.heardConfidenceFloor: number` (default 0)
  - `SIMILAR_CONFIDENT = 0.8` (exported)
  - `makeNote(category, words, heard, ctx: { audioQuality: number; noteMin: number; at: number; heardConfidenceFloor?: number }, owner, opts?: { factor?: number; cap?: number })`

- [ ] **Step 1: Update the test helper and write the failing tests.** In `packages/align/test/classify.test.ts`:

```ts
// classify() helper: add an option to override individual heard words' confidence, and the new context field.
function classify(
  heardText: string,
  opts: {
    lines?: ScriptLineInput[];
    strictness?: Strictness;
    heardOpts?: HeardOptions;
    confidenceAt?: Record<number, number>;
    ctx?: Partial<ClassifyContext>;
  } = {},
) {
  const strictness = opts.strictness ?? WP;
  const expected = buildExpected(opts.lines ?? EARNEST, strictness);
  const words = heard(heardText, opts.heardOpts).map((w, k) =>
    opts.confidenceAt?.[k] !== undefined ? { ...w, confidence: opts.confidenceAt[k]! } : w,
  );
  const toks = toHeardTokens(words, strictness);
  const ops = alignWindow(toks, expected);
  const result = classifyOps(ops, {
    expected,
    heard: toks,
    recentMatched: [],
    lastHeardEndBefore: -Infinity,
    strictness,
    audioQuality: 1,
    lineWordCount: countCheckedWords(expected),
    noteMin: 0.5,
    at: 0,
    started: false,
    heardConfidenceFloor: 0,
    ...opts.ctx,
  });
  return { ...result, ops };
}
const wordCount = (text: string) => heard(text).length;
```

Change the first test, `finds nothing in a perfect run`, to:

```ts
  it('finds nothing in a perfect run', () => {
    const r = classify(perf('L1', 'L2', 'L3', 'L4', 'L5'));
    expect(r.notes).toEqual([]);
    expect(r.stumbles).toEqual([]);
  });
```

Add:

```ts
describe('classifyOps: note metadata and confidence', () => {
  it('records which ops each note came from', () => {
    const r = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '));
    const m = r.meta.get(r.notes[0]!)!;
    expect(m.quiet).toBe(false);
    expect(r.ops[m.from]).toMatchObject({ kind: 'sub' });
    expect(m.to).toBe(m.from);
  });

  it('a heard-confidence floor softens the penalty on content words only', () => {
    const content = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), {
      heardOpts: { confidence: 0.5 },
      ctx: { heardConfidenceFloor: 0.6 },
    });
    expect(content.notes).toEqual([expect.objectContaining({ category: 'wrong-words', status: 'note', confidence: 0.68 })]);
    const fn = classify(['Did you hear what a was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '), {
      heardOpts: { confidence: 0.5 },
      ctx: { heardConfidenceFloor: 0.6 },
    });
    expect(fn.notes.length).toBeGreaterThan(0);
    expect(fn.notes.every((n) => n.status === 'check')).toBe(true);
  });

  it('the default floor (0) keeps the full penalty: today’s behaviour', () => {
    const r = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { heardOpts: { confidence: 0.5 } });
    expect(r.notes).toEqual([expect.objectContaining({ status: 'check', confidence: 0.425 })]);
  });

  it('a misheard function word no longer downgrades a real wrong word beside it (per-pair similarity)', () => {
    // "I don't" → "a dreadful": "a"/"I" sounds alike (unsure, 0.6), "dreadful"/"don't" does not (confident, 0.97).
    const before = wordCount([perf('L1', 'L2'), "I'm sorry for that, for your sake."].join(' '));
    const r = classify([perf('L1', 'L2'), "I'm sorry for that, for your sake. a dreadful play accurately.", perf('L4', 'L5')].join(' '), {
      confidenceAt: { [before]: 0.6, [before + 1]: 0.97 },
    });
    expect(r.notes).toEqual([expect.objectContaining({ lineId: 'L3', category: 'wrong-words', status: 'note' })]);
  });

  it('a similar-sounding substitution is downgraded only when the recognizer was unsure of it', () => {
    const at = wordCount(perf('L1', 'L2', 'L3', 'L4')) + 1; // the word after "Yes"
    const text = `${perf('L1', 'L2', 'L3', 'L4')} Yes, sore.`;
    expect(classify(text, { confidenceAt: { [at]: 0.95 } }).notes).toEqual([expect.objectContaining({ heard: 'sore', status: 'note' })]);
    expect(classify(text, { confidenceAt: { [at]: 0.6 } }).notes).toEqual([expect.objectContaining({ heard: 'sore', status: 'check' })]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/align/test/classify.test.ts`
Expected: FAIL. `meta` is undefined; `heardConfidenceFloor` is unknown; the per-pair test gives a check (0.40) instead of a note.

- [ ] **Step 3: Implement in `packages/align/src/classify.ts`.**

Types and constants:

```ts
export interface ClassifyContext {
  // …existing fields…
  /** Floor of the heard-confidence multiplier for notes with a content word (pass spec §5.3); 0 = full penalty. */
  heardConfidenceFloor: number;
}

export interface NoteMeta {
  /** Inclusive op indices (into the ops passed to classifyOps) this note came from. */
  from: number;
  to: number;
  /** Never raise an alert for this note (e.g. a single dropped content word). */
  quiet: boolean;
}

export interface Classified {
  notes: NoteDraft[];
  stumbles: Array<{ idx: number; heard: string }>;
  meta: Map<NoteDraft, NoteMeta>;
}

/** A similar-sounding substitution heard at least this confidently is not treated as a likely mishearing. */
export const SIMILAR_CONFIDENT = 0.8;

type SubOp = Extract<Op, { kind: 'sub' }>;
type DelOp = Extract<Op, { kind: 'del' }>;
```

`makeNote`:

```ts
export function makeNote(
  category: Category,
  words: ExpectedWord[],
  heard: HeardToken[],
  ctx: { audioQuality: number; noteMin: number; at: number; heardConfidenceFloor?: number },
  owner: { lineId: string; characterId: string },
  opts: { factor?: number; cap?: number } = {},
): NoteDraft {
  let c = BASE_CONFIDENCE[category] * (opts.factor ?? 1);
  const norms = [...words.map((w) => w.norm), ...heard.map((t) => t.norm)];
  const functionOnly = norms.length > 0 && norms.every((n) => FUNCTION_WORDS.has(n));
  if (heard.length) {
    const mean = heard.reduce((s, t) => s + t.confidence, 0) / heard.length;
    const floor = functionOnly ? 0 : (ctx.heardConfidenceFloor ?? 0);
    c *= floor + (1 - floor) * mean;
  }
  if (functionOnly) c *= 0.5;
  const confidence = round3(Math.min(opts.cap ?? 1, Math.max(0, c * ctx.audioQuality)));
  return {
    lineId: owner.lineId,
    characterId: owner.characterId,
    category,
    expected: displayExpected(words),
    heard: displayHeard(heard),
    confidence,
    status: confidence >= ctx.noteMin ? 'note' : 'check',
    at: ctx.at,
  };
}
```

In `classifyOps`, declare `const meta = new Map<NoteDraft, NoteMeta>();` next to `notes`, and replace `add` with:

```ts
  const add = (
    category: Category,
    words: ExpectedWord[],
    heard: HeardToken[],
    owner: { lineId: string; characterId: string },
    span: [number, number],
    opts: { factor?: number; cap?: number; quiet?: boolean } = {},
  ) => {
    if (lenient && WORD_LEVEL_CATEGORIES.has(category)) {
      const norms = [...words.map((w) => w.norm), ...heard.map((t) => t.norm)];
      if (norms.length && norms.every((n) => FUNCTION_WORDS.has(n))) return;
    }
    const note = makeNote(category, words, heard, ctx, owner, opts);
    notes.push(note);
    meta.set(note, { from: span[0], to: span[1], quiet: opts.quiet ?? false });
  };
```

Give every call site its span:
- **Contractions:** `add('wrong-words', pair.words, pair.heard, e, [Math.min(i, pair.other), Math.max(i, pair.other)], { cap: CONTRACTION_CAP });`
- **Transposition, deleted and re-inserted:** `add('transposed', span.filter(hasE).map((o) => E(o.e)), span.filter(hasH).map((o) => H(o.h)), E(da.e), [Math.min(a, b), Math.max(a, b)]);`
- **Transposition, swapped subs:** `add('transposed', [E(x.e), E(y.e)], [H(x.h), H(y.h)], E(x.e), [a, a + 1]);`
- **Added words:** `if (owner) add('added-words', [], toks, owner, [i, j - 1], { factor: toks.length >= 4 ? 0.5 : 1 });`

Replace `classifyBlock` with the index-carrying version:

```ts
  const classifyBlock = (i: number, j: number): void => {
    const idx = Array.from({ length: j - i }, (_, k) => i + k);
    const subs = idx.filter((k) => ops[k]!.kind === 'sub' && E((ops[k] as SubOp).e).zone === 'checked');
    for (const group of groupBy(subs, (k) => E((ops[k] as SubOp).e).lineId)) {
      const pairs = group.map((k) => ops[k] as SubOp);
      // Per pair (pass spec §5.4): a similar-sounding pair is a likely mishearing only when the recognizer was unsure of it.
      const factor =
        pairs.reduce((s, o) => s + (o.score >= SIMILAR_SUB_SCORE && H(o.h).confidence < SIMILAR_CONFIDENT ? 0.6 : 1), 0) / pairs.length;
      add('wrong-words', pairs.map((o) => E(o.e)), pairs.map((o) => H(o.h)), E(pairs[0]!.e), [group[0]!, group.at(-1)!], { factor });
    }
    const dels = idx.filter((k) => ops[k]!.kind === 'del' && E((ops[k] as DelOp).e).zone === 'checked');
    const whole: Array<{ words: ExpectedWord[]; span: [number, number] }> = [];
    for (const group of groupBy(dels, (k) => E((ops[k] as DelOp).e).lineId)) {
      const words = group.map((k) => E((ops[k] as DelOp).e));
      const span: [number, number] = [group[0]!, group.at(-1)!];
      if (words.length === ctx.lineWordCount.get(words[0]!.lineId)) whole.push({ words, span });
      else add('dropped-words', words, [], words[0]!, span);
    }
    if (!whole.length) return;
    const nextMatch = ops.slice(j).find(isMatch);
    const prevH = ops.slice(0, i).reverse().find(hasH);
    const prevEnd = prevH ? H(prevH.h).end : ctx.lastHeardEndBefore;
    const gap = nextMatch ? H(nextMatch.h).start - prevEnd : Infinity;
    const nextWord = nextMatch ? E(nextMatch.e) : undefined;
    const others = whole.filter((w) => w.words[0]!.characterId !== nextWord?.characterId);
    if (nextWord && gap < JUMP_GAP_SEC && others.length) {
      add('jumped-cue', others.flatMap((w) => w.words), [], nextWord, [i, j - 1]);
      for (const w of whole) if (w.words[0]!.characterId === nextWord.characterId) add('dropped-line', w.words, [], w.words[0]!, w.span);
    } else {
      for (const w of whole) add('dropped-line', w.words, [], w.words[0]!, w.span);
    }
  };
```

Return `{ notes, stumbles, meta }`.

`packages/align/src/types.ts`: add `heardConfidenceFloor: number;` to `AlignOptions` with the doc comment `/** Pass spec §5.3: floor of the heard-confidence multiplier for content-word notes (0 = full penalty). */`, and `heardConfidenceFloor: 0,` to `DEFAULT_ALIGN_OPTIONS`.

`packages/align/src/aligner.ts` in `commit`: add `heardConfidenceFloor: options.heardConfidenceFloor,` to the `classifyOps` context object.

`packages/align/src/index.ts`: export the type `NoteMeta` alongside the existing exports from `./classify`. If `classify` is not re-exported, add `export type { NoteMeta } from './classify';`.

Check for other `makeNote` callers:

```bash
grep -rn "makeNote(" packages/align/src
```

Expected: only `classify.ts`. If `finalize-line.ts` calls it, it keeps working, because `heardConfidenceFloor` is optional.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS. The existing `low recognizer confidence turns a note into a check` test (0.425) is unchanged, because the default floor is 0.

- [ ] **Step 5: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src packages/align/test/classify.test.ts
git commit -m "feat(align): note metadata, tunable heard-confidence floor, per-pair similarity downgrade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Evidence-based dropped-word confidence; a single dropped content word never alerts

**Files:**
- Modify: `packages/align/src/classify.ts` (`classifyBlock` dropped-words branch, plus a helper), `packages/align/src/aligner.ts` (`commit` honours `meta.quiet`)
- Test: `packages/align/test/classify.test.ts`, `packages/align/test/aligner.test.ts`

**Interfaces:**
- Consumes: `NoteMeta`, `add(…, span, opts)` (Task 9).
- Produces: `BUSY_FACTOR = 0.6` (exported); `dropped-words` notes carry `quiet: true` when they have fewer than 2 content words.

- [ ] **Step 1: Write the failing tests.** In `packages/align/test/classify.test.ts`:

```ts
describe('classifyOps: dropped words', () => {
  const DROP_SAKE = [perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ');

  it('follows the confidence of the heard words around the gap', () => {
    expect(classify(DROP_SAKE).notes).toEqual([expect.objectContaining({ category: 'dropped-words', status: 'note', confidence: 0.8 })]);
    expect(classify(DROP_SAKE, { heardOpts: { confidence: 0.5 } }).notes).toEqual([
      expect.objectContaining({ category: 'dropped-words', status: 'check', confidence: 0.4 }),
    ]);
  });

  it('is less believable next to another mismatch', () => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with marvellous.', perf('L5')].join(' ');
    const del = classify(text).notes.find((n) => n.category === 'dropped-words')!;
    expect(del).toMatchObject({ status: 'check', confidence: 0.48 });
  });

  it('a dropped run with fewer than 2 content words is quiet (never alerts)', () => {
    const r = classify(DROP_SAKE); // "for your sake": one content word
    expect(r.meta.get(r.notes[0]!)!.quiet).toBe(true);
  });

  it('a dropped run with 2+ content words may alert', () => {
    const r = classify([perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with.', perf('L5')].join(' '));
    const del = r.notes.find((n) => n.category === 'dropped-words')!;
    expect(del.expected).toBe('wonderful expression');
    expect(r.meta.get(del)!.quiet).toBe(false);
  });
});
```

In `packages/align/test/aligner.test.ts`, inside `describe('aligner: line errors')`:

```ts
  it('a single dropped content word is noted but does not buzz', () => {
    const r = runScenario(EARNEST, heard([perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ category: 'dropped-words', status: 'note' })]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  it('two dropped content words buzz', () => {
    const r = runScenario(EARNEST, heard([perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with.', perf('L5')].join(' ')), P0);
    expect(r.flags.filter((f) => f.alert)).toEqual([expect.objectContaining({ note: expect.objectContaining({ category: 'dropped-words' }) })]);
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/align/test/classify.test.ts packages/align/test/aligner.test.ts`
Expected: FAIL. The deletion confidence is a flat 0.8, and the single dropped word alerts.

- [ ] **Step 3: Implement.** In `packages/align/src/classify.ts`, add `export const BUSY_FACTOR = 0.6;` near the constants. Inside `classifyOps`, before `classifyBlock`:

```ts
  /** Pass spec §5.1: a deletion is only as believable as the recognizer was sure of the words around it. */
  const deletionEvidence = (from: number, to: number): number => {
    const near: number[] = [];
    for (let k = from - 1, n = 0; k >= 0 && n < 2; k--) {
      const o = ops[k]!;
      if (o.kind === 'match') {
        near.push(H(o.h).confidence);
        n++;
      }
    }
    for (let k = to + 1, n = 0; k < ops.length && n < 2; k++) {
      const o = ops[k]!;
      if (o.kind === 'match') {
        near.push(H(o.h).confidence);
        n++;
      }
    }
    const neighbour = near.length ? near.reduce((s, x) => s + x, 0) / near.length : 1;
    const busy = [from - 2, from - 1, to + 1, to + 2].some((k) => k >= 0 && k < ops.length && ops[k]!.kind !== 'match');
    return neighbour * (busy ? BUSY_FACTOR : 1);
  };
```

In `classifyBlock`, replace `else add('dropped-words', words, [], words[0]!, span);` with:

```ts
      else {
        const content = words.filter((w) => !FUNCTION_WORDS.has(w.norm)).length;
        add('dropped-words', words, [], words[0]!, span, { factor: deletionEvidence(span[0], span[1]), quiet: content < 2 });
      }
```

In `packages/align/src/aligner.ts` `commit`, change the destructure to `const { notes, stumbles, meta } = classifyOps(abs, {…})`. In the `for (const note of notes)` loop, use:

```ts
      const quiet = meta.get(note)?.quiet ?? false;
      emit({ type: 'flag', note, alert: !quiet && !deferred && note.status === 'note' && note.confidence >= options.alertMinConfidence, at });
```

- [ ] **Step 4: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS. The `dropped words` tests in aligner and classify still expect `status: 'note'` (0.8 with confidence-1 neighbours) and pass.

- [ ] **Step 5: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src/classify.ts packages/align/src/aligner.ts packages/align/test/classify.test.ts packages/align/test/aligner.test.ts
git commit -m "feat(align): dropped-word confidence from neighbouring evidence; single dropped words never alert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Audio-quality meter, wired into the harness; `--heard-floor`

**Files:**
- Create: `packages/asr/src/quality.ts`
- Modify: `packages/asr/src/index.ts`, `harness/src/run-engine.ts`, `harness/src/evaluate.ts` (`EvalConfig.heardConfidenceFloor`), `harness/src/cli-args.ts`, `harness/src/cli.ts`, `harness/scripts/oracle-eval.ts` (config field)
- Test: `packages/asr/test/quality.test.ts`, `harness/test/run-engine.test.ts`, `harness/test/cli-args.test.ts`, `harness/test/evaluate.test.ts` (config gains the field)

**Interfaces:**
- Produces:
  - `class AudioQualityMeter { constructor(opts?: { windowSec?: number }); push(words: HeardWord[]): void; value(): number }`
  - `EvalConfig.heardConfidenceFloor: number`
  - `EvaluateOptions.heardConfidenceFloor: number`
  - CLI `--heard-floor <0..1>` (default 0)

- [ ] **Step 1: Write the failing tests.** `packages/asr/test/quality.test.ts`:

```ts
import type { HeardWord } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { AudioQualityMeter } from '../src/quality';

const w = (end: number, confidence: number): HeardWord => ({ text: 'x', start: end - 0.3, end, confidence, final: true });

describe('AudioQualityMeter', () => {
  it('is 1 before any words', () => {
    expect(new AudioQualityMeter().value()).toBe(1);
  });

  it('maps mean word confidence over the window to [0.6, 1]', () => {
    const hi = new AudioQualityMeter();
    hi.push([w(1, 0.9), w(2, 0.9)]);
    expect(hi.value()).toBe(1);
    const lo = new AudioQualityMeter();
    lo.push([w(1, 0.2)]);
    expect(lo.value()).toBe(0.6);
    const mid = new AudioQualityMeter();
    mid.push([w(1, 0.6), w(2, 0.7)]);
    expect(mid.value()).toBeCloseTo(0.7);
  });

  it('forgets words older than the window', () => {
    const m = new AudioQualityMeter({ windowSec: 10 });
    m.push([w(1, 0.2)]);
    m.push([w(20, 0.9)]);
    expect(m.value()).toBe(1);
  });
});
```

`harness/test/run-engine.test.ts`:

```ts
  it('feeds audio quality from the recognizer’s word confidence into the aligner', () => {
    const at = (c: number) => words('one two three four five six seven eight elephant ten').map((w) => ({ ...w, confidence: c }));
    const confidenceOf = (c: number) => {
      const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(at(c)), expected, options);
      const flag = run.events.find(({ event }) => event.type === 'flag')!.event;
      return flag.type === 'flag' ? flag.note.confidence : NaN;
    };
    // Without the meter, confidence scales only with heard confidence: 0.85 × 0.55 = 0.4675. The meter adds × 0.6.
    expect(confidenceOf(0.55)).toBeCloseTo(0.85 * 0.55 * 0.6, 3);
    expect(confidenceOf(0.95)).toBeCloseTo(0.85 * 0.95, 3);
  });
```

`harness/test/cli-args.test.ts`:
- Add `'heard-floor': '0'` to `base`.
- Add `heardConfidenceFloor: 0` to the defaults expectation.
- Add `'heard-floor'` to the `it.each([...])` list of unit-interval flags.

`harness/test/evaluate.test.ts`: add `heardConfidenceFloor: 0,` to `config`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/asr/test/quality.test.ts harness/test/run-engine.test.ts harness/test/cli-args.test.ts`
Expected: FAIL (missing module and option).

- [ ] **Step 3: Implement.** `packages/asr/src/quality.ts`:

```ts
import type { HeardWord } from '@dasma/align';

/**
 * Pass spec §5.2: an audio-quality factor for Aligner.setAudioQuality, from the recognizer's own word confidence over
 * the last `windowSec` seconds. clamp((mean − 0.3) / 0.5, 0.6, 1); 1 before any words.
 */
export class AudioQualityMeter {
  private readonly windowSec: number;
  private words: HeardWord[] = [];

  constructor(opts: { windowSec?: number } = {}) {
    this.windowSec = opts.windowSec ?? 10;
  }

  push(words: HeardWord[]): void {
    this.words.push(...words);
    const latest = this.words.at(-1)?.end ?? 0;
    this.words = this.words.filter((w) => w.end >= latest - this.windowSec);
  }

  value(): number {
    if (!this.words.length) return 1;
    const mean = this.words.reduce((s, w) => s + w.confidence, 0) / this.words.length;
    return Math.min(1, Math.max(0.6, (mean - 0.3) / 0.5));
  }
}
```

`packages/asr/src/index.ts`: add `export { AudioQualityMeter } from './quality';`.

`harness/src/run-engine.ts`:

```ts
import { AudioQualityMeter, type Recognizer } from '@dasma/asr';
// in runEngine:
  const meter = new AudioQualityMeter();
  const off = recognizer.onWords((words) => {
    heard.push(...words);
    meter.push(words);
    aligner.setAudioQuality(meter.value());
    aligner.push(words);
  });
```

`harness/src/evaluate.ts`:
- Add `heardConfidenceFloor: number;` to `EvalConfig`, with the comment `/** AlignOptions.heardConfidenceFloor (pass spec §5.3). */`.
- Build options as `{ ...DEFAULT_ALIGN_OPTIONS, patience: config.patience, strictness: config.strictness, heardConfidenceFloor: config.heardConfidenceFloor }`.

`harness/src/cli-args.ts`:
- Add `heardConfidenceFloor: number` to `EvaluateOptions` and `'heard-floor': string` to the values parameter.
- Return `heardConfidenceFloor: unitInterval('heard-floor', values['heard-floor'])`.

`harness/src/cli.ts`:
- Add the option `'heard-floor': { type: 'string', default: '0' }` and pass `heardConfidenceFloor: opts.heardConfidenceFloor`.
- Add the usage line `      --heard-floor <0..1>      heard-confidence floor for content words, default 0`.

`harness/scripts/oracle-eval.ts`: add `heardConfidenceFloor: 0,` to its config.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/asr/src/quality.ts packages/asr/src/index.ts packages/asr/test/quality.test.ts harness/src harness/test harness/scripts/oracle-eval.ts
git commit -m "feat(asr,harness): audio-quality meter from word confidence; --heard-floor option

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Alerts only when anchored, with deferred alerts

**Files:**
- Modify: `packages/align/src/aligner.ts` (`commit`, `resetFrom`, `enterLost`, `finalize`, `jumpTo`, plus new helpers), `packages/align/src/types.ts` (doc comment on the `flag` event)
- Test: `packages/align/test/aligner.test.ts`

**Interfaces:**
- Consumes: `NoteMeta.from/to/quiet` (Tasks 9–10).
- Produces: `AlignEvent` `flag` semantics. A note may be flagged twice: first with `alert: false`, then once with `alert: true` when the script position is confirmed after it. The event shape is unchanged.

- [ ] **Step 1: Write the failing tests.** In `packages/align/test/aligner.test.ts`:

```ts
describe('aligner: anchored alerts (pass spec §6.1)', () => {
  it('chatter that shares a word with the next line raises no alert (M1 oracle earnest #6)', () => {
    const text = `${perf('L1', 'L2')} | Sorry sorry can we take that bit again from just before the entrance please | ${perf('L3', 'L4', 'L5')}`;
    for (const patience of [0, 0.5]) {
      const r = runScenario(EARNEST, heard(text), { patience });
      expect(r.flags.filter((f) => f.alert), `patience ${patience}`).toEqual([]);
    }
  });

  it('a wrong word mid-line alerts at once', () => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play beautifully, but I play with wonderful expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    const flags = r.flags.filter((f) => f.note.lineId === 'L4');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.alert).toBe(true);
  });

  it('a wrong first word waits until three correct words follow, then alerts once', () => {
    const text = [perf('L1', 'L2'), "Truly sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    const alertAt = r.events.flatMap((e, k) => (e.type === 'flag' && e.alert ? [k] : []));
    expect(alertAt).toHaveLength(1);
    const thirdMatched = r.events.findIndex((e) => e.type === 'matched' && e.idx === 19); // "that" in L3
    expect(alertAt[0]).toBeGreaterThan(thirdMatched);
    expect(r.flags.filter((f) => f.note.lineId === 'L3').map((f) => f.alert)).toEqual([false, true]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/align/test/aligner.test.ts`
Expected: FAIL. A planning probe showed the chatter case gives 3 alerts at Patience 0 (`I'm→sorry`, `→can`, `→take`), and the first-word case alerts immediately.

- [ ] **Step 3: Implement in `packages/align/src/aligner.ts`.**

Module-level helper:

```ts
const consecutive = (idxs: number[]): boolean =>
  idxs.length === ANCHOR_WORDS && idxs.every((x, k) => k === 0 || x === idxs[k - 1]! + 1);
```

Inside `createAligner`, add state next to the others:

```ts
  /** Alert-eligible notes waiting for the script position to be confirmed after them (pass spec §6.1). */
  let waiting: Array<{ note: NoteDraft; afterIdx: number }> = [];
```

Add helpers:

```ts
  /** Mid-line: the 3 matches right before the flagged ops are consecutive and the last is on the note's own line. */
  function anchoredBefore(ops: Op[], from: number, before: ExpectedWord[], lineId: string): boolean {
    const prev = [...before, ...ops.slice(0, from).filter(isMatch).map((o) => expected[o.e]!)].slice(-ANCHOR_WORDS);
    return consecutive(prev.map((w) => w.idx)) && prev.at(-1)!.lineId === lineId;
  }

  /** The last script index a note's ops touch (for insertion-only notes, the last match before them). */
  function regionEnd(ops: Op[], from: number, to: number): number {
    let end = -1;
    for (let k = 0; k <= to; k++) {
      const o = ops[k]!;
      if (hasE(o) && (k >= from || o.kind === 'match')) end = Math.max(end, o.e);
    }
    return end >= 0 ? end : cursor - 1;
  }

  function releaseWaiting(at: number): void {
    const last = recentMatched.map((w) => w.idx);
    if (!waiting.length || !consecutive(last)) return;
    const ready = waiting.filter((w) => last[0]! > w.afterIdx);
    if (!ready.length) return;
    waiting = waiting.filter((w) => !ready.includes(w));
    for (const w of ready) emit({ type: 'flag', note: w.note, alert: true, at });
  }
```

In `commit`:
- Capture `const before = recentMatched;` as the **first line**, before the ops loop mutates it.
- Replace the note loop with:

```ts
    for (const note of notes) {
      lines.get(note.lineId)?.notes.push(note);
      const m = meta.get(note)!;
      // Lenient mode forgives word-level slips once the line is mostly right, which is only known at line end,
      // so a live alert for a word-level note could never be retracted: leave those to the finalized line notes.
      const deferredToLineEnd = options.strictness.mode === 'lenient' && WORD_LEVEL_CATEGORIES.has(note.category);
      const eligible = !m.quiet && !deferredToLineEnd && note.status === 'note' && note.confidence >= options.alertMinConfidence;
      const after = abs.slice(m.to + 1).filter(isMatch).slice(0, ANCHOR_WORDS).map((o) => o.e);
      const anchored = anchoredBefore(abs, m.from, before, note.lineId) || consecutive(after);
      emit({ type: 'flag', note, alert: eligible && anchored, at });
      if (eligible && !anchored) waiting.push({ note, afterIdx: regionEnd(abs, m.from, m.to) });
    }
```

- After the stumble loop, and before the `H` slicing, call `releaseWaiting(at);`.

Drop waiting notes, as pass spec §6.1 requires:
- `resetFrom(idx)`, at the end: `waiting = waiting.filter((w) => lineLast.get(w.note.lineId)! < idx);`
- `enterLost`: `waiting = [];`
- `jumpTo`: `waiting = [];`
- `finalize`: `waiting = [];` after the final `step`.

In `packages/align/src/types.ts`, extend the `flag` event's doc comment:

```ts
  /**
   * A note may be flagged twice: first with alert false, then once more with alert true when the script position is
   * confirmed after it (pass spec §6.1). Consumers count alerts from flags with alert true.
   */
  | { type: 'flag'; note: NoteDraft; alert: boolean; at: number }
```

- [ ] **Step 4: Update the existing instant-Patience test.** Its wrong word is now a line-end case in Task 15, so give it a mid-line wrong word. Replace `instant patience flags a wrong word as soon as the next word confirms it` with:

```ts
  it('instant patience flags a mid-line wrong word as soon as the next word confirms it', () => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play beautifully, but I play with wonderful expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience: 0 });
    const flagAt = r.events.findIndex((e) => e.type === 'flag');
    const butMatchedAt = r.events.findIndex((e) => e.type === 'matched' && e.idx === 31); // "but" in L4
    expect(flagAt).toBeGreaterThan(-1);
    expect(r.events[flagAt]).toMatchObject({ alert: true });
    expect(flagAt).toBeGreaterThan(butMatchedAt);
    expect(r.events.findIndex((e) => e.type === 'matched' && e.idx === 32)).toBeGreaterThan(flagAt);
  });
```

The commit message must say: the test was changed because Task 15 gives line-end wrong words a two-word confirmation.

- [ ] **Step 5: Run and confirm everything passes**

Run: `npx vitest run packages/align && npx vitest run harness/test/run-engine.test.ts`
Expected: PASS.
- `wrong word (patience %s)`: "expression" is mid-line-anchored by "play with wonderful", so there is still exactly 1 flag and it alerts.
- `run-engine` `stamps flags…`: "elephant" is anchored by "six seven eight".

- [ ] **Step 6: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src/aligner.ts packages/align/src/types.ts packages/align/test/aligner.test.ts
git commit -m "feat(align): alert only when anchored; line-start errors alert once three correct words follow

Changes 'instant patience flags a wrong word…' to a mid-line wrong word: line-end wrong
words get a two-word confirmation in the next task.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Off-script talk becomes "check"

**Files:**
- Create: `packages/align/src/off-script.ts`
- Modify: `packages/align/src/aligner.ts` (heard-token marks, `commit`, plus a downgrade helper)
- Test: `packages/align/test/off-script.test.ts`, `packages/align/test/aligner.test.ts`

**Interfaces:**
- Produces (off-script.ts):
  - `interface HeardMark { start: number; end: number; matched: boolean }`
  - `OFF_SCRIPT_MIN_RUN = 4`, `OFF_SCRIPT_MAX_MATCHES = 1`, `OFF_SCRIPT_MAX_GAP_SEC = 1.0`
  - `offScriptSpans(marks: HeardMark[]): Array<[number, number]>` returns merged time spans covered by off-script runs.
  - `insideAny(spans: Array<[number, number]>, start: number, end: number): boolean`
- Consumes: `NoteMeta`, `waiting` (Task 12).

- [ ] **Step 1: Write the failing unit tests.** `packages/align/test/off-script.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { insideAny, offScriptSpans, type HeardMark } from '../src/off-script';

const marks = (pattern: string, gap = 0.05): HeardMark[] => {
  // "m" = matched word, "x" = unmatched word, "|" = a 2 s pause before the next word.
  const out: HeardMark[] = [];
  let t = 0;
  for (const c of pattern) {
    if (c === '|') {
      t += 2;
      continue;
    }
    out.push({ start: t, end: t + 0.3, matched: c === 'm' });
    t += 0.3 + gap;
  }
  return out;
};

describe('offScriptSpans', () => {
  it('finds 4+ consecutive heard words with at most one match', () => {
    const m = marks('mmmxxxxmmm');
    expect(offScriptSpans(m)).toEqual([[m[3]!.start, m[6]!.end]]);
    expect(offScriptSpans(marks('mmmxmxxmmm'))).toHaveLength(1);
  });

  it('ignores short runs and runs with two matches', () => {
    expect(offScriptSpans(marks('mmmxxxmmm'))).toEqual([]);
    expect(offScriptSpans(marks('mmxmxmxmm'))).toEqual([]);
  });

  it('a pause longer than 1 s breaks a run', () => {
    expect(offScriptSpans(marks('mmxx|xxmm'))).toEqual([]);
  });

  it('merges overlapping windows into one span', () => {
    const m = marks('xxxxxxx');
    expect(offScriptSpans(m)).toEqual([[m[0]!.start, m[6]!.end]]);
  });

  it('insideAny needs the whole interval inside one span', () => {
    expect(insideAny([[1, 3]], 1.5, 2.5)).toBe(true);
    expect(insideAny([[1, 3]], 0.5, 2.5)).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing aligner tests.** Add to `packages/align/test/aligner.test.ts`:

```ts
describe('aligner: off-script talk (pass spec §6.2)', () => {
  it('a chatter tail attached to the end of a line is a check, not a note', () => {
    const text = `${perf('L1', 'L2', 'L3')} okay hold on can we play that again from just before the entrance please | ${perf('L4', 'L5')}`;
    for (const patience of [0, 0.5]) {
      const r = runScenario(EARNEST, heard(text), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([]);
      expect(r.flags.filter((f) => f.alert), `patience ${patience}`).toEqual([]);
    }
  });

  // Guard (passes before and after): an actor's aside followed by a restart of the line produces no notes.
  it('an aside and restart produce no notes', () => {
    const text = `${perf('L1', 'L2')} I'm sorry for that, wait, sorry, let me go again. ${perf('L3', 'L4', 'L5')}`;
    for (const patience of [0, 0.5]) {
      const r = runScenario(EARNEST, heard(text), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([]);
    }
  });
});
```

The existing `paraphrase (patience %s)` test must stay green. Paraphrase is decided in `finalizeLine` from line resolution, which this task does not touch.

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run packages/align/test/off-script.test.ts packages/align/test/aligner.test.ts`
Expected: FAIL. The module is missing, and the chatter tail gives an `added-words "okay hold"` note that alerts at Patience 0 (seen in a planning probe).

- [ ] **Step 4: Implement** `packages/align/src/off-script.ts`:

```ts
/** A heard token once resolved: committed (matched or not) or discarded while lost / re-anchoring. */
export interface HeardMark {
  start: number;
  end: number;
  matched: boolean;
}

export const OFF_SCRIPT_MIN_RUN = 4;
export const OFF_SCRIPT_MAX_MATCHES = 1;
export const OFF_SCRIPT_MAX_GAP_SEC = 1.0;

/**
 * Pass spec §6.2: time spans of off-script talk — at least OFF_SCRIPT_MIN_RUN consecutive heard words with at most
 * OFF_SCRIPT_MAX_MATCHES script matches among them, no gap between words longer than OFF_SCRIPT_MAX_GAP_SEC.
 */
export function offScriptSpans(marks: HeardMark[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i + OFF_SCRIPT_MIN_RUN <= marks.length; i++) {
    let matches = 0;
    let ok = true;
    for (let k = i; k < i + OFF_SCRIPT_MIN_RUN; k++) {
      if (k > i && marks[k]!.start - marks[k - 1]!.end > OFF_SCRIPT_MAX_GAP_SEC) {
        ok = false;
        break;
      }
      if (marks[k]!.matched) matches++;
    }
    if (!ok || matches > OFF_SCRIPT_MAX_MATCHES) continue;
    const start = marks[i]!.start;
    const end = marks[i + OFF_SCRIPT_MIN_RUN - 1]!.end;
    const last = spans.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  return spans;
}

export function insideAny(spans: Array<[number, number]>, start: number, end: number): boolean {
  return spans.some(([s, e]) => start >= s && end <= e);
}
```

- [ ] **Step 5: Wire it into `packages/align/src/aligner.ts`.**

Imports: `import { insideAny, offScriptSpans, type HeardMark } from './off-script';`.

State inside `createAligner`:

```ts
  /** Every heard token the aligner has taken in, in order; H is always a suffix of this list (pass spec §6.2). */
  const marks: HeardMark[] = [];
  const markOf = new Map<HeardToken, HeardMark>();
  /** Heard-time span of each note that has heard words, for downgrading earlier notes once a run turns out off-script. */
  const noteTimes = new Map<NoteDraft, [number, number]>();
  const MAX_MARKS = 64;

  function track(tok: HeardToken): void {
    const mark: HeardMark = { start: tok.start, end: tok.end, matched: false };
    marks.push(mark);
    markOf.set(tok, mark);
    if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS);
  }
```

(`markOf` entries for trimmed marks are harmless: they are only ever looked up for tokens still in `H`.)

In `handleToken` (Task 7's version), call `track(…)` everywhere a token is pushed into `H`:
- In the lost branch: `H.push(tok); track(tok);`
- In the piece loop's lost branch: `H.push(piece); track(piece);`
- In the normal path's `else H.push(piece);`, which becomes `else { H.push(piece); track(piece); }`.
- When `rejoin` replaces `H`'s last token, carry its mark over:

```ts
      if (joined) {
        const mark = markOf.get(last!)!;
        mark.end = joined.end;
        markOf.set(joined, mark);
        H[H.length - 1] = joined;
      }
```

In `commit`, restructure the order. The ops loop already runs first; inside it, for a `match` op, also mark the heard token:

```ts
        if (op.kind === 'match') {
          const mark = markOf.get(H[op.h]!);
          if (mark) mark.matched = true;
          // …existing match handling…
        }
```

After the ops loop and **before** the note loop, compute the off-script spans over the resolved marks. Every mark except the tokens still pending in `H` after this commit counts as resolved:

```ts
    const pendingAfter = maxH >= 0 ? H.length - (maxH + 1) : H.length;
    const spans = offScriptSpans(marks.slice(0, Math.max(0, marks.length - pendingAfter)));
```

In the note loop (Task 12's version), at its top, downgrade a note whose heard words all fall inside an off-script span:

```ts
    for (const raw of notes) {
      const m = meta.get(raw)!;
      const toks = abs.slice(m.from, m.to + 1).filter(hasH).map((o) => H[o.h]!);
      const time: [number, number] | null = toks.length ? [toks[0]!.start, toks.at(-1)!.end] : null;
      const offScript = time !== null && insideAny(spans, time[0], time[1]);
      const note: NoteDraft = offScript && raw.status === 'note' ? { ...raw, status: 'check' } : raw;
      if (time) noteTimes.set(note, time);
      lines.get(note.lineId)?.notes.push(note);
      // …Task 12's eligibility/anchoring lines, with `eligible` additionally requiring !offScript…
```

`eligible` becomes `!offScript && !m.quiet && !deferredToLineEnd && note.status === 'note' && note.confidence >= options.alertMinConfidence`.

After the note loop and before `releaseWaiting(at)`, downgrade earlier notes that the new spans now cover:

```ts
    downgradeOffScript(spans, at);
```

with the helper:

```ts
  /** Earlier notes whose heard words now turn out to sit inside off-script talk become checks (pass spec §6.2). */
  function downgradeOffScript(spans: Array<[number, number]>, at: number): void {
    if (!spans.length) return;
    for (const id of lineOrder) {
      const st = lines.get(id)!;
      let changed = false;
      st.notes = st.notes.map((n) => {
        const t = noteTimes.get(n);
        if (!t || n.status !== 'note' || !insideAny(spans, t[0], t[1])) return n;
        changed = true;
        waiting = waiting.filter((w) => w.note !== n);
        const down: NoteDraft = { ...n, status: 'check' };
        noteTimes.set(down, t);
        return down;
      });
      if (changed && done.has(id)) emitLineDone(id, at);
    }
  }
```

Note: `H[o.h]` must be read before `H` is sliced at the end of `commit`. The note loop already runs before the slice.

- [ ] **Step 6: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS, including `paraphrase`, `off-script chatter that echoes script words…` and the noise property tests.

- [ ] **Step 7: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src/off-script.ts packages/align/src/aligner.ts packages/align/test/off-script.test.ts packages/align/test/aligner.test.ts
git commit -m "feat(align): notes inside off-script talk become checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Safer backward jumps

**Files:**
- Modify: `packages/align/src/aligner.ts` (`tryReanchor`, `resetFrom`, `emitLineDone`, `markSkipped`, `checkLinesDone`, `commit`)
- Test: `packages/align/test/aligner.test.ts`

**Interfaces:**
- No public change. Internally: `snapshots: Map<lineId, LineSnapshot>` and `lastDone: Map<lineId, NoteDraft[]>`.

- [ ] **Step 1: Write the failing tests.** Add to `packages/align/test/aligner.test.ts`:

```ts
describe('aligner: backward jumps (pass spec §6.3)', () => {
  const quoting = (quote: string) => `${perfLong('L1', 'L2', 'L3', 'L4', 'L5')} | Go back to ${quote} please | ${perfLong('L6', 'L7')}`;

  it.each([0, 0.5])('a director quoting a finished line does not wipe it (M1 final-review probe, patience %s)', (patience) => {
    const r = runScenario(LONG_SCENE, heard(quoting('what I was playing')), { patience });
    expect(r.lineNotes.filter((n) => n.status === 'note')).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  // A 5-word quote does confirm a jump back (trigram + 2 words). Once the run moves on, the skipped lines get their
  // earlier results back. Known residual, measured by the harness's quoting chatter: at Patience 0 the 0.4 s timeout can
  // commit the trailing "please" as an added word on the quoted line before the run moves on.
  it('a longer quote that confirms a jump back still restores the lines it skipped (patience 0.5)', () => {
    const r = runScenario(LONG_SCENE, heard(quoting('what I was playing Lane')), { patience: 0.5 });
    expect(r.lineNotes.filter((n) => n.status === 'note')).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  it('a real restart two lines back still re-runs those lines', () => {
    const r = runScenario(LONG_SCENE, heard(perfLong('L1', 'L2', 'L3', 'L4', 'L2', 'L3', 'L4', 'L5', 'L6')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('reanchored');
  });

  // Review Focus 3 (guard): the run ends right after a confirmed jump back; later lines keep their earlier results.
  it('a confirmed jump back followed by the end of the run leaves no dropped lines', () => {
    const r = runScenario(LONG_SCENE, heard(`${perfLong('L1', 'L2', 'L3', 'L4', 'L5')} | Did you hear what I was playing`), P0);
    const final = new Map<string, unknown[]>();
    for (const e of r.events) if (e.type === 'lineDone') final.set(e.lineId, e.notes);
    for (const id of ['L2', 'L3', 'L4', 'L5']) expect(final.get(id), id).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/align/test/aligner.test.ts`
Expected: FAIL on the quoting test. A planning probe showed today's engine gives 3–4 false alerts and 4–5 false notes per quote: dropped-line L3 and L4, wrong-words "Lane→please" and others.

- [ ] **Step 3: Implement in `packages/align/src/aligner.ts`.**

State:

```ts
  interface LineSnapshot {
    resolution: Map<number, 'matched' | 'sub' | 'del'>;
    notes: NoteDraft[];
    heard: HeardToken[];
    /** The notes of the line's last lineDone, if it had finished before the jump. */
    final: NoteDraft[] | null;
  }
  /** Lines reset by a backward jump that the redo has not reached yet (pass spec §6.3). */
  const snapshots = new Map<string, LineSnapshot>();
  const lastDone = new Map<string, NoteDraft[]>();
```

`emitLineDone`:

```ts
  function emitLineDone(id: string, at: number): void {
    done.add(id);
    const snap = snapshots.get(id);
    if (snap) {
      // A backward jump reset this line, but the redo never reached it: it keeps its earlier result.
      snapshots.delete(id);
      const st = lines.get(id)!;
      st.resolution = new Map(snap.resolution);
      st.notes = [...snap.notes];
      st.heard = [...snap.heard];
      if (snap.final) {
        lastDone.set(id, snap.final);
        emit({ type: 'lineDone', lineId: id, notes: snap.final, at });
        return;
      }
    }
    const notes = finalizeLine(lines.get(id)!, {
      strictness: options.strictness,
      audioQuality,
      noteMin: options.noteMinConfidence,
      at,
    });
    lastDone.set(id, notes);
    emit({ type: 'lineDone', lineId: id, notes, at });
  }
```

`resetFrom` snapshots every touched line before clearing it:

```ts
  function resetFrom(idx: number): void {
    for (const id of lineOrder) {
      if (lineLast.get(id)! < idx) continue;
      const st = lines.get(id)!;
      const touched = st.resolution.size > 0 || st.notes.length > 0;
      if (touched && !snapshots.has(id)) {
        snapshots.set(id, {
          resolution: new Map(st.resolution),
          notes: [...st.notes],
          heard: [...st.heard],
          final: done.has(id) ? (lastDone.get(id) ?? []) : null,
        });
      }
      st.resolution.clear();
      st.notes = [];
      st.heard = [];
      done.delete(id);
    }
    recentMatched = [];
    waiting = waiting.filter((w) => lineLast.get(w.note.lineId)! < idx);
  }
```

In `commit`'s ops loop, a match means the redo reached that line, so its new result stands:

```ts
        if (op.kind === 'match') {
          snapshots.delete(w.lineId);
          // …existing…
        }
```

In `commit`'s note loop, as the first statement, suppress notes on lines whose earlier result will be restored:

```ts
      if (snapshots.has(raw.lineId)) continue;
```

`checkLinesDone`: a line with a snapshot counts as reached at the end of the run:

```ts
      const reached = final ? st.resolution.size > 0 || st.notes.length > 0 || snapshots.has(id) : cursor >= lineLast.get(id)! + 2;
```

`markSkipped` takes `at` and restores snapshot lines instead of silently marking them done:

```ts
  function markSkipped(from: number, to: number, at: number): void {
    for (const id of lineOrder) {
      if (lineFirst.get(id)! >= from && lineLast.get(id)! < to) {
        if (snapshots.has(id)) emitLineDone(id, at);
        else done.add(id);
      }
    }
  }
```

Update both callers: `markSkipped(cursor, c, at)` in `anchorAt`, and `markSkipped(cursor, target, at)` in `jumpTo`.

`tryReanchor`: a backward candidate needs the same confirmation as a forward one. Replace the `if (c > cursor) { … }` block with:

```ts
    if (c !== cursor) {
      // A jump either way is only trusted once the words after the trigram match too: a director quoting an earlier
      // line, or stray talk echoing three script words, must not move the cursor (pass spec §6.3).
      const need = Math.min(FORWARD_CONFIRM_WORDS, expected.length - (c + ANCHOR_WORDS));
      if (need > 0) {
        pending = { c, confirmed: 0, need };
        return;
      }
    }
    anchorAt(c, ANCHOR_WORDS, at);
```

`finalize` and `jumpTo`: keep `snapshots`, which `checkLinesDone(…, true)` resolves at the end of the run. In `jumpTo`, after `checkLinesDone(at, false)`, nothing more is needed.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS, including the existing `going back to an earlier line is a restart` and `after a restart, lines are completed again (the last lineDone per line wins)`. A restart now costs two extra words of confirmation; those tests' restarts have 8+ words.

- [ ] **Step 5: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src/aligner.ts packages/align/test/aligner.test.ts
git commit -m "fix(align): confirm backward jumps; lines the redo never reaches keep their earlier result

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Instant Patience at line boundaries — lookahead re-alignment and line-end floor

**Files:**
- Modify: `packages/align/src/aligner.ts` (`step`, plus two helpers)
- Test: `packages/align/test/aligner.test.ts`

**Interfaces:** no public change.

- [ ] **Step 1: Write the failing tests.** Add to `packages/align/test/aligner.test.ts`:

```ts
describe('aligner: instant patience at line boundaries (pass spec §6.4)', () => {
  it('a skipped line is a jumped cue at patience 0, exactly as at 0.5', () => {
    const text = perfLong('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L9', 'L10');
    for (const patience of [0, 0.5]) {
      const r = runScenario(LONG_SCENE, heard(text), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([
        expect.objectContaining({ lineId: 'L9', category: 'jumped-cue' }),
      ]);
      expect(r.flags.filter((f) => f.alert && f.note.lineId === 'L8'), `patience ${patience}`).toEqual([]);
    }
  });

  it('a wrong word in a line’s last two words is confirmed by two words at patience 0', () => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), P0);
    const flagAt = r.events.findIndex((e) => e.type === 'flag');
    expect(flagAt).toBeGreaterThan(r.events.findIndex((e) => e.type === 'matched' && e.idx === 38));
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/align/test/aligner.test.ts`
Expected: FAIL.
- **Skipped line:** a planning probe showed Patience 0 gives wrong-words "And, speaking of→yes sir oh", a dropped-words note that alerts, an added "by" and more, while 0.5 gives only the jumped cue.
- **Line end:** the flag fires before `sir` (idx 38) is matched.

- [ ] **Step 3: Implement in `packages/align/src/aligner.ts`.**

```ts
  /** Shift an op aligned against H.slice(hOff) and expected.slice(cursor + eOff) back into window coordinates. */
  const shiftOp = (o: Op, hOff: number, eOff: number): Op =>
    o.kind === 'ins' ? { ...o, h: o.h + hOff } : o.kind === 'del' ? { ...o, e: o.e + eOff } : { ...o, h: o.h + hOff, e: o.e + eOff };

  /**
   * Pass spec §6.4: if the last block of mismatches before the confirming matches is really the opening of one of the
   * next two lines, rebuild the ops so the words up to that line are skipped and the heard words align from it.
   */
  function realignToNextLine(ops: Op[]): Op[] {
    let k = ops.length - 1;
    while (k >= 0 && ops[k]!.kind === 'match') k--;
    let b = k;
    while (b >= 0 && ops[b]!.kind !== 'match') b--;
    const block = ops.slice(b + 1, k + 1);
    if (!block.some((o) => o.kind === 'sub')) return ops;
    const firstH = block.find(hasH)?.h;
    const firstE = block.find(hasE)?.e;
    if (firstH === undefined || firstE === undefined) return ops;
    const blockToks = block.filter(hasH).map((o) => H[o.h]!);
    if (blockToks.length < 2) return ops;
    const lineIdx = lineOrder.indexOf(expected[cursor + firstE]!.lineId);
    for (const id of lineOrder.slice(lineIdx + 1, lineIdx + 3)) {
      const s = lineFirst.get(id)!;
      if (s - cursor >= options.windowSize) break;
      if (!blockToks.every((t, n) => expected[s + n] !== undefined && wordScore(t, expected[s + n]!) >= MATCH_THRESHOLD)) continue;
      const dels: Op[] = [];
      for (let e = cursor + firstE; e < s; e++) dels.push({ kind: 'del', e: e - cursor });
      const rest = alignWindow(H.slice(firstH), expected.slice(s, s + options.windowSize)).map((o) => shiftOp(o, firstH, s - cursor));
      return [...ops.slice(0, b + 1), ...dels, ...rest];
    }
    return ops;
  }

  /** Pass spec §6.4: a mismatch touching one of a line's last 2 words needs at least 2 confirming words. */
  function touchesLineEnd(ops: Op[], end: number): boolean {
    for (let k = 0; k <= end; k++) {
      const o = ops[k]!;
      if (o.kind === 'match' || !hasE(o)) continue;
      const w = expected[cursor + o.e];
      if (w && lineLast.get(w.lineId)! - w.idx < 2) return true;
    }
    return false;
  }
```

In `step`, replace the first two lines with:

```ts
    const ops = realignToNextLine(alignWindow(H, windowAt()));
    let end = timeout ? commitPointOnTimeout(ops) : commitPoint(ops, confirmWords);
    if (!timeout && confirmWords < 2 && end >= 0 && touchesLineEnd(ops, end)) end = commitPoint(ops, 2);
```

The rest of `step` (the pre-roll guard and `commit(ops.slice(0, end + 1), at)`) is unchanged.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npx vitest run packages/align`
Expected: PASS. `wrong word (patience 0)` still has exactly one alerting flag, now fired after `sir`. The mid-line `instant patience…` test from Task 12 still fires after one word.

- [ ] **Step 5: Full checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add packages/align/src/aligner.ts packages/align/test/aligner.test.ts
git commit -m "fix(align): at instant patience, re-align a skipped line's opening and confirm line-end errors with two words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: A stabilizer measured in audio seconds; `--stable-sec`

**Files:**
- Modify: `packages/asr/src/stabilizer.ts` (rewrite), `packages/asr/src/node/node-recognizer.ts`, `harness/src/cli-args.ts`, `harness/src/cli.ts`
- Test: `packages/asr/test/stabilizer.test.ts` (rewrite), `harness/test/cli-args.test.ts`

**Interfaces:**
- Produces:
  - `class Stabilizer { constructor(opts?: { stableSec?: number }); update(words: RawWord[], endpoint: boolean, audioSec: number): HeardWord[] }`, with default `stableSec` 0.2.
  - `new NodeSherpaRecognizer(opts?: { stableSec?: number })`
  - CLI `--stable-sec <s>` (0 < s ≤ 2, default 0.2), recorded in `report.config.stableSec`.

- [ ] **Step 1: Write the failing tests.** Replace `packages/asr/test/stabilizer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Stabilizer } from '../src/stabilizer';
import type { RawWord } from '../src/types';

const w = (text: string, start: number, end = start + 0.3): RawWord => ({ text, start, end, confidence: 1 });
const texts = (xs: Array<{ text: string }>) => xs.map((x) => x.text);

describe('Stabilizer (audio time, pass spec §7.1)', () => {
  it('releases words once unchanged for stableSec of fed audio', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    expect(s.update([w('A', 0), w('B', 0.4)], false, 0.8)).toEqual([]);
    expect(s.update([w('A', 0), w('B', 0.4)], false, 0.9)).toEqual([]);
    const out = s.update([w('A', 0), w('B', 0.4)], false, 1.0);
    expect(texts(out)).toEqual(['A', 'B']);
    expect(out.every((x) => x.final)).toBe(true);
  });

  it('holds the newest word until the recognizer is stableSec past its end', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0, 0.3)], false, 0.35);
    expect(s.update([w('A', 0, 0.3)], false, 0.45)).toEqual([]);
    expect(texts(s.update([w('A', 0, 0.3)], false, 0.55))).toEqual(['A']);
  });

  it('a revised word restarts its clock', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0), w('X', 0.4)], false, 1.0);
    expect(s.update([w('A', 0), w('Y', 0.4)], false, 1.15)).toEqual([]);
    expect(texts(s.update([w('A', 0), w('Y', 0.4)], false, 1.2))).toEqual(['A']);
    expect(texts(s.update([w('A', 0), w('Y', 0.4)], false, 1.35))).toEqual(['Y']);
  });

  it('an endpoint releases everything and starts fresh', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    s.update([w('A', 0), w('B', 0.4)], false, 0.8);
    expect(texts(s.update([w('A', 0), w('B', 0.4)], true, 0.85))).toEqual(['A', 'B']);
    expect(s.update([w('C', 1.0)], false, 1.4)).toEqual([]);
    expect(texts(s.update([w('C', 1.0)], true, 1.45))).toEqual(['C']);
  });

  it('a hypothesis that shrinks never releases a stale word later (Review Focus 4)', () => {
    const s = new Stabilizer({ stableSec: 0.2 });
    expect(s.update([w('A', 0), w('B', 0.4), w('C', 0.8)], false, 1.0)).toEqual([]);
    expect(s.update([w('A', 0)], false, 1.1)).toEqual([]);
    expect(texts(s.update([w('A', 0), w('B', 0.4), w('C', 0.8)], false, 1.3))).toEqual(['A']);
  });

  it('releases the same words at the same audio times whether fed in 0.1 s or 8 ms chunks', () => {
    const script = [w('one', 0, 0.3), w('two', 0.35, 0.65), w('three', 0.7, 1.0)];
    const releases = (step: number): Array<[string, number]> => {
      const s = new Stabilizer({ stableSec: 0.2 });
      const out: Array<[string, number]> = [];
      for (let n = 1; n * step <= 2 + 1e-9; n++) {
        const t = n * step;
        const hyp = script.filter((x) => t >= x.end + 0.1); // the recognizer shows a word 0.1 s after it ends
        for (const r of s.update(hyp, false, t)) out.push([r.text, t]);
      }
      return out;
    };
    const coarse = releases(0.1);
    const fine = releases(0.008);
    expect(coarse.map(([text]) => text)).toEqual(['one', 'two', 'three']);
    expect(fine.map(([text]) => text)).toEqual(coarse.map(([text]) => text));
    for (let k = 0; k < coarse.length; k++) expect(Math.abs(coarse[k]![1] - fine[k]![1])).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});
```

In `harness/test/cli-args.test.ts`:
- Add `'stable-sec': '0.2'` to `base` and `stableSec: 0.2` to the defaults expectation.
- Add:

```ts
  it('rejects a non-positive or too-large --stable-sec', () => {
    for (const bad of ['0', '-0.1', '2.5', 'x', '']) expect(() => parse({ 'stable-sec': bad })).toThrow(/--stable-sec must be a number above 0 and at most 2/);
    expect(parse({ 'stable-sec': '0.3' }).stableSec).toBe(0.3);
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run packages/asr/test/stabilizer.test.ts harness/test/cli-args.test.ts`
Expected: FAIL (wrong constructor and `update` arity; unknown option).

- [ ] **Step 3: Implement** `packages/asr/src/stabilizer.ts`:

```ts
import type { HeardWord } from '@dasma/align';
import type { RawWord } from './types';

/**
 * Turns a recognizer's ever-changing partial hypothesis into words emitted once, when they stop changing (pass spec §7.1).
 * Stability is measured in seconds of audio fed to the recognizer, so it behaves the same whatever the chunk size
 * (0.1 s in the harness, 8 ms from a browser AudioWorklet). The newest word is also held until the recognizer has
 * processed stableSec of audio past its end, since it may still grow ("nor" → "norhan" → "nor hand").
 */
export class Stabilizer {
  private emitted = 0;
  private seen: Array<{ text: string; since: number }> = [];
  private readonly stableSec: number;

  constructor(opts: { stableSec?: number } = {}) {
    this.stableSec = opts.stableSec ?? 0.2;
  }

  update(words: RawWord[], endpoint: boolean, audioSec: number): HeardWord[] {
    // Forget positions the hypothesis no longer has, so a word that reappears starts a fresh clock.
    this.seen.length = Math.max(this.emitted, Math.min(this.seen.length, words.length));
    for (let i = this.emitted; i < words.length; i++) {
      const prev = this.seen[i];
      const text = words[i]!.text;
      if (!prev || prev.text !== text) this.seen[i] = { text, since: audioSec };
    }
    const out: HeardWord[] = [];
    while (this.emitted < words.length) {
      const i = this.emitted;
      const word = words[i]!;
      const steady = audioSec - this.seen[i]!.since >= this.stableSec;
      const settled = endpoint || (steady && (i < words.length - 1 || audioSec - word.end >= this.stableSec));
      if (!settled) break;
      out.push({ ...word, final: true });
      this.emitted++;
    }
    if (endpoint) {
      this.emitted = 0;
      this.seen = [];
    }
    return out;
  }
}
```

`packages/asr/src/node/node-recognizer.ts`:

```ts
export class NodeSherpaRecognizer implements Recognizer<ResolvedAsrModel> {
  readonly supportsHotwords = false;
  private readonly stableSec: number | undefined;
  // …
  private stabilizer: Stabilizer;

  constructor(opts: { stableSec?: number } = {}) {
    this.stableSec = opts.stableSec;
    this.stabilizer = new Stabilizer({ stableSec: this.stableSec });
  }
```

- In `reset()`: `this.stabilizer = new Stabilizer({ stableSec: this.stableSec });`
- In `collect()`: `const fresh = this.stabilizer.update(words, endpoint, this.fedSec);`

Delete the old field initializer `private stabilizer = new Stabilizer(2);`.

`harness/src/cli-args.ts`:
- Add `stableSec: number` to `EvaluateOptions` and `'stable-sec': string` to the values parameter, and parse:

```ts
  const stableSec = values['stable-sec'].trim() === '' ? Number.NaN : Number(values['stable-sec']);
  if (!Number.isFinite(stableSec) || stableSec <= 0 || stableSec > 2) {
    throw new Error(`--stable-sec must be a number above 0 and at most 2, got "${values['stable-sec']}"`);
  }
```

- Return `stableSec`.

`harness/src/cli.ts`:
- Add the option `'stable-sec': { type: 'string', default: '0.2' }`.
- Construct `new NodeSherpaRecognizer({ stableSec: opts.stableSec })`.
- After `evaluate(…)` returns, record it with `report.config.stableSec = opts.stableSec;`.
- Add the usage line `      --stable-sec <s>          stabilizer: seconds a word must stay unchanged, default 0.2`.

- [ ] **Step 4: Run and confirm everything passes**

Run: `npm test && npm run lint && npm run typecheck`
Expected: green. `node-recognizer.int.test.ts` still passes if models are present; it skips otherwise, as before.

- [ ] **Step 5: Commit**

```bash
git add packages/asr/src/stabilizer.ts packages/asr/src/node/node-recognizer.ts packages/asr/test/stabilizer.test.ts harness/src/cli-args.ts harness/src/cli.ts harness/test/cli-args.test.ts
git commit -m "feat(asr): stabilizer measured in seconds of fed audio, releasing the newest word too; --stable-sec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Round 1 — tune on seeds 1–10, measure on seeds 11–30

No new code, except changing defaults if tuning moves them. Long runs go in the background.

**Files:**
- Possibly modify: `packages/asr/src/stabilizer.ts` and `harness/src/cli.ts` (the `stableSec` default), `packages/align/src/types.ts` and `harness/src/cli.ts` (the `heardConfidenceFloor` default), `packages/align/test/noise.property.test.ts` (property run at the chosen floor)
- Modify: `docs/engine-pass-results.md`

- [ ] **Step 1: Sweep `--stable-sec` on the tuning seeds**, for solo close-mic at both Patience settings:

```bash
for s in 0.1 0.2 0.3; do
  npm run harness -- evaluate --seeds 10 --modes solo --rooms close-mic --stable-sec $s --out harness/out/r1-stable-$s
  npm run harness -- evaluate --seeds 10 --modes solo --rooms close-mic --stable-sec $s --patience 0 --out harness/out/r1-stable-$s-p0
done
```

**Rule (pass spec §7.1):** choose the smallest `s` whose `falseNotesPer10Min` at Patience 0.5 is ≤ the value at 0.3. Record a table of `s` → false notes, false alerts, core recall, latency p50 (from the p0 run).

- [ ] **Step 2: Sweep `--heard-floor` on the tuning seeds**, with the chosen `s`:

```bash
for f in 0 0.3 0.6; do
  npm run harness -- evaluate --seeds 10 --modes solo --rooms close-mic --stable-sec <s> --heard-floor $f --out harness/out/r1-floor-$f
done
```

**Rule (pass spec §5.3):** pick the `f` that passes the most of the three Patience-0.5 solo targets. Break ties by lower `falseNotesPer10Min`, then by higher `coreRecall`.

- [ ] **Step 3: Make the chosen values the defaults**, if they differ from 0.2 and 0:
- `stableSec`: change the default in `Stabilizer` (`opts.stableSec ?? <s>`) and the CLI default `'stable-sec'`. Update the `cli-args` defaults test.
- `heardConfidenceFloor`: change `DEFAULT_ALIGN_OPTIONS.heardConfidenceFloor` and the CLI default `'heard-floor'`. Update the `cli-args` defaults test.
- If `f > 0`, add to `packages/align/test/noise.property.test.ts` a copy of the `stays within budget…` property, run with `runScenario(…, { heardConfidenceFloor: f })`. If it fails its note budget, do **not** change the noise model or the budget. Mark it `it.fails(…)` with a comment that links the results doc, and report the break in the results doc (pass spec §9).
- If a default changed, run `npm test && npm run lint && npm run typecheck`, then commit:

```bash
git add -A packages harness/src harness/test
git commit -m "tune(engine): round-1 defaults from tuning seeds (stableSec <s>, heardConfidenceFloor <f>)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Held-out measurement**, never used for tuning:

```bash
npm run harness -- evaluate --seed-from 11 --seeds 20 --modes solo,director --rooms close-mic,far-field,far-field-hard --out harness/out/r1-gate
npm run harness -- evaluate --seed-from 11 --seeds 20 --modes solo --rooms close-mic --patience 0 --out harness/out/r1-gate-p0
npm run harness -- gate --report harness/out/r1-gate/report.json
```

The `gate` output compares every condition with the Step 0 baseline. A director regression is **reported, not blocking** (pass spec §1).

- [ ] **Step 5: Attribution on the tuning seeds**, for round 2's choice:

```bash
npm run harness -- evaluate --seeds 10 --modes solo,director --rooms close-mic,far-field --out harness/out/r1-tune
npx tsx harness/scripts/false-note-causes.ts harness/out/r1-tune/runs.json -v
npx tsx harness/scripts/label-outcomes.ts harness/out/r1-tune/runs.json
```

- [ ] **Step 6: Write the "Round 1" section of `docs/engine-pass-results.md`.** Use the same tables as Step 0, plus:
- the `stableSec` and `heardConfidenceFloor` sweep tables with the chosen values;
- solo targets on held-out seeds, with Step 0 → round 1 deltas;
- director conditions against baseline, with every worsening called out;
- the sound-alike detection rate (`soundAlikeRecall`);
- for each missed solo target, its top causes from Step 5;
- **Decision:** "All four solo targets pass → M3 GO; skip to Task 22", or "Targets missed: … → Round 2 (Task 18)".

- [ ] **Step 7: Commit**

```bash
git add docs/engine-pass-results.md
git commit -m "docs(engine-pass): round 1 results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Round 2 — only if a solo target is still missed after round 1

Skip Tasks 18–21 if the Task 17 decision was "M3 GO".

### Task 18: Choose round-2 items from the round-1 attribution

No code. Decide from `harness/out/r1-tune` (tuning seeds only), then record the choice and its evidence in `docs/engine-pass-results.md` under "Round 2 — selection".

- [ ] **Step 1: Apply the selection rules.** More than one item can be selected.

| Item | Select when, on solo-close-mic tuning seeds |
|---|---|
| Task 19, threshold re-tune | ≥ 1/3 of the remaining false notes, or of the missed core labels, have confidence within ±0.1 of `noteMinConfidence` (0.5) or `alertMinConfidence` (0.75) |
| Task 20, pronunciation similarity | ≥ 1/3 of the remaining false notes are substitutions whose heard word is a recognizer mishearing that scores 0.3–0.85 against the expected word, **or** ≥ 1/3 of the missed wrong-words labels (sound-alike labels included) were checks because of the similarity factor |
| Two-speed stabilizer | latency p50 is the only miss and the stabilizer accounts for most of it |

- [ ] **Step 2: If the two-speed stabilizer is selected, stop.** It needs alert retraction, which changes the `AlignEvent` contract. That is a spec change, not something to improvise inside this plan. Record this in the results doc and ask the user whether to write a spec addendum. Tasks 19–20 may still run if they were selected too.

- [ ] **Step 3: Commit the selection**

```bash
git add docs/engine-pass-results.md
git commit -m "docs(engine-pass): round 2 selection from round-1 attribution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19 (if selected): Threshold re-tune

**Files:**
- Modify: `harness/src/cli-args.ts`, `harness/src/cli.ts`, `harness/src/evaluate.ts` (pass thresholds into `AlignOptions`), `harness/scripts/oracle-eval.ts`, `packages/align/src/types.ts` (defaults, after tuning)
- Test: `harness/test/cli-args.test.ts`, `harness/test/evaluate.test.ts`

**Interfaces:**
- Produces: CLI `--note-min <0..1>` (default 0.5) and `--alert-min <0..1>` (default 0.75); `EvalConfig.noteMinConfidence` and `EvalConfig.alertMinConfidence`.

- [ ] **Step 1: Write the failing CLI test.** In `harness/test/cli-args.test.ts`:
- Add `'note-min': '0.5', 'alert-min': '0.75'` to `base`.
- Add `noteMinConfidence: 0.5, alertMinConfidence: 0.75` to the defaults expectation.
- Add `'note-min'` and `'alert-min'` to the unit-interval `it.each` list.

In `harness/test/evaluate.test.ts`, add `noteMinConfidence: 0.5, alertMinConfidence: 0.75,` to `config`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run harness/test/cli-args.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**
- `cli-args.ts`: parse both with `unitInterval('note-min', …)` and `unitInterval('alert-min', …)` into `noteMinConfidence` and `alertMinConfidence`.
- `cli.ts`: add the options with defaults `'0.5'` and `'0.75'`, pass them through, and add the usage lines.
- `evaluate.ts`: add both fields to `EvalConfig` and to the `options` object.
- `oracle-eval.ts`: add both fields with their defaults.

Run `npm test && npm run lint && npm run typecheck`, then commit:

```bash
git add harness/src harness/test harness/scripts/oracle-eval.ts
git commit -m "feat(harness): --note-min and --alert-min for threshold tuning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Sweep on the tuning seeds**, using round 1's chosen `stableSec` and floor, which are now the defaults:

```bash
for n in 0.45 0.5 0.55 0.6 0.65; do for a in 0.7 0.75 0.8 0.85 0.9; do
  npm run harness -- evaluate --seeds 10 --modes solo --rooms close-mic --note-min $n --alert-min $a --out harness/out/r2-thr-$n-$a
done; done
```

**Rule:** choose the pair passing the most of the three Patience-0.5 solo targets. Break ties by lower `falseNotesPer10Min`, then higher `coreRecall`, then the pair closest to (0.5, 0.75).

- [ ] **Step 5: Make the chosen pair the defaults**
- Set `DEFAULT_ALIGN_OPTIONS.noteMinConfidence` and `.alertMinConfidence`, and the CLI defaults.
- Run `npx vitest run packages/align`. For any test whose expectation changes only because of the new defaults (a `note` becoming a `check` or the reverse), update the expectation and name the test in the commit message. A test that changes for any other reason is a bug: investigate it.

```bash
npm test && npm run lint && npm run typecheck
git add packages/align harness/src harness/test
git commit -m "tune(align): note/alert thresholds from tuning seeds (noteMin <n>, alertMin <a>)

<list of tests whose expectations changed with the new defaults>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20 (if selected): Pronunciation-based similarity (CMUdict)

**Files:**
- Create: `packages/align/src/arpabet.ts`, `packages/align/src/phonemes.ts`, `packages/align/src/cmudict-data.ts` (generated, committed), `harness/scripts/build-cmudict.ts`
- Modify: `packages/align/src/phonetic.ts` (`wordScore`), `packages/align/src/index.ts`, `docs/superpowers/specs/2026-10-10-dasma-design.md` §13 (licence)
- Test: `packages/align/test/phonemes.test.ts`, `packages/align/test/phonetic.test.ts`

**Interfaces:**
- Produces:
  - `ARPABET: Record<string, string>` (arpabet.ts)
  - `phonemesOf(norm: string): string | null`
  - `phonemeSimilarity(a: string, b: string): number` in [0, 1] (phonemes.ts)
- Changes `wordScore`: when both words are in the dictionary, identical pronunciations (and both ≥ 3 letters) score 0.9, otherwise `0.6 × phonemeSimilarity`. When either word is missing, the double-metaphone path from Task 8 is unchanged.

- [ ] **Step 1: Create the phoneme alphabet** — `packages/align/src/arpabet.ts`:

```ts
/** ARPAbet phoneme (stress digits removed) → one code character, so a pronunciation is a short string. */
export const ARPABET: Record<string, string> = {
  AA: 'a', AE: 'b', AH: 'c', AO: 'd', AW: 'e', AY: 'f', EH: 'g', ER: 'h', EY: 'i', IH: 'j', IY: 'k', OW: 'l', OY: 'm', UH: 'n', UW: 'o',
  B: 'B', CH: 'C', D: 'D', DH: 'E', F: 'F', G: 'G', HH: 'H', JH: 'J', K: 'K', L: 'L', M: 'M', N: 'N', NG: 'O', P: 'P',
  R: 'R', S: 'S', SH: 'T', T: 'U', TH: 'V', V: 'W', W: 'X', Y: 'Y', Z: 'Z', ZH: 'Q',
};
```

Export it from `packages/align/src/index.ts`: `export { ARPABET } from './arpabet';`.

- [ ] **Step 2: Write the generator** — `harness/scripts/build-cmudict.ts`:

```ts
/**
 * Build packages/align/src/cmudict-data.ts from a local copy of CMUdict (BSD-2-Clause, Carnegie Mellon University).
 * Maintainer step, run once online; the generated module is committed so the app stays offline:
 *
 *   curl -L -o /tmp/cmudict.dict https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
 *   npx tsx harness/scripts/build-cmudict.ts /tmp/cmudict.dict
 */
import { ARPABET } from '@dasma/align';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: npx tsx harness/scripts/build-cmudict.ts <path to cmudict.dict>');
const raw = readFileSync(resolve(src), 'utf8');
const sha = createHash('sha256').update(raw).digest('hex');
const entries = new Map<string, string>();
for (const line of raw.split('\n')) {
  const body = line.split('#')[0]!.trim();
  if (!body) continue;
  const [word, ...phones] = body.split(/\s+/);
  if (!word || /\(\d+\)$/.test(word) || !/^[a-z']+$/.test(word)) continue; // first pronunciation only; plain words only
  const code = phones
    .map((p) => {
      const c = ARPABET[p.replace(/\d/g, '')];
      if (!c) throw new Error(`Unknown phoneme ${p} in "${word}"`);
      return c;
    })
    .join('');
  entries.set(word, code);
}
const data = [...entries].map(([w, c]) => `${w} ${c}`).join('\n');
const out = resolve('packages/align/src/cmudict-data.ts');
writeFileSync(
  out,
  `// Generated by harness/scripts/build-cmudict.ts — do not edit.\n` +
    `// CMUdict (BSD-2-Clause, Carnegie Mellon University). Source SHA-256 ${sha}; ${entries.size} words;\n` +
    `// one code character per ARPAbet phoneme (see arpabet.ts), stress removed.\n` +
    `export const CMUDICT = ${JSON.stringify(data)};\n`,
);
console.log(`Wrote ${out}: ${entries.size} words, ${(data.length / 1e6).toFixed(2)} MB, source sha256 ${sha}`);
```

- [ ] **Step 3: Generate the data module** (network needed once):

```bash
mkdir -p /tmp/dasma-cmudict && curl -L -o /tmp/dasma-cmudict/cmudict.dict https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
npx tsx harness/scripts/build-cmudict.ts /tmp/dasma-cmudict/cmudict.dict
```

Expected: roughly 125–135k words and ≤ 3 MB (pass spec §8). If it is larger, stop and report; do not trim the dictionary silently.

- [ ] **Step 4: Write the failing tests** — `packages/align/test/phonemes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { phonemeSimilarity, phonemesOf } from '../src/phonemes';
import { MATCH_THRESHOLD, phoneticKey, wordScore } from '../src/phonetic';

const w = (norm: string) => ({ norm, phon: phoneticKey(norm) });

describe('phonemes', () => {
  it('knows common words and returns null for unknown ones', () => {
    expect(phonemesOf('sir')).toBeTruthy();
    expect(phonemesOf("don't")).toBeTruthy();
    expect(phonemesOf('zxqvbj')).toBeNull();
  });

  it('close phonemes (voiced/unvoiced) cost less than distant ones', () => {
    const bat = phonemesOf('bat')!;
    expect(phonemeSimilarity(bat, phonemesOf('pat')!)).toBeGreaterThan(phonemeSimilarity(bat, phonemesOf('cat')!));
    expect(phonemeSimilarity(bat, bat)).toBe(1);
  });
});

describe('wordScore with pronunciations', () => {
  it('treats true homophones as matches even when spelled differently', () => {
    expect(wordScore(w('write'), w('right'))).toBe(0.9);
    expect(wordScore(w('night'), w('knight'))).toBe(0.9);
  });

  it('keeps near sound-alikes apart', () => {
    expect(wordScore(w('sorry'), w('sir'))).toBeLessThan(MATCH_THRESHOLD);
    expect(wordScore(w('accept'), w('except'))).toBeLessThan(MATCH_THRESHOLD);
  });

  it('falls back to sound keys for words not in the dictionary', () => {
    expect(wordScore(w('bracknellish'), w('bracknellish'))).toBe(1);
    expect(wordScore(w('zxqvbj'), w('zxqvbk'))).toBeGreaterThan(0);
  });
});
```

Run: `npx vitest run packages/align/test/phonemes.test.ts`
Expected: FAIL (`../src/phonemes` is missing).

- [ ] **Step 5: Implement** `packages/align/src/phonemes.ts`:

```ts
import { ARPABET } from './arpabet';
import { CMUDICT } from './cmudict-data';

let dict: Map<string, string> | null = null;

function load(): Map<string, string> {
  if (!dict) {
    dict = new Map();
    for (const line of CMUDICT.split('\n')) {
      const sp = line.indexOf(' ');
      if (sp > 0) dict.set(line.slice(0, sp), line.slice(sp + 1));
    }
  }
  return dict;
}

/** The word's pronunciation as phoneme codes (see arpabet.ts), or null if CMUdict does not have it. */
export function phonemesOf(norm: string): string | null {
  return load().get(norm) ?? null;
}

const code = (p: string) => ARPABET[p]!;
const CLOSE_CONSONANTS = [['P', 'B'], ['T', 'D'], ['K', 'G'], ['F', 'V'], ['S', 'Z'], ['SH', 'ZH'], ['CH', 'JH'], ['TH', 'DH'], ['M', 'N'], ['N', 'NG']];
const VOWEL_GROUPS = [['IY', 'IH', 'EY', 'EH', 'AE'], ['AH', 'ER', 'UH'], ['UW', 'OW', 'AO', 'AA'], ['AY', 'AW', 'OY']];
const close = new Set(CLOSE_CONSONANTS.flatMap(([a, b]) => [`${code(a!)}${code(b!)}`, `${code(b!)}${code(a!)}`]));
const vowelGroup = new Map(VOWEL_GROUPS.flatMap((g, i) => g.map((v) => [code(v), i] as const)));

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (close.has(`${a}${b}`)) return 0.5;
  const ga = vowelGroup.get(a);
  const gb = vowelGroup.get(b);
  if (ga !== undefined && gb !== undefined) return ga === gb ? 0.5 : 0.8;
  return 1;
}

/** 1 − weighted phoneme edit distance / longer length: near phonemes (p/b, neighbouring vowels) cost less (pass spec §8). */
export function phonemeSimilarity(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + substitutionCost(a[i - 1]!, b[j - 1]!));
      diag = tmp;
    }
  }
  return 1 - prev[b.length]! / Math.max(a.length, b.length, 1);
}
```

In `packages/align/src/phonetic.ts`, at the top of `wordScore` after the exact-norm check:

```ts
  const ph = phonemesOf(h.norm);
  const pe = phonemesOf(e.norm);
  if (ph !== null && pe !== null) {
    if (ph === pe && Math.min(letters(h.norm).length, letters(e.norm).length) >= 3) return 0.9;
    return 0.6 * phonemeSimilarity(ph, pe);
  }
```

Import from `./phonemes`. Export `phonemesOf` and `phonemeSimilarity` from `index.ts`.

- [ ] **Step 6: Run the whole align suite.** Tests that assert exact metaphone-derived partial scores will change, e.g. `does not treat short sound-alikes as matches (in/on)` expecting 0.6, or Task 9's `sore` similarity case.
- For each one, change it to the new phoneme-based value or to a threshold assertion.
- Name every changed test in the commit message.
- The noise property tests and the 85%-detection test must still pass unchanged.

Run: `npx vitest run packages/align`, then `npm test && npm run lint && npm run typecheck`.

- [ ] **Step 7: Licence note.** Add to MVP spec §13 (Licensing notes): "CMUdict (BSD-2-Clause, Carnegie Mellon University) is vendored as `packages/align/src/cmudict-data.ts`; the notice is in the file header."

- [ ] **Step 8: Commit**

```bash
git add packages/align/src/arpabet.ts packages/align/src/phonemes.ts packages/align/src/cmudict-data.ts packages/align/src/phonetic.ts packages/align/src/index.ts packages/align/test harness/scripts/build-cmudict.ts docs/superpowers/specs/2026-10-10-dasma-design.md
git commit -m "feat(align): pronunciation-based word similarity from CMUdict, falling back to sound keys

<list of tests whose expected scores changed>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Round 2 measurement — then stop

- [ ] **Step 1: Held-out measurement** (same commands as Task 17 Step 4, with `--out harness/out/r2-gate` and `harness/out/r2-gate-p0`), plus the gate against the baseline.
- [ ] **Step 2: Write the "Round 2" section of `docs/engine-pass-results.md`**, with the same tables as round 1 and deltas against Step 0 and round 1.
- [ ] **Step 3: Final decision.**
  - **GO** if all four solo targets pass on held-out seeds.
  - **NO-GO** otherwise. List the options for the user, for example: bring per-actor audio forward; accept a named shortfall (which target, by how much); or spec the two-speed stabilizer if latency is the miss. Do not loosen targets and do not start a third round (pass spec §1).
- [ ] **Step 4: Commit**

```bash
git add docs/engine-pass-results.md
git commit -m "docs(engine-pass): round 2 results and M3 decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Docs — sync the MVP spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-dasma-design.md` (§4.2, §7, §10, §11)
- Modify: `docs/engine-pass-results.md` (top summary)

- [ ] **Step 1: MVP spec §4.2 (key interfaces).**
- `Stabilizer`: "a word is released once unchanged for `stableSec` seconds of fed audio (default <chosen>); the newest word also needs the recognizer to be `stableSec` past its end; an endpoint releases everything".
- Add `AudioQualityMeter` (`push(words)`, `value()` ∈ [0.6, 1], trailing 10 s mean word confidence), and say the session wires it into `Aligner.setAudioQuality`.
- `AlignOptions.heardConfidenceFloor` (default <chosen>).
- The `flag` event: "a note may be flagged twice, first `alert: false`, then once `alert: true` when the script position is confirmed after it".

- [ ] **Step 2: MVP spec §7.** Add a short "Engine-change pass (2026-10)" subsection under §7.4. List each rule in one line with a pointer to pass spec §5–§6:
- accents, symbols and abbreviations;
- split and joined recognizer words;
- the letter-agreement guard;
- the heard-confidence floor;
- the per-pair similarity downgrade;
- evidence-based deletions with no alert on a single dropped word;
- anchored and deferred alerts;
- off-script runs becoming checks;
- confirmed backward jumps with snapshot restore;
- Patience-0 re-alignment and the line-end floor;
- (if Task 20 ran) pronunciation similarity.

- [ ] **Step 3: MVP spec §10.** Under the targets table, add: "Gate condition: harness `solo-close-mic` (one actor, cues as silence, no director) on held-out seeds 11–30; latency at Patience 0, the rest at 0.5. Harness conditions are `<mode>-<room>`: `solo-close-mic`, `director-far-field`, `director-far-field-hard` carry targets; others are tracked."

- [ ] **Step 4: MVP spec §11.** Add after M1: "**Engine-change pass** (pass spec): M3 starts only on GO in `docs/engine-pass-results.md`."

- [ ] **Step 5: Results summary.** At the top of `docs/engine-pass-results.md`, add a five-line summary: the decision, the four solo numbers, the chosen defaults, director changes against baseline, and the next step.

- [ ] **Step 6: Final checks, then commit**

```bash
npm test && npm run lint && npm run typecheck
git add docs/superpowers/specs/2026-10-10-dasma-design.md docs/engine-pass-results.md
git commit -m "docs: sync MVP spec with the engine-change pass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Hand off.** The controller updates the project memory note (`dasma-m1-status`) with the outcome. It then uses `superpowers:finishing-a-development-branch`; whether to merge into `main` is the user's decision.
