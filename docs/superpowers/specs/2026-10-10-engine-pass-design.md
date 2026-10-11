# DASMA — Engine-Change Pass: Design Spec

Date: 2026-10-10 · Status: draft for review
Parent spec: [`2026-10-10-dasma-design.md`](2026-10-10-dasma-design.md) (cited as "MVP spec §n").
Input: [`docs/m1-results.md`](../../m1-results.md), the M1 go/no-go report and its nine-item engine-change list (cited as "M1 finding n").

---

## 1. Goal and success criteria

M1 showed that the matching engine raises far too many false alarms. At default Patience the close-mic condition failed all four MVP spec §10 targets: 3.66 false alerts and 9.35 false notes per 10 min, recall 0.80, alert latency p50 1.26 s. This pass fixes the engine and the measuring tool so that live solo mode (M3) can begin.

**The pass succeeds** when the new `solo-close-mic` condition meets all four MVP spec §10 "Solo, close mic" targets on the held-out seeds (§3.1):

| Target | Required | Measured at |
|---|---|---|
| False alerts | ≤ 1 per 10 min | Patience 0.5 (default) |
| False notes (excluding "check") | ≤ 1 per 10 min | Patience 0.5 |
| Recall: dropped words, wrong words, dropped line | ≥ 0.90 | Patience 0.5 |
| Alert latency p50 | < 0.5 s | Patience 0 (fastest) |

At Patience 0 the false-alarm numbers are reported but not gated, matching how M1 measured latency.

**Fixed rules:**
- Targets are never loosened (MVP spec §10).
- There are at most two measure-and-tune rounds (§3). After round 2 the pass ends and reports, whether it passed or failed.
- The director conditions are not part of the gate. They are reported against the Step 0 baseline every round, and any worsening is called out.
- Everything stays offline. `packages/align` stays pure TypeScript (no `node:*`, DOM or `@dasma/*` imports).

## 2. Scope

**In scope:** the harness changes in §4, the engine scoring changes in §5, the aligner behaviour changes in §6, the recognizer-wrapper changes in §7, and the conditional round-2 items in §8.

**Out of scope:**
- Alert retraction in the UI (an M4 concern).
- A letter-to-sound (g2p) model.
- A two-speed stabilizer, unless round 2 selects it (§8).
- Per-actor audio.
- Real recordings.
- Any UI work.
- M2 (script import), which can proceed in parallel.

## 3. Process

```
Step 0  Fix the measuring tool (§4) ─► new baseline on the unchanged engine
Round 1 Engine changes §5–§7 ─► tune on seeds 1–10 ─► measure on held-out seeds 11–30
        all four solo targets pass? ── yes ─► results doc, M3 GO
                                     └─ no ─► Round 2
Round 2 Only the §8 items the round-1 error breakdown points to ─► tune ─► measure ─► results doc (GO or NO-GO), stop
```

### 3.1 Seed split

- **Seeds 1–10 are the tuning set.** All diagnosis, error attribution and parameter choices use only these seeds.
- **Seeds 11–30 are the held-out gate set.** Only the go/no-go result and the reported numbers come from them, and no parameter is ever chosen by looking at them.
- The harness CLI gains `--seed-from <n>` (default 1), so `--seed-from 11 --seeds 20` runs exactly the gate set.

## 4. Step 0 — The measuring tool

### 4.1 Repeatable audio

Piper/VITS samples random noise, so the same text renders differently each time (M1 harness finding). This pass adds a render cache.

- **Location:** git-ignored, at `harness/out/tts-cache/`.
- **Key:** SHA-256 of (TTS model id, speaker id, speed, text). The value is the rendered samples and sample rate.
- **Lifetime:** the first render of a segment is stored and every later run reuses it, so runs on the same machine give identical audio and identical numbers. A new machine renders once and is then just as stable.
- **No determinism of TTS internals is claimed.** The cache is what makes runs repeatable.
- **Recognizer determinism:** the recognizer stays deterministic given identical audio (greedy search, fixed threads). Step 0 verifies this with two runs of the same configuration that must produce identical `report.json` conditions.

### 4.2 Modes and condition names

`evaluate` gains `--modes solo,director` (default both). A condition is `<mode>-<room>`:

