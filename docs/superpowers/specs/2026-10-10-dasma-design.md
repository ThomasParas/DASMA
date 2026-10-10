# DASMA — Design Spec (MVP)

**DASMA: Director's Assistant – Stage Manager App**
Date: 2026-10-10 · Status: draft for review
Companion document: [`docs/preflight-decisions.md`](../../preflight-decisions.md) — decisions D1–D21, research, competitor landscape, and sources. This spec turns those decisions into a buildable design; where they overlap, decision numbers are cited (e.g. *D14*).

---

## 1. Summary

DASMA listens to live speech through a laptop microphone and compares it, word by word, against a script the user has imported — entirely offline. It has two modes:

- **Director mode (primary):** one laptop on the director's table follows a multi-actor scene, shows a glanceable live view, prompts actors who call "Line!", and produces stage-manager-style **line notes** per actor after the run. It stands in for the stage manager "on book" when none is available.
- **Solo mode:** one person memorizing alone gets cues (on screen, spoken, or self-recorded), an optional instant alert on a wrong word, and an after-run report.

The MVP is a free, browser-based offline web app (PWA) for Chrome and Edge, English only.

## 2. Goals and non-goals

### Goals
1. **Trustworthy notes.** False accusations are the primary failure; the design prefers silence or a "check" item over a confident wrong note.
2. **Works from one laptop across a rehearsal room** (*D3*) — far-field audio is the baseline, not an edge case.
3. **Fully offline** after the first load; audio and scripts never leave the device.
4. **Fits existing theatre practice:** SM line-note categories, per-actor notes, cuts, word-perfect by default.
5. **Portable engine:** matching logic is plain TypeScript, reusable in the test harness, a later Tauri desktop build, and later mobile builds.

### Non-goals (MVP)
- Gist / paraphrase-meaning mode (stretch; strictness slider reserves its place) — *D9*
- Per-actor audio sources; voice identification; two-cursor overlap matching — *D4, D15, D16*
- Scanned-PDF OCR; Fountain / Final Draft import — *D6*
- Desktop (Tauri) and mobile builds; second-pass accuracy model
- Non-English languages — *D8*
- Accounts, cloud sync, any server component
- Practice stats flowing from actors back to the director — *D18*
- Mispronunciation and late-cue detection

## 3. Users and core flows

| Flow | Who | Steps |
|---|---|---|
| Prepare a production | Director | Create production → import script (PDF / docx / paste) → fix tags, mark cuts & overlaps → enter cast list → export `.dasma` for the cast |
| Run a scene | Director | Pick scene range → mic check → run (live view, "Line!" prompting, quick-marks) → report → review "check" items, dismiss mishears → export per-actor PDFs |
| Practice alone | Actor | Import `.dasma` (or own script) → pick character(s) and cue settings → run → report → "lines to work on" |

## 4. Architecture

Everything runs client-side. Stack: **TypeScript, Vite, React**, Vitest, Playwright; packaged as a PWA (service worker caches app and model).

```
Mic ─► AudioSource ─► audio pipeline ──► Recognizer (Web Worker) ──► Aligner ──► events
       (pluggable)    • resample 16 kHz   • sherpa-onnx WASM         (pure TS)     │
                      • rolling buffer    • timestamped words  ◄── look-ahead      ▼
                      • clip extraction     + light hotwords        window    Session controller
                                                                              ├─► storage (IndexedDB)
                                                                              ├─► UI / alerts
                                                                              ├─► cue (TTS / recordings)
                                                                              └─► notes → PDF
```

