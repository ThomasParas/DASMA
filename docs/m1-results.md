# M1 Results — Matching Engine & Harness (go/no-go)

Date: 2026-10-10 · Commit: `1aff518` (runs executed on `b489054` with the `1aff518` recognizer fix in the working tree) · Spec: docs/superpowers/specs/2026-10-10-dasma-design.md §10–§11

## What was measured

- Scenes: earnest-act1, romeo-balcony (public domain) · 10 seeds each · error rate 0.35, benign rate 0.2 · 91 planted errors per room (40 of them "core": dropped/wrong word, dropped line)
- Recognizer: zipformer-en-2023-06-21 (sherpa-onnx streaming Zipformer, int8, Node binding 1.13.8, 2 threads, greedy search, no hotwords); light model zipformer-en-20M-2023-02-17
- Audio: synthetic multi-speaker TTS (Piper libritts_r) + simulated rooms (close-mic; far-field RT60 0.6 s, SNR 18 dB, laptop EQ; far-field-hard RT60 0.9 s, SNR 10 dB). The mean scene is **1.23 min** long (24.6 min of audio over 20 runs).
- Extra runs beyond the brief, used for diagnosis: **oracle** (the same scenes and timings, but a perfect recognizer: the test helper `oracleWords`, confidence 0.95) at patience 0.5 and 0, **patience 1** in all three rooms, and a **repeat** of the default close-mic/far-field run to measure run-to-run noise.
- Machine: Apple M4, Node 24.
- Caveat: synthetic voices are cleaner and more regular than real actors, so treat these numbers as an upper bound until real recordings (D21) are run through the same harness.
- Caveat: Piper TTS is **not deterministic**. VITS samples noise, and the same text and voice rendered twice gave 45 824 vs 52 480 samples. Seeds fix the script perturbations but not the audio, so repeated runs differ (see "Run-to-run noise").

## Results vs. spec targets

### Close mic — patience 0.5 (m1-default) and 0 (m1-instant, latency)

| Target                                    | Required | Measured p=0.5  | Measured p=0         | Result                                                                                  |
| ----------------------------------------- | -------- | --------------- | -------------------- | --------------------------------------------------------------------------------------- |
| False alerts / 10 min                     | ≤ 1      | 3.66 (0.45/run) | 19.96 (2.45/run)     | **FAIL**                                                                                |
| False notes / 10 min                      | ≤ 1      | 9.35 (1.15/run) | 85.94 (10.55/run)    | **FAIL**                                                                                |
| Recall (dropped/wrong word, dropped line) | ≥ 0.90   | 0.800           | 0.925                | **FAIL** at default (p=0 passes recall, but its false alarms are about 20× over budget) |
| Alert latency p50 (patience 0)            | < 0.5 s  | 1.256 s         | 1.091 s (p95 5.49 s) | **FAIL**                                                                                |

Other metrics (p=0.5): recall over all categories 0.857, incl. checks 0.967, same-category 0.791, false checks 5.65/run, benign violations 0.35/run. At patience 1: false alerts 4.48/10 min, false notes 8.55/10 min, recall 0.850, so all still FAIL.

### Far field (laptop across the room) — m1-default, patience 0.5

| Target               | Required | Measured | Result                      |
| -------------------- | -------- | -------- | --------------------------- |
| False alerts / scene | ≤ 1      | 1.00     | PASS (exactly at the limit) |
| False notes / scene  | ≤ 2      | 1.85     | PASS                        |
| Recall               | ≥ 0.75   | 0.850    | PASS                        |

Same run per 10 min: **8.13 false alerts and 15.04 false notes**. The per-scene targets pass only because the test scenes last 1.2 minutes. A real 10–20 minute scene at these rates would get about 15–30 false notes. At patience 1: 0.80 alerts/scene, 1.50 notes/scene, recall 0.925 (PASS). Repeat run at p=0.5: 0.90 / 1.50 / 0.850.