| Condition | Targets |
|---|---|
| `solo-close-mic` | The four solo targets in §1. **This is the M3 gate.** |
| `director-far-field`, `director-far-field-hard` | The existing per-scene budget: ≤ 1 false alert, ≤ 2 false notes per scene, recall ≥ 0.75 |
| `director-close-mic`, `solo-far-field`, `solo-far-field-hard` | Reported only, with no pass/fail |

The old condition names (`close-mic`, `far-field`, `far-field-hard`) are retired. The Step 0 baseline replaces `harness/baselines/baseline.json`.

### 4.3 The solo condition

The solo condition copies M3's setup (MVP spec §8.2): the app plays or shows cues and ignores the mic while a cue plays.

- **Which characters:** for each scene and each character with at least 4 lines, one solo run per seed.
- **Expected words:** only that character's lines, passed to `buildExpected`. The engine has no character filter, and none is added. The caller selects the lines, exactly as M3 will.
- **Audio:** only that character's segments, rendered and perturbed as usual. Each cue (the other characters' lines) is replaced by silence of the same rendered duration. The room simulation still adds its noise floor across the silence.
- **Perturbations:** the usual kinds except `jumped-cue` (meaningless without a scene partner) and `chatter`. A solo-only benign kind, `aside`, is added. It is a short self-interruption such as "Wait, sorry, let me go again." Half the time it is followed by a restart of the current line from its beginning. It is labelled benign and must produce no notes.
- **Seeding:** the per-run seed is `hash(sceneId:character:seed)`, so adding a character or scene never changes another run's perturbations.

### 4.4 Fair false-alarm counting

M1 skipped every line that carried a planted error when counting false alarms, which biased the rates low (M1 metric caveats). The new counting, per run:

- **Lines with no planted error:** every `note` is a false note, and every alert is a false alert (unchanged).
- **Lines with planted errors:** let *k* be the number of error labels on the line.
  - Up to *k* notes count toward detection, and any further notes are false notes.
  - Likewise, up to *k* alerts count toward detection, and any further alerts are false alerts.
  - When notes exceed *k*, notes whose category matches a label's category are the ones counted as detections.
- Per-10-minute rates divide by all audio minutes, as before.

### 4.5 More material

- **Seeds:** 30 per scene (10 tuning + 20 held out).
- **Two new public-domain scenes:**
  - `earnest-act1-cigarette`: the Jack/Algernon cigarette-case passage from *The Importance of Being Earnest*, Act 1 (Wilde, 1895), about 25 speeches, several of them long. It is a longer two-hander.
  - `hamlet-to-be`: Hamlet's "To be, or not to be" (Act 3, Scene 1), one character. It is split into lines at sentence boundaries, because perturbation, notes and recall are all per line. It uses modern spellings ("wished", "the oppressor's", "heartache"), because archaic elisions are a normalization problem outside this pass. This is the canonical solo use, and it runs only in solo mode.
- **Planted sound-alike substitutions:** a new `wrong-words` variant that swaps a word for a near-sound-alike from a fixed list (e.g. accept/except, sir/sore, then/than, quite/quiet, slings/stings). The label carries `soundAlike: true` and the report shows its detection rate separately. True homophones (piece/peace, there/their) are left off the list, because no listener could catch them. These still count in core recall, since actors genuinely make these mistakes.
- **Quoting chatter:** the director `CHATTER` list gains lines that quote an earlier line of the same scene, built at perturb time from a previous line's first 4–6 words, e.g. "Go back to 'what I was playing', please." This measures the §6.3 fix.

### 4.6 Run records

`RunRecord` gains:
- `flags`: every `flag` event, as `{ note, alert, audioTime }`.
- `heard`: the stabilized heard transcript, as `{ text, start, end, confidence }[]`.
- `mode` and `character` (null for director runs).

The analysis scripts in `harness/scripts/` are updated to the new names and fields, so attribution needs no re-runs.

### 4.7 Step 0 exit

- Run the full matrix (both modes × three rooms × all scenes × seeds 1–30) on the **unchanged** engine.
- Commit the result as `harness/baselines/baseline.json`, plus a short Step 0 section in `docs/engine-pass-results.md`.
- No engine code changes in Step 0.

## 5. Round 1A — How a note is scored (`packages/align`)

### 5.1 Dropped-word confidence based on evidence (M1 finding 4)