### 4.1 Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `script` | Import (PDF, docx, text), clean-up, auto-tagging, script model, cuts/overlaps, `.dasma` read/write, re-import diff | pdf.js, mammoth |
| `audio` | `AudioSource` interface + `MicSource`; AudioWorklet capture; resample to 16 kHz mono; 30 s rolling buffer; clip extraction to WAV; level / audio-quality estimate | Web Audio |
| `asr` | `Recognizer` interface; `SherpaRecognizer` (WASM in a Web Worker; Node binding for the harness); model catalog (standard + light model), download/verify/cache | sherpa-onnx |
| `align` | Expected-stream building, normalization, phonetic keys, cursor + rolling alignment, grace window, lost/re-anchor, classification, confidence | none (pure TS) |
| `notes` | Event log → line notes; strictness filtering; dismiss/edit/manual notes; PDF and text export | `align` types, pdf-lib |
| `cue` | Cue playback (local TTS voices, recorded cues), on-book "Line!" prompt overlay/speech, mic gating while playing | Web Speech synthesis (local voices only), MediaRecorder |
| `session` | Mode setup, run lifecycle, orchestration, incremental persistence, crash recovery, wake lock, backup/export | all of the above, Dexie (IndexedDB) |
| `ui` | Library, import & tag, run setup + mic check, solo run, director run, report | React |
| `harness` | Node CLI: synthetic scene generation, scenario playback, metrics, baselines, regression gate | `align`, `asr` (Node), local TTS, audio DSP |

**Boundary rule:** `align` imports nothing from the browser or other units; all of its inputs and outputs are plain data. `asr` and `audio` are only reached through their interfaces, so per-actor sources and a native (Tauri) recognizer can be swapped in later.

### 4.2 Key interfaces

```ts
// audio
interface AudioSource {
  id: string;
  start(onFrames: (pcm16k: Float32Array, t0: number) => void): Promise<void>;
  stop(): Promise<void>;
  onStatus(cb: (s: 'live' | 'disconnected' | 'denied') => void): void;
}

// asr
interface HeardWord {
  text: string;        // as emitted by the recognizer
  start: number;       // seconds, run clock
  end: number;
  confidence: number;  // 0..1
  final: boolean;      // settled (final, or stable across N partial updates)
}
interface Recognizer {
  load(model: ModelRef, onProgress?: (p: number) => void): Promise<void>;
  accept(samples: Float32Array, sampleRate: number): void; // recognizer keeps its own run clock
  flush(): void;   // end of input
  reset(): void;   // new run
  dispose(): void;
  readonly supportsHotwords: boolean;
  onWords(cb: (words: HeardWord[]) => void): () => void;
  setHotwords(words: string[], boost: number): void; // see risk R2
  realtimeFactor(): number;
}

// align
interface ExpectedWord {
  idx: number; lineId: string; characterId: string;
  raw: string; norm: string; phon: string;
  zone: 'checked' | 'overlap';   // cut text is excluded entirely
}
type AlignEvent =
  | { type: 'matched'; idx: number; at: number }
  | { type: 'suspect'; idxs: number[]; at: number }
  | { type: 'flag'; note: NoteDraft; alert: boolean; at: number }
  | { type: 'stumble'; idx: number; heard: string; at: number }
  | { type: 'lost'; at: number; guesses: number[] }
  | { type: 'reanchored'; fromIdx: number; toIdx: number; lostFor: number; at: number }
  | { type: 'notRun'; fromIdx: number; toIdx: number; at: number }
  | { type: 'calledForLine'; idx: number; at: number }
  | { type: 'lineDone'; lineId: string; notes: NoteDraft[]; at: number };

interface Aligner {
  readonly cursor: number;
  push(words: HeardWord[]): void;
  tick(now: number): void;            // drives time-based confirmation / loss
  finalize(now: number): void;          // end of run
  setAudioQuality(q: number): void;     // 0..1
  jumpTo(idx: number): void;          // manual jump (always wins)
  pause(): void; resume(): void;      // used while cues/alerts play
  lookahead(): ExpectedWord[];        // for recognizer hotwords
  onEvent(cb: (e: AlignEvent) => void): () => void;
}
function createAligner(expected: ExpectedWord[], opts: AlignOptions): Aligner;
```

## 5. Data model

All persisted in IndexedDB; all exportable.