### Far field (hard room) — m1-default, patience 0.5 (and patience 1)

| Target               | Required | Measured p=0.5 | Measured p=1 | Result   |
| -------------------- | -------- | -------------- | ------------ | -------- |
| False alerts / scene | ≤ 1      | 5.15           | 3.80         | **FAIL** |
| False notes / scene  | ≤ 2      | 4.80           | 4.05         | **FAIL** |
| Recall               | ≥ 0.75   | 0.600          | 0.550        | **FAIL** |

### Light model (zipformer-en-20M) — m1-light, patience 0.5

| Room                   | False alerts | False notes | Recall | Result                                                 |
| ---------------------- | ------------ | ----------- | ------ | ------------------------------------------------------ |
| close-mic (per 10 min) | 15.44        | 19.91       | 0.900  | **FAIL** alarms, PASS recall (latency p50 1.32 s FAIL) |
| far-field (per scene)  | 3.75         | 4.15        | 0.825  | **FAIL** alarms, PASS recall                           |

The light model has 2–4× the false alarms of the default model. It is not a viable default.

### Engine alone (oracle recognizer, close-mic scenes)

|                       | p=0.5                  | p=0                     |
| --------------------- | ---------------------- | ----------------------- |
| False alerts / 10 min | 2.45 (0.30/run) — FAIL | 112.5 (13.8/run) — FAIL |
| False notes / 10 min  | 1.22 (0.15/run) — FAIL | 98.6 (12.1/run) — FAIL  |
| Recall (core)         | 0.975 — PASS           | 0.950 — PASS            |
| Alert latency p50     | 0.958 s                | **0.453 s — PASS**      |

With perfect hearing the engine detects nearly everything, but it still fails the close-mic false-alarm budget. All of those false alarms come from director chatter. At patience 0 the engine collapses on its own (see calibration finding 6).

## Detection by category (m1-default, patience 0.5; oracle for reference)

| Category        | Planted | close-mic    | far-field | far-field-hard | oracle |
| --------------- | ------- | ------------ | --------- | -------------- | ------ |
| added-words     | 9       | 8 (0.89)     | 6 (0.67)  | 4 (0.44)       | 9      |
| dropped-words   | 12      | 11 (0.92)    | 11 (0.92) | 9 (0.75)       | 11     |
| wrong-words     | 14      | **7 (0.50)** | 9 (0.64)  | 5 (0.36)       | 14     |
| dropped-line    | 14      | 14 (1.00)    | 14 (1.00) | 10 (0.71)      | 14     |
| jumped-cue      | 13      | 13 (1.00)    | 13 (1.00) | 8 (0.62)       | 13     |
| transposed      | 11      | 9 (0.82)     | 8 (0.73)  | 8 (0.73)       | 10     |
| paraphrase      | 6       | 6 (1.00)     | 5 (0.83)  | 2 (0.33)       | 6      |
| called-for-line | 12      | 10 (0.83)    | 6 (0.50)  | 5 (0.42)       | 12     |