Today a deletion has no heard tokens, so it scores a flat `0.8 × audioQuality`, which is above the alert bar. The new score:

```
c = BASE['dropped-words'] (0.8)
  × neighbourConfidence      // mean confidence of up to 2 heard tokens each side that were committed as matches; 1 if none (start/end of run)
  × (busy ? 0.6 : 1)         // busy: another non-match op within 2 ops on either side
  × audioQuality
```

- **Alerts:** a `dropped-words` note may alert only if its run of deleted words contains ≥ 2 content words (non-function words). A single dropped content word can still be a `note`, but it is never an alert.
- **Split words:** before alignment, a heard token is split into two when it is an expected word in the window followed by the start of the next expected word. This is the "norhan" case: heard `norhan` against expected `nor hand`. The rule fires only when:
  - the token itself matches no window word;
  - the leftover is at least 2 letters; and
  - the leftover is a prefix of the next word's norm, or shares its primary sound key.

  The split happens before alignment because a probe showed the DP lays out `norhan` in more than one equally scored way, e.g. as an insertion plus two deletions. Patching it after alignment would miss some layouts.

### 5.2 Audio quality wired in

`setAudioQuality` exists but nothing calls it. New file `packages/asr/src/quality.ts`:

```ts
export class AudioQualityMeter {
  constructor(opts?: { windowSec?: number }); // default 10
  /** Feed stabilized words as they arrive. */
  push(words: HeardWord[]): void;
  /** Quality factor in [0.6, 1]: clamp((m - 0.3) / 0.5, 0.6, 1), m = mean word confidence over the trailing window; 1 before any words. */
  value(): number;
}
```

- The harness `runEngine` wires it as `recognizer.onWords → meter.push → aligner.setAudioQuality(meter.value())` before `aligner.push`. M3 will do the same.
- The mapping constants are starting values. Round 1 may tune them on the tuning seeds only.

### 5.3 Softer penalty on low-confidence wrong words (M1 finding 3)

In `makeNote`, the heard-confidence multiplier becomes a tunable floor:
- **For notes whose words include at least one content word:** `c *= f + (1 − f) × meanHeardConfidence`, where `f = AlignOptions.heardConfidenceFloor`.
- **For notes made up entirely of function words:** `c *= meanHeardConfidence`, unchanged. The existing `× 0.5` for all-function-word notes is also unchanged.

**The default is `f = 0`, which is today's behaviour.** Round 1 measures `f ∈ {0, 0.3, 0.6}` on the tuning seeds and keeps the value that best meets the solo targets. It judges false notes first, then recall.

**Why not ship 0.6 outright, as M1 proposed:** a probe while planning this pass showed the trade-off. Against the engine's own simulated-recognizer noise (`noise.property.test.ts`, 5–15% error, `LONG_SCENE`, 200 seeds), `f = 0.6` raised false notes from 0.1 to 2.8 per run (alerts unchanged at 0.025). It turns every low-confidence, dissimilar mishearing into a note. Whether real recognizer errors look like that is an empirical question, so the harness decides.

### 5.4 Cheap sound-alike fixes (M1 findings 1–2)

- **Letter agreement:** the 0.9 "sounds the same" score in `wordScore` also requires the normalized letter edit distance `lev(a, b) / max(|a|, |b|)` to be ≤ 0.4. Otherwise the pair falls through to the partial score. For example, sir/sorry is 3/5 = 0.6, so it is no longer a match.
- **Per-pair similarity downgrade:** the `SIMILAR_SUB_SCORE` downgrade (× 0.6) is applied per word pair, not to the whole group of adjacent substitutions.
- **Confidence condition:** the downgrade applies only when that pair's heard confidence is < 0.8. A similar-sounding but confidently heard substitution keeps its full score.
- **Group notes:** when a group mixes downgraded and full pairs, the group note's factor is the mean of its pairs' factors.

### 5.5 Normalization (M1 finding 7)

- **Rejoining split words:** before alignment, two adjacent heard tokens (gap ≤ 0.3 s) whose concatenated norms equal an expected word's norm in the current window are merged into one token (start of the first, end of the second, minimum confidence). The merge does not happen when the first token alone matches a window word at or before that position, because then the script really has two words. Examples: "any one" → "anyone", "to night" → "tonight", "can not" → "cannot".
- **Abbreviations** in expected and heard text:
  - Mr → mister, Mrs → missus, Dr → doctor.
  - St → saint when followed by a capitalized word, otherwise street.