- **Production** — `id, title, cast: {characterId → actorName}[]` (an actor may play several characters), `settings: {noAudioClips: boolean, autoDeleteDays: number | null, defaultStrictness, defaultPatience}`.
- **Script** — `id, productionId, version, characters[] (with aliases), units[]` where each unit is `{id, kind: 'dialogue' | 'direction' | 'characterName' | 'heading' | 'sceneBreak', characterId?, text, cut: boolean, overlap: boolean, tagConfidence}`. Previous versions retained for diffing.
- **Run** — `id, productionId, scriptVersion, mode: 'solo' | 'director', range, settings snapshot, startedAt, endedAt, status: 'running' | 'complete' | 'interrupted'`.
- **Event** — append-only `AlignEvent` + session events (quick-mark, pause, mic status, poor-audio spans), keyed by run; written as they occur.
- **Note** — `id, runId, lineId, characterId, category, expected, heard, confidence, status: 'note' | 'check' | 'dismissed', clipId?, manual: boolean, lineChangedSinceNote: boolean`.
- **Clip** — `id, runId, start, end, wav Blob` (16 kHz mono; ~5 s before to ~3 s after the moment).
- **Feedback stats** — local counters of dismissed flags by category and confidence band (for tuning; never transmitted).

**`.dasma` file** — JSON (`application/vnd.dasma+json`, extension `.dasma`): `{format: 'dasma-script', formatVersion: 1, title, characters, units, cast?, exportedAt}`. Contains no audio or notes. `cast` (character → actor names) is included only if the director ticks "include cast list" on export.

**Backup file** — a zip of productions, scripts, runs, notes, and (optionally) clips.

## 6. Script import & tagging (`script`)

1. **Extract**
   - PDF via pdf.js: text items with position and font name (italic/bold fonts hint at stage directions). If a PDF has no text layer → "scanned PDFs aren't supported yet; paste the text instead."
   - docx via mammoth (Google Docs: user exports as .docx): paragraphs with italic/bold runs.
   - Pasted text: plain lines.
2. **Clean** — remove repeated headers/footers (text recurring at the same position across pages), page numbers, line numbers (e.g. Folger-style), de-hyphenate words split across lines, normalize ligatures and quotes.
3. **Auto-tag** with heuristics, each producing a `tagConfidence`:
   - Character cues: ALL-CAPS name on its own line, `NAME.` / `NAME:` prefixes, names recurring in a consistent position.
   - Stage directions: parenthesized, bracketed, or italic text; indented blocks; lines without a speaker.
   - Scene headings: `ACT` / `SCENE` patterns.
   - Overlap marks: `/` inside dialogue marks the point where the next speaker begins → following text in that line, and the overlapping start of the next line, become `overlap` zones.
   - Character aliases merged (e.g. `HAM.` ≈ `HAMLET`) by prefix match, user-confirmable.
4. **Tag-correction screen** — low-confidence units listed first; click to retag; range-select to mark cut / overlap; character merge/rename; scene breaks.
5. **Re-import** — line-level diff against the previous version (by text similarity); summary "N lines changed"; notes on changed lines get `lineChangedSinceNote`.

Tag accuracy target is "fast to fix," not perfect — the correction screen is the safety net.

## 7. The align engine (`align`)

### 7.1 Expected stream & normalization
- Built from dialogue units in the selected range, excluding cut text, character names, directions, and headings; overlap regions carry `zone: 'overlap'`.
- Normalization (both expected and heard): lowercase; strip punctuation; numbers and ordinals to words; common symbol expansion (`&` → "and"); contractions kept as written but with an expanded form stored for lenient matching.
- Phonetic key per word: Double Metaphone (primary + alternate).