Scoring is line-level: any `note` on the errored line counts as a detection. That is why far-field wrong-words (9) beats close-mic (7). Several far-field "detections" are recognizer deletions on the same line (e.g. romeo#2 R1: planted "wherefore" substitution, detected as dropped-words "wherefore"). The same-category rate shows this: 0.79 close-mic, 0.65 far-field, 0.28 far-field-hard.

## Where false notes come from

Step 5 output (m1-default, notes with status `note` on lines with no planted error):

| Room / category                                   | Count     | Examples                                                               | Diagnosis                                                                                                                            |
| ------------------------------------------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| close-mic / added-words                           | 10        | "any"; "from just"; "the entrance please"                              | Director-chatter tails attached to the previous line, plus ASR splitting "Anyone" (E4) into "any one", which leaves "any" on E3 (4×) |
| close-mic / dropped-words                         | 7         | "what"; "Lane"; "hand"                                                 | ASR deletions or merged partials ("norhan"), reported at a flat 0.8 confidence, so they also fire as alerts                          |
| close-mic / wrong-words                           | 5         | "Lady"→"we"; "Bracknell"→"going"; "take"→"art"                         | Chatter words ("…before we keep going…") substituted into the next line                                                              |
| close-mic / called-for-line                       | 1         | "but love, and I'll be new baptized; henceforth"→"line"                | "line" heard next to a jumped cue                                                                                                    |
| far-field / dropped-words                         | 19        | "bottles"; "bachelor's"; "Lane"                                        | ASR deletions under reverb and noise, all at 0.8 confidence                                                                          |
| far-field / added-words                           | 9         | "from just"; "the entrance please"; "ok hold"                          | Chatter tails                                                                                                                        |
| far-field / wrong-words                           | 7         | "consumed"→"soon"; "Bracknell"→"fix"; "what I"→"wives plainly"         | Chatter plus ASR misrecognition with high token confidence                                                                           |
| far-field / jumped-cue, paraphrase                | 1 + 1     | "Yes, sir" dropped; "eight bottles and a pint"→"eight balls in a pint" | One short line missed, which became a jump; several mishearings in one line became a paraphrase                                      |
| far-field-hard / dropped-words                    | 89        | "play"; "sir"; "brand"                                                 | The recognizer drops words at SNR 10 dB / RT60 0.9 s, and every drop is a 0.8 note and an alert                                      |
| far-field-hard / wrong-words, added, dropped-line | 5 + 1 + 1 | "sir"→"before"; "Yes"→"sorry"; "as"→"just"                             | Chatter                                                                                                                              |

Cause attribution (each false note assigned to the nearest label; m1-default):

| Cause                                                                       | close-mic (23) | far-field (37) | far-field-hard (96) |
| --------------------------------------------------------------------------- | -------------- | -------------- | ------------------- |
| Director chatter (on the line it precedes, or on the chatter-labelled line) | 8              | 13             | 9                   |
| Recognizer only, clean neighbourhood                                        | 6              | 9              | 25                  |
| Next to a planted error (spill-over from re-anchoring)                      | 8              | 12             | 42                  |
| On a stumble or long-pause line                                             | 1              | 3              | 20                  |

## Speed

Mean real-time factor (recognizer only; Node, 2 threads, Apple M4):

| Model                               | close-mic | far-field | far-field-hard |
| ----------------------------------- | --------- | --------- | -------------- |
| zipformer-en-2023-06-21 (default)   | 0.027     | 0.027     | 0.027          |
| zipformer-en-20M-2023-02-17 (light) | 0.014     | 0.014     | —              |

Both models are far under 1.0 natively. In-browser WASM will be several times slower, but the default model has about 35× headroom. The 60-run m1-default evaluation took roughly 10–15 min wall-clock, mostly TTS and room convolution.

## Run-to-run noise

A repeat of m1-default (same seeds; the TTS re-renders differently each time):

|                  | close-mic run 1 → run 2 | far-field run 1 → run 2 |
| ---------------- | ----------------------- | ----------------------- |
| core recall      | 0.800 → 0.875           | 0.850 → 0.850           |
| false alerts/run | 0.45 → 0.60             | 1.00 → 0.90             |
| false notes/run  | 1.15 → 1.20             | 1.85 → 1.50             |
| latency p50      | 1.26 → 1.15 s           | 1.71 → 1.17 s           |

The regression gate tolerates −0.03 core recall and +0.2 false alerts/run. The noise between two identical runs (0.075 recall, 0.15 alerts) is larger than or close to those tolerances, so the gate will flap until the audio is made reproducible (see Harness findings). `gate` of m1-default against itself: GATE PASS. `gate` of the repeat run against the baseline: GATE PASS.

## Engine calibration findings

Evidence comes from `harness/out/*/runs.json` (not committed; regenerate with the commands above) plus direct traces of single runs. No engine constants were changed in this task.

### 1. Double-metaphone sound-alikes are too coarse ("sir" ≈ "sorry")

- `wordScore` returns 0.9 (≥ `MATCH_THRESHOLD` 0.85, so a **match**) whenever primary or secondary keys agree and both words have ≥ 3 letters: sorry/sir → SR/SR = 0.9; lion/line → LN/LN = 0.9.
- Evidence (oracle, perfect recognizer, earnest-act1 #3): LANE says "Yes, sir." and the director then says "Sorry, sorry, can we take that bit again from just before the entrance please?". The engine produced a false alert, E7 wrong-words "sir"→"before" at 0.808, plus a false note, added-words "again from just" at 0.712. These are 1 of the oracle's 6 false alerts and 2 of its 3 false notes. Real ASR, far-field-hard earnest #6: E5 "Yes"→"sorry" (0.671).
- Substitutions between sound-alikes can never be flagged, because they score as matches. The harness cannot currently measure this: none of its 18 `SUBSTITUTES` sounds like the words it replaces (every planted pair scores < 0.3).
- **Proposed:** give the 0.9 score only when letter-level similarity also agrees (e.g. normalized letter edit distance ≤ 0.4, or letter-length ratio ≥ 0.7). sorry/sir has edit distance 3 of 5 letters, so it would fall below `MATCH_THRESHOLD` and become a "similar" substitution, which is a check. Add near-homophone substitutions (sir/sore, there/their, piece/peace) to the harness so this is measured.

### 2. `SIMILAR_SUB_SCORE` 0.3 sits exactly on the recognizer-mishearing distribution

- Property test ("still detects planted wrong words through 10% noise"): 90/100 detected. **7 of the 10 misses** are pairs scoring 0.30–0.48 that get the 0.6 factor: 0.85 × 0.6 × 0.95 = **0.485**, just under `noteMinConfidence` 0.5. The pairs: invariably→umbrella 0.30, observed→yoghurt 0.30, pint→biscuit 0.30, bottles→pickle 0.30, bottles→kettle 0.30, entered→lantern 0.36, accurately→yoghurt 0.48. (banana→nine also scores 0.40.) The other 3 misses are alignment splits, e.g. "accurately"→"a" plus added "volcano".
- Real harness: **0 of the 7** close-mic wrong-words misses were caused by this (all planted pairs score ≤ 0.24; see finding 3). But the recognizer's own mishearings cluster in exactly that band. Of 78 single-word false-check substitutions in close-mic, 70 score ≥ 0.3 (25 at 0.30, 26 at 0.40). Removing the 0.6 downgrade would turn 16 of them into false notes (0.8/run, about 6.5/10 min). Raising the cut to 0.45 would add 14. In far-field it would add 29 (1.45/run).
- So the threshold is not "loose" in the sense of being cheap to tighten. The metaphone-Levenshtein × 0.6 score is too coarse to separate (in these runs it took only a handful of values, mostly 0, 0.2, 0.24, 0.3, 0.4, 0.45, 0.48, 0.6, with 0.30 and 0.40 the most common) "piano"/"piao" (a mishearing) from "observed"/"yoghurt" (a real error).
- **Proposed:** replace the key-Levenshtein with a phoneme-level similarity (CMUdict lookup with a g2p fallback). Make the downgrade conditional: similar **and** low heard confidence → check; similar but confident (≥ 0.8) → note. Re-run both the property test and the harness.

### 3. Heard-token confidence suppresses genuine wrong words (the main wrong-words recall loss)

- Close-mic wrong-words recall is 0.50 (7/14 notes), but recall including checks is 1.0. All 7 misses are **dissimilar** substitutions (score 0.00–0.24, so no 0.6 factor). They drop below 0.5 because the heard words' mean token probability is 0.27–0.54: "what"→"money" 0.46, "Shall"→"letter" 0.247, "don't"→"sister" 0.25, "What"→"dinner" 0.371, "wherefore"→"kridge" 0.227, "don't"→"dreadful" 0.401, plus one paraphrase at 0.487.
- The transducer's prediction network gives low posteriors to words that are unlikely in context. A planted (or real) wrong word is exactly that, so the evidence is penalized precisely when it matters. Detected substitutions had implied confidences of 0.63–0.87.
- **Proposed:** stop multiplying wrong-words confidence by raw token probability. Use e.g. `c *= 0.6 + 0.4·conf`, or compare against the line's median heard confidence, and keep the full penalty only for function words.

### 4. Dropped-words confidence ignores the recognizer (the main false-alert source)

- A deletion has no heard tokens, so its confidence is always 0.8 × `audioQuality`, which is ≥ `alertMinConfidence` 0.75. The harness never calls `setAudioQuality`, so `audioQuality` is 1, and **every recognizer deletion becomes a note and an alert**. "Degrade toward silence" (spec §7.4) is not active in this pipeline.
- Evidence: dropped-words make up 7/23 close-mic, 19/37 far-field, and **89/96 far-field-hard** false notes. Trace (romeo-balcony #4 close-mic): the stabilizer emitted the partial "norhan", so the aligner flagged wrong-words "nor"→"norhan" (check) and **dropped-words "hand" (note, alert)**, while the final transcript had "nor hand".
- **Proposed:** (a) feed `audioQuality` from the recognizer, e.g. a trailing-window mean token confidence and/or an SNR estimate; (b) scale a deletion's confidence by the confidence of the neighbouring heard words and the local mismatch density (a deletion next to low-confidence substitutions → check); (c) only alert on dropped-words for ≥ 2 content words or a timing gap consistent with a skip; (d) before classifying, merge a deletion with an adjacent heard token that contains it as a prefix ("norhan" ⊃ "nor" + "han…").

### 5. Director chatter: early commits, unretractable alerts, and tails on the previous line

- Oracle earnest-act1 #6: the chatter "Sorry, sorry, can we take…" contains "sorry" from the next line, E3 ("I'm sorry for that…"). The engine committed into E3 early and fired **4 alerts** (wrong-words "I'm"→"sorry", "for"→"take", "for"→"bit", "your sake"→"from just", all 0.808). When the actor actually said E3 the aligner re-anchored and E3's final notes were clean, but the alerts had already fired. These are 4 of the oracle's 6 false alerts.
- Chatter tails become added/wrong words on the line before. The ≥ 4-word added-words halving does not fire because the chatter is split into short runs ("from just", "the entrance please"). Chatter caused 8/23 close-mic and 13/37 far-field false notes.
- **Proposed:** don't raise an alert for a line until it is anchored by ≥ `ANCHOR_WORDS` in-order matches; treat a run of ≥ 4 heard words with ≤ 1 match among them (summed across short gaps) as off-script talk, so its notes become checks; and support alert retraction in the UI.

### 6. Patience 0 commits misalignments (engine-only)

- Oracle at p=0: **12.1 false notes and 13.8 false alerts per run**, against 0.15 / 0.30 at p=0.5, with perfect hearing. With `confirmWords` = 1 and a 0.4 s timeout, the start of the next line gets committed as substitutions for the current line's unmatched tail. Examples: E14 "Good heavens"→"i believe" (E15's opening), E9 "Yes"→"lord" plus "sir"→"shoreman", and E12 "is it"→"lord shoreman".
- **Proposed:** a floor of `confirmWords` ≥ 2 even at p=0, and before committing a substitution block, check whether its heard words match the lookahead (the openings of the next lines). If they do, classify the block as skip/jump. The engine meets the latency target at p=0 (0.453 s), so the slider can keep its fastest setting if this is fixed.

### 7. Normalization gaps (smaller)

- Compound splits: ASR "any one" for "Anyone" caused 4 close-mic false added-words notes ("any") plus checks. **Proposed:** join adjacent heard tokens whose concatenation equals the expected word (anyone, everybody, tonight, cannot).
- Abbreviations: "Mr." vs "mister" scores 0.3, which is a check every time "Mr." occurs. **Proposed:** expand Mr/Mrs/Dr/St in expected-word normalization.

### Recognizer findings

- **Latency:** at p=0, real ASR gives p50 1.09 s against 0.45 s for the oracle. The recognizer path (zipformer chunking plus `Stabilizer(2)`) adds about 0.64 s. **Proposed:** use a stabilizer depth of 1 for the alert path (keeping depth 2 for notes), or a model with smaller chunks.
- **`start_time` (verified):** sherpa-onnx-node 1.13.8's `start_time` is stream-absolute, and token timestamps are relative to it. In a raw probe (wave, 3 s silence, wave), the second copy's first token came out at 9.92 + 0.36 = 10.28 s, against 10.27 s expected from the first copy. The continuity integration test passes with the current `collect`, so no code change was needed; the comment now records this.
- **Fixed in this task (`1aff518`):** `flush()` padded with 16 kHz silence after 22.05 kHz input, and sherpa aborts the process (exit 255) when a stream changes rate. The first smoke run crashed on this. A new integration test covers it.

### Harness findings

- TTS nondeterminism (above). **Proposed:** set the VITS `noiseScale`/`noiseScaleW` to fixed low values, or cache rendered audio per (scene, seed), and run ≥ 20 seeds before trusting the gate.
- `runs.json` stores neither alert flags nor transcripts, so alert causes had to be reconstructed by re-running. **Proposed:** add `flags` and `heard` to `RunRecord`.
- Per-scene far-field targets on 1.2-minute scenes are about 8× looser than the close-mic per-10-min targets. **Proposed:** report both, and use longer scenes.
- Latency is measured from an interpolated label time (word position ÷ segment length), so p50/p95 carry ±0.2–0.3 s of measurement error.

## Recommendation

**GO WITH ENGINE CHANGES**, applied strictly and with the failures stated plainly:

- **Not GO.** Close-mic misses all four targets at the default patience (3.66 false alerts and 9.35 false notes per 10 min, recall 0.80, latency 1.26 s). This is worse than the GO-WITH-ENGINE-CHANGES precondition ("one side met") at the default setting. The light model and patience 0 meet recall but not the false-alarm targets (the "vice versa" case).
- **SINGLE-LAPTOP NO-GO is not triggered** for the spec's far-field room. It is within the per-scene budget at patience 0.5 (1.00 / 1.85) and at patience 1 (0.80 / 1.50), with recall 0.85–0.93. It **is** triggered by far-field-hard (3.80 alerts and 4.05 notes per scene even at patience 1). Far-field also passes only because the test scenes last 1.2 minutes (8.1 alerts and 15.0 notes per 10 min).
- Per-actor audio would not fix this on its own. Close-mic, the per-actor proxy, fails, and the oracle runs show that much of the failure is the engine: chatter handling, deletion confidence, patience-0 commits. The recognizer's share is deletions and latency.

Engine changes to make, in order of expected impact, followed by a re-run of this exact matrix before M3:

1. Make deletion confidence evidence-based and wire `audioQuality` (finding 4).
2. Alerts only after a line is anchored, and off-script-run detection for chatter (finding 5).
3. Confirmation floor and lookahead check at patience 0 (finding 6).
4. Soften the heard-confidence penalty for content-word substitutions (finding 3).
5. Letter-agreement guard on sound-alike matches (finding 1), and phoneme-level similarity with a confidence-conditional downgrade (finding 2).
6. Compound and abbreviation normalization (finding 7).
7. Harness: deterministic audio, flags and transcripts in `runs.json`, sound-alike substitutions, longer scenes.

M2 (script import) does not depend on these engine defaults and can proceed in parallel if the user agrees. M3 (live solo mode) should not start until close-mic meets its targets on the re-run.

Next data needed: real rehearsal recordings (D21) run through `harness` in the same report format.