- **Symbols:** `$n` → "n dollars", `n%` → "n percent", `&` → "and". Number words go through the existing numbers-to-words step.
- **Accents:** folded with NFD, removing combining marks (é → e, naïve → naive), on both sides before phonetic keys.

## 6. Round 1B — How the engine follows along (`packages/align/src/aligner.ts`)

### 6.1 Alerts only when anchored (M1 finding 5)

A `flag` gets `alert: true` only if, in addition to today's conditions, its region is **anchored**. Anchored means one of:
- **Before:** the 3 matched words immediately before the flagged region are consecutive script positions, and the last of them is on the note's own line. This is the mid-line case, which alerts at once.
- **After:** 3 consecutive script positions are matched after the region.

**Deferred alerts:** when an alert-eligible note is not anchored at commit time (typically an error at a line's start), its `flag` is emitted with `alert: false` and the note waits. As soon as the 3 most recent matches are consecutive and all lie after the region, the same note is flagged again with `alert: true`. A waiting note is dropped, never alerting, when:
- its line is reset by a backward jump;
- the aligner becomes lost;
- the note is downgraded as off-script (§6.2); or
- the run ends.

`AlignEvent` documents that a note may be flagged twice, first with `alert: false` and then once with `alert: true`.

**Why not let the previous line's tail anchor a line-start error:** a probe of the M1 chatter case ("Sorry, sorry, can we take…" before "I'm sorry for that…") at Patience 0 showed the chatter's first words are committed at the start of the next line, right after a cleanly matched line. Anchoring them by that line's tail would let those false alerts through.

### 6.2 Off-script talk becomes "check" (M1 finding 5)

- **Detection:** the aligner keeps a rolling record of every heard token that has been resolved: committed, or discarded while lost or re-anchoring. Each entry records whether the token was committed as a `match`. An **off-script run** is ≥ 4 consecutive resolved heard tokens with ≤ 1 match among them. Gaps of up to 1.0 s between tokens don't break a run.
- **Effect:** any note whose heard tokens fall inside an off-script run gets `status: 'check'` and `alert: false`.
  - Notes already emitted from earlier commits keep their emitted `flag`.
  - Their entries in line state are downgraded, so the finalized `lineDone` notes reflect the downgrade.
- **What it covers:** in director mode, chatter tails attached to a line. In solo mode, the actor's own asides (§4.3).

### 6.3 Safer backward jumps (M1 engine-change item 3)

- **Confirmation:** a re-anchor to a script position before the cursor (`c < cursor`) requires the same `FORWARD_CONFIRM_WORDS` (2) extra in-order matching words as a forward jump. Re-anchoring at the cursor (`c === cursor`) stays immediate.
- **Snapshot and restore:**
  - Before `resetFrom(c)`, the engine snapshots the state (resolution, notes, heard) and done-status of every line it is about to reset.
  - After a confirmed backward jump, a reset line counts as **reached** once the redo matches ≥ 1 of its words.
  - When the redo moves on (a forward jump, `finalize`, or the cursor passing the line), any reset line the redo never reached gets its snapshot back. Its earlier result is re-emitted as a `lineDone`, so the last-`lineDone`-wins contract still holds.
- **Unconfirmed jumps:** an unconfirmed backward candidate changes nothing.
- **Finished lines are never dropped:** a line finished earlier in the run never gets a `dropped-line` note from a later skip.

### 6.4 Instant Patience without misreading (M1 finding 6)

- **Lookahead re-alignment:** before `commit`, find the last block of non-match ops (containing ≥ 1 `sub`) before the confirming matches. Test whether that block's heard tokens, at least 2 of them, match in order and at `MATCH_THRESHOLD` the expected words starting at the first word of one of the next 2 lines.
  - **If they do:** the ops are rebuilt so that the expected words from the block's start up to that line's first word become `del` ops, and the heard words from the block onward are aligned again starting at that line. The rebuilt ops then go through the normal commit rule. The skipped line is then classified as a dropped line or a jumped cue, as usual.
  - **Why not wait for more words:** a probe on `LONG_SCENE` at Patience 0 (actor skips L8) showed that waiting for one more word does not help. The DP still prefers substitutions to a 17-word deletion, so the block must be re-aligned explicitly.
- **Line-end floor:** when the last committable op touches one of a line's final 2 expected words, `commitPoint` uses `max(confirmWords, 2)`. Elsewhere `confirmWords` is unchanged (`1 + round(3p)`), so mid-line errors at Patience 0 still commit after one word.
- **Timeouts:** `commitPointOnTimeout` is unchanged.

## 7. Round 1C — The recognizer wrapper (`packages/asr`)

### 7.1 A stabilizer measured in audio time (M1 recognizer finding, item 8)

The current `Stabilizer(2)` counts `update()` calls, which means one per `accept()` chunk, and always withholds the last word.

```ts
export class Stabilizer {
  constructor(opts?: { stableSec?: number }); // default 0.2
  /** words: current hypothesis for the segment; audioSec: total seconds fed to the recognizer so far. */
  update(words: RawWord[], endpoint: boolean, audioSec: number): HeardWord[];
}
```

- **Tracking:** for each hypothesis position, the stabilizer remembers the text and the `audioSec` at which that text first appeared there. A change of text resets the time.
- **Release rule:** word *i* is released in order once `audioSec − firstSeen[i] ≥ stableSec`.
- **The newest word** is released only when it also satisfies `audioSec − words[i].end ≥ stableSec`.
- **Endpoint:** releases every remaining word and resets, as today.
- **Wiring:** `NodeSherpaRecognizer` passes its `fedSec` as `audioSec`.
- **Interface:** `Recognizer` is unchanged.
- **Tuning:** round 1 tries `stableSec` ∈ {0.1, 0.2, 0.3} on the tuning seeds. It picks the smallest value whose `solo-close-mic` false-note rate is no higher than at 0.3.

## 8. Round 2 — Only if needed

Round 2 runs only if `solo-close-mic` misses any target on the held-out seeds after round 1. It includes **only** the items that the round-1 error attribution on the tuning seeds points to, and the results doc records the attribution behind each choice.

| Item | Chosen when |
|---|---|
| **Pronunciation-based similarity.** Ship CMUdict (public, BSD-style licence), compacted to ≤ 3 MB, as a data module of `packages/align`. Expected and heard words get phoneme sequences. Similarity becomes a phoneme edit distance with reduced costs for close phonemes (voiced/unvoiced pairs, neighbouring vowels). Two words sound alike when their phoneme strings are identical. Words missing from the dictionary fall back to today's double-metaphone key. | Sound-alike or mishearing errors drive the misses (false notes from misheard words, or missed planted wrong words scored as "similar") |
| **Threshold re-tuning:** `noteMinConfidence`, `alertMinConfidence`, `BASE_CONFIDENCE`, and the §5.2 mapping. Tuning seeds only. | Misses are near a threshold (notes or checks within ±0.1 of the cut-offs) |
| **Two-speed stabilizer:** a shorter span for words that can raise alerts, with retraction of alerts whose words later change. | Latency p50 is the only miss and it comes from the stabilizer |

After round 2 is measured on the held-out seeds, the pass ends.

## 9. Testing

- **Unit and scenario tests, written test-first, in `packages/align`** for every rule in §5–§6:
  - Each rule gets at least one positive and one negative scenario in the existing DSL.
  - The M1 final-review probe is included: perfect L1–L5, then a director note quoting "what I was playing", then L6–L7. It must produce 0 false alerts and 0 false notes.
  - Asides with and without a restart.
  - The "norhan" split word.
  - Patience 0 at line ends.
  - Sound-alike pairs on both sides of the letter-agreement bound.
- **Property tests:** the existing 5–15% recognizer-noise property tests stay, with their false-alert and false-note budgets, at the default options. If round 1 selects `heardConfidenceFloor > 0`, the property test also runs at that value, and any break in its note budget is reported in the results doc rather than hidden by changing the noise model.
- **`packages/asr`:** `Stabilizer` tests drive time explicitly, including the same audio fed in 0.1 s and in 8 ms chunks, which must release the same words at the same audio times (within one chunk). There are also `AudioQualityMeter` tests.
- **Harness:**
  - Tests for the render cache (hit, miss, key changes).
  - Solo run construction (expected words, cue silence durations, seeding independence).
  - Aside and sound-alike perturbations.
  - The §4.4 counting rules.
  - The `--modes` and `--seed-from` CLI options.
- **Existing tests:** all 238 stay green. A test whose expected value changes because of a deliberate rule change says so in its commit message.
- **Lint and typecheck stay clean.** The `packages/align` import boundary rule still holds; the CMUdict data module, if added, is plain TypeScript or JSON.

## 10. Deliverables

1. Branch `feat/engine-pass`, one commit series per section (§4, §5, §6, §7, then §8 if run), each with its tests.
2. `docs/engine-pass-results.md`, containing:
   - The Step 0 baseline.
   - For each round: the four solo targets on held-out seeds (pass or fail), the director conditions against baseline (worsening called out), and the error attribution on tuning seeds.
   - The `stableSec` choice.
   - An M3 GO or NO-GO. A NO-GO lists the options for the user to decide, such as bringing per-actor audio forward or accepting a named shortfall.
3. MVP spec updates:
   - §4.2: the `Stabilizer` is measured in audio seconds, and `AudioQualityMeter` is added.
   - §7: the rules in §5–§6.
   - §10: `solo-close-mic` is the M3 gate, and the conditions are renamed.
4. The memory note on M1/engine status is updated with the outcome.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Tuning to synthetic TTS rather than real voices | Held-out seeds. Rules are justified by named M1 failure cases, not by fitting curves. Real recordings remain the next validation step (MVP spec §10). |
| The evidence-based deletion score lowers dropped-words recall | Recall is measured per category every round. Round 2 threshold re-tuning is available. |
| Silent cue gaps are unrealistically clean | The room noise floor runs across the gaps. In M3, ignoring the mic during cues makes the real gap equally clean. |
| Releasing the newest word early produces words that later grow | The split-word reconciliation (§5.1) and stabilizer tuning (§7.1) measure and absorb this. |
| Off-script detection hides a real long paraphrase | Paraphrase is a whole-line classification in `finalizeLine` and is unaffected. Downgraded notes remain visible as checks. |
| The cache masks TTS variance, making one machine's numbers look more certain than they are | 30 seeds per scene. The results doc states that the numbers are per machine. |

## 8a. Round 2, re-scoped (user decision, 2026-10-10, after round 1)

Round 1 (docs/engine-pass-results.md, "Round 1") passed false alerts but missed false notes (10.76 per 10 min), core recall (0.49) and latency (1.09 s). The round-1 attribution on the tuning seeds found two causes that the §8 list does not address:

- **Fragment false notes.** 88% of solo false notes are single-word wrong-words where the heard word is a leading fragment of the scripted word ("cigar" for "cigarette"). The stabilizer released a word the recognizer was still extending; once released, the completed word is never re-emitted.
- **Recognizer confidence counted twice.** Notes with heard words already scale by heard-word confidence; the §5.2 audio-quality factor is derived from the same confidence and multiplies in again, pushing real errors below the 0.5 note threshold. Dropped-words notes stack the neighbour-confidence factor (§5.1) on top as well.

The homophone check found no homophone-spelling false notes, so the pronunciation dictionary (§8, Task 20) is not selected. The two-speed stabilizer is not selected (it needs its own spec).

**Round 2 therefore contains, in this order:**

1. **Fragment rule.** In `classifyOps`, a substitution pair whose heard word is a strict leading prefix of the expected word (both compared on letters only, heard ≥ 2 letters) is a likely recognizer truncation. It is classified as its own `wrong-words` note capped at `FRAGMENT_CAP = 0.45` (always a check) and marked quiet (never alerts). Other pairs in the same group are classified as before.
2. **Recognizer confidence counted once.** The audio-quality factor multiplies only notes that have no heard words and no other confidence evidence: `dropped-line`, `jumped-cue`, `called-for-line`. Notes with heard words use heard confidence only; `dropped-words` uses the §5.1 neighbour evidence only; the paraphrase note in `finalizeLine` uses mean heard confidence only. The meter stays wired in the harness.
3. **Re-sweep `stableSec`** ∈ {0.1, 0.2, 0.3} on the tuning seeds with the §7.1 rule, since the fragment rule changes the trade-off (lower `stableSec` lowers latency).
4. **Threshold re-tune** (§8 Task 19) on the tuning seeds.

Then the round-2 held-out measurement (Task 21) and the stop rule (§3) apply unchanged. Targets are unchanged.