### 7.2 Core loop
1. **Settled words only.** A `HeardWord` is acted on when `final` (or stable across N partial updates — set in `asr`).
2. **Cursor + look-ahead window** (~30 expected words), also fed to the recognizer as light hotwords (low boost) when supported.
3. **Rolling alignment:** on each settled word, align the last ~8 heard words against the window (banded Needleman–Wunsch). Scores: exact 1.0; phonetic match ~0.9 (counts as correct); near-phonetic partial; gap penalties for skips/insertions. Fillers (`um`, `uh`, `er`, `ah`, `hmm`) are dropped before alignment.
4. **States:** `pending → matched`, or `pending → suspect → confirmed | stumble`.
5. **Grace window (Patience slider, *D14*):** a suspect is confirmed after **C** subsequent matched words or **T** seconds without correction. The slider maps instant ↔ relaxed to roughly C=1/T=0.4 s through C=4/T=3 s (defaults set from harness data). Applies to live alerts; the after-run report re-classifies each line with full context.
6. **Self-correction:** a suspect immediately followed by the expected word (e.g. heard "the a dagger", expected "a dagger") → `stumble` (report only; never alerted or noted by default).
7. **Lost & re-anchor:** after ~5 consecutive unmatched settled words, emit `lost` with best-guess positions; search the whole expected stream via an inverted index of phonetic trigrams; snap to a candidate only after ≥3 confirming words.
   - Forward re-anchor after a **short** loss (< `longLossSec`, default 10 s): skipped material becomes **dropped line(s)** for their owners; if the speaker took another character's later line, **jumped cue**.
   - Forward re-anchor after a **long** loss: skipped material is `notRun` (no notes).
   - Backward re-anchor: no notes (assumed restart).
   - `jumpTo()` from the director always wins and produces no notes for skipped material.
8. **"Line!" detection:** heard "line" (or "line please") after a pause ≥ 1 s, when "line" is not among the next few expected words → `calledForLine` (prompt + note).
9. **Overlap zones:** no flags; cursor advances by best effort; the next checked word re-syncs the cursor.
10. **Pause/resume:** while a cue or alert sound plays, incoming words are discarded.

### 7.3 Classification → SM categories
| Pattern | Category |
|---|---|
| Deletion spanning a whole line | Dropped line |
| Deletion within a line | Dropped word(s) |
| Insertion | Added word(s) |
| Substitution | Wrong word |
| A deleted word reappearing as an insertion within ~3 words | Transposed |
| Line whose first and last ~2 words match but < ~50% of interior matches | Paraphrase (one note, not many) |
| Forward skip into another character's line | Jumped cue |
| "Line!" event | Called for line |

**Strictness (*D9*):** *word-perfect* (default) counts all categories, including contraction differences. *Lenient* ignores contraction differences and a configurable list of small function words, and only notes a line when its match ratio drops below a threshold set by the slider. Gist mode will later occupy the far lenient end.

### 7.4 Confidence & the false-alarm firewall
Each flag gets a confidence from: recognizer word confidence, phonetic distance between heard and expected, current audio-quality estimate, and whether the difference is one recognizers commonly make (e.g. contractions, short function words). Thresholds:
- **High** → live alert (if enabled) + note.
- **Low** → no alert; report "check" item with clip.
- Contraction differences are capped at "check" (recognizers normalize contractions on their own).

Defaults are conservative until real-audio data exists (*D21*).

## 8. Run experience (`session`, `cue`, `ui`)

### 8.1 Screens
1. **Library** — productions, scripts, import, backup/export, engine status; first-run model download with progress; persistent-storage request (warn if denied).
2. **Import & tag** — see §6.
3. **Run setup** — mode, scene range; solo: character(s), cue style, hide-my-lines; director: buzz toggle, quick-mark key, no-audio-clips; both: Patience + Strictness. **Mic check:** level meter + "read a line aloud"; warns if too quiet/noisy.
4. **Solo run** — current line large (shown / first letters / hidden-until-said); cue displayed and played (local TTS voice per character where available, or recorded cue); cue length full or last few words; words light as matched; confirmed errors red; optional alert tone.
5. **Director run** — glanceable: large text, high contrast, dark theme; script auto-scrolls; per-character color; words lit / red (note) / amber (check); status pill **Listening / Lost / Prompting / Paused / Poor audio**; "Line!" → large next-line overlay (+ optional speech); **space bar** quick-mark (creates a "check" item labelled *director mark* on the current line, with clip); click any line to jump; optional buzz.
6. **Report** — per-actor summary; notes by actor in script order with category, expected vs heard, ▶ clip; separate "check" list; actions: dismiss ("Word Perfect" override), recategorize, add manual note; export one PDF per actor or copy text; solo runs feed "lines to work on."

### 8.2 Cueing
- TTS uses **only voices flagged `localService`** in the Web Speech synthesis API (offline). If no local voice exists, cues are display-only and the user is told why. (Upgrade path: bundled Kokoro TTS — post-MVP.)
- Recorded cues: per character line, recorded via MediaRecorder in a "record cues" pass; stored with the production.
- While any cue/alert plays, the aligner is paused (§7.2 step 10).

### 8.3 Audio clips & retention (*D17*)
- Rolling 30 s in-memory buffer; on each note, check item, or quick-mark, save ~5 s before / ~3 s after as a clip.
- Production switch **no audio clips** → nothing saved but text and timestamps.
- Optional **auto-delete after N days** (clips only; notes remain).
- Full-run recording: off by default, opt-in per run.
- Always: audio never leaves the device; visible listening indicator; first director-mode run per script shows a one-line reminder to inform the cast.

### 8.4 Persistence
Events and notes are written as they occur. On load, any run with `status: 'running'` offers **Recover interrupted run?**

## 9. Error handling

Principle: **degrade toward silence, never toward false accusations.**

| Situation | Behavior |
|---|---|
| Off-script talk (director notes, chatter) | Aligner goes `lost`; no notes while lost; long loss → `notRun` on re-anchor (§7.2) |
| Poor audio (low signal-to-noise) | Status "Poor audio"; alerts suppressed; flags downgraded to "check"; span shaded in report |
| Long pauses | Not errors; streaming transducer models don't hallucinate in silence |
| Mic permission denied / no mic | Explanation + browser-specific steps |
| Mic disconnects mid-run | Pause run; banner; resume on reconnect; gap marked "not heard" |
| Laptop too slow (realtime factor > 1) | Switch to lighter model; if still behind, disable live alerts with explanation; notes continue |
| Tab hidden / sleep | Screen Wake Lock during runs; suspended spans marked "not heard" |
| Browser crash | Incremental persistence + recovery prompt |
| Unsupported browser features | Compatibility check on load; recommend Chrome/Edge |
| Model download interrupted / corrupt | Resumable chunked download, SHA-256 verify, retry; import/tagging still usable |
| Persistent storage denied | Warning + backup nudge |
| Storage near quota | Warn before run; offer clip cleanup |
| Scanned PDF | Detected; suggest paste |
| Recognizer worker crash | Auto-restart; gap marked "not heard"; run continues |
| Aligner exception | Caught by session controller; run continues in display-only mode; error logged locally |

## 10. Testing

| Layer | What | Tooling |
|---|---|---|
| 1. Unit | Normalization, phonetic keys, classification rules, import fixtures (public-domain plays as text PDFs in several layouts, docx, paste), `.dasma` round-trip, re-import diff | Vitest |
| 2. Aligner scenarios | DSL: *script + heard words with timings → expected events*. Library covers every §7 case (perfect, drop, swap, transposition, paraphrase, stumble, homophones, fillers, contractions × strictness, short/long jumps, restart, "Line!", overlap, cuts, chatter). **Property tests** inject 5–15% random recognizer errors into perfect runs and assert false alerts stay under budget. Aligner is built test-first. | Vitest, fast-check |
| 3. Audio harness | Synthetic scenes (public-domain text, planted labeled errors, several local TTS voices, room simulation: impulse-response reverb, distance attenuation, noise, laptop-mic EQ) → Node sherpa-onnx → aligner → notes → compare with labels. Metrics: recall per category, false alerts / false notes per run, alert latency p50/p95, re-anchor time, realtime factor. Stored baselines + regression gate. Real recordings later use the same format (audio + labeled transcript). Also compares browser audio-processing settings (echo cancellation / noise suppression / auto-gain on vs off). | Node CLI |
| 4. Browser E2E | Chrome's fake-microphone-from-WAV flag drives full flows on Chrome & Edge: import → run → report → PDF; mic disconnect; crash recovery | Playwright |
| 5. Manual | Per-release checklist; real rehearsals | — |

### Starting acceptance targets (revised after real audio)
| | Solo, close mic | Director, laptop across room |
|---|---|---|
| False alerts | ≤ 1 per 10 min | ≤ 1 per scene |
| False notes (excluding "check") | ≤ 1 per 10 min | ≤ 2 per scene |
| Recall: dropped/wrong word, dropped line | ≥ 90% | ≥ 75% |
| Alert latency at fastest Patience | p50 < 500 ms | n/a |

If far-field results on real audio fall well short, the response is to bring per-actor audio forward — not to loosen the false-alarm budget.

## 11. Milestones

Each milestone gets its own implementation plan.

1. **M0 — Scaffold:** repo layout (Vite + React + TS app, `packages/align`, `packages/asr`, `harness/`), lint, Vitest, CI.
2. **M1 — Engine & harness (go/no-go):** `align` built test-first with the scenario DSL and property tests; sherpa-onnx in Node; synthetic scene generator + room simulation; metrics + baselines. **Checkpoint:** review numbers against §10 targets before building UI.
3. **M2 — Scripts:** import (PDF, docx, paste), clean-up, auto-tag, tag-correction screen, cuts/overlaps, `.dasma` export/import, re-import diff.
4. **M3 — Solo mode:** browser recognizer worker + model download/caching, mic pipeline, run setup + mic check, solo run screen, cues (local TTS + recorded), alerts, report, "lines to work on."
5. **M4 — Director mode:** director run screen, lost/re-anchor UI, manual jump, on-book "Line!" prompting, quick-mark, clips + retention settings, cast list, per-actor PDF export.
6. **M5 — Hardening & release:** full error-handling table (§9), persistent storage + backup, PWA offline install, Playwright E2E on Chrome/Edge, manual checklist, first public release.

**After MVP (in rough order):** real-recording tuning of defaults; Tauri desktop build (bundled models, air-gapped install, optional Parakeet second pass); gist mode; per-actor audio sources (+ two-cursor overlap matching); mobile.

## 12. Risks

| # | Risk | Mitigation / when we'll know |
|---|---|---|
| R1 | Far-field accuracy from a laptop mic is too low for useful notes | M1 synthetic numbers (optimistic), then real recordings; fallback is per-actor audio sooner |
| R2 | sherpa-onnx WASM may not support changing hotwords mid-stream cheaply | Verify in M1; fall back to no biasing (alignment does not depend on it). Verified 2026-10-10: the Node binding has no per-stream hotwords; the engine does not depend on them. |
| R3 | English streaming Zipformer accuracy weaker than larger models | M1 measures it; candidates to swap behind `Recognizer`: Nemotron streaming, Moonshine streaming |
| R4 | Local TTS voices missing on some machines | Display-only cues with explanation; Kokoro post-MVP |
| R5 | Publisher PDF layouts defeat auto-tagging | Correction screen; grow fixture library from real scripts users report |
| R6 | Safari storage eviction | Chrome/Edge supported; backups; Tauri build (*D20*) |
| R7 | Browser audio processing (AGC, noise suppression) hurts or helps recognition unpredictably | Harness compares settings; expose as advanced option if needed |

## 13. Licensing notes
- sherpa-onnx: Apache-2.0. Zipformer English models: check each model's license at selection time (M1).
- pdf.js: Apache-2.0. mammoth: BSD-2. pdf-lib: MIT. Dexie: Apache-2.0. Double Metaphone implementations: choose an MIT/BSD-licensed one.
- DASMA's own license: to be decided before first public release (open source vs. source-available affects the future premium option).
