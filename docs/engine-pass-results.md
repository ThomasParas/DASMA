# DASMA — Engine-Change Pass Results

Spec: docs/superpowers/specs/2026-10-10-engine-pass-design.md · Numbers are per machine (TTS audio is cached per machine).

## Summary

- **Decision: M3 NO-GO.** Three of four solo targets fail after the two permitted rounds; no third round (spec §1, §3).
- **Solo close-mic, held-out seeds 11–30:** false alerts 0.211 per 10 min (≤ 1, PASS); false notes 1.604 (≤ 1, FAIL); core recall 0.313 (≥ 0.90, FAIL); alert latency p50 at Patience 0 1.035 s (< 0.5 s, FAIL).
- **Chosen defaults:** `stableSec` 0.3, `heardConfidenceFloor` 0, `noteMinConfidence` 0.65, `alertMinConfidence` 0.75.
- **Director conditions vs Step 0:** false alerts and false notes fall in every condition (far-field-hard 11.77 → 0.02 alerts, 11.65 → 0.07 notes per scene), but core recall falls in all (0.72 → 0.42, 0.70 → 0.33, 0.54 → 0.00), with more false checks and lower same-category rate.
- **Next step:** the user picks from the options at the end of "Round 2": accept a named shortfall, two-speed stabilizer spec, per-actor audio / real recordings, or a better recognizer or hotword biasing.

## Step 0 — baseline (engine unchanged since M1)

Config: scenes all (solo: earnest-act1, earnest-act1-cigarette, hamlet-to-be, romeo-balcony; director: earnest-act1, earnest-act1-cigarette, romeo-balcony only, hamlet-to-be is solo-only) · held-out seeds 11–30 · error rate 0.35 · benign rate 0.2 · model zipformer-en-2023-06-21.
Repeatability: two identical runs (earnest-act1 only, seeds 1–2, close-mic, solo+director) gave identical conditions (rtf excluded).

### solo-close-mic (the M3 gate)
| Target | Patience | Value | Required | Result |
|---|---|---|---|---|
| False alerts per 10 min | 0.5 | 4.77 | ≤ 1 | FAIL |
| False notes per 10 min | 0.5 | 9.58 | ≤ 1 | FAIL |
| Core recall | 0.5 | 0.728 | ≥ 0.90 | FAIL |
| Alert latency p50 | 0 | 1.154 s | < 0.5 s | FAIL |

140 runs, 237 min of audio, 454 planted errors. The Patience 0 run (same seeds) gave recall 0.764, 14.68 false alerts and 72.54 false notes per 10 min, latency p95 6.82 s; only its latency row is used above.

### Director conditions (tracked)
| Condition | False alerts / scene | False notes / scene | Core recall |
|---|---|---|---|
| director-close-mic | 1.367 | 3.017 | 0.722 |
| director-far-field | 2.283 | 4.233 | 0.701 |
| director-far-field-hard | 11.767 | 11.650 | 0.542 |

60 runs per condition (108.5 min of audio, 362 planted errors). Against the spec targets (≤ 1 alert, ≤ 2 notes per scene, recall ≥ 0.75), director-far-field and director-far-field-hard FAIL on all three; director-close-mic has no target row.

Comparison with M1 (docs/m1-results.md, per scene, patience 0.5) — **not directly comparable**: M1 counted false alarms differently, used 10 seeds on two scenes, and its numbers came from non-deterministic TTS audio.

| Condition | M1 false alerts | M1 false notes | M1 recall | Step 0 (above) |
|---|---|---|---|---|
| director-close-mic | 0.45 | 1.15 | 0.800 | 1.367 / 3.017 / 0.722 |
| director-far-field | 1.00 | 1.85 | 0.850 | 2.283 / 4.233 / 0.701 |
| director-far-field-hard | 5.15 | 4.80 | 0.600 | 11.767 / 11.650 / 0.542 |

### Where the solo false alarms come from (tuning seeds 1–10)
Output of `npx tsx harness/scripts/false-note-causes.ts harness/out/s0-tune/runs.json`, solo-close-mic section (the script prints one section per condition):

```
## solo-close-mic: 54 false notes
  buckets: {"on aside line":4,"recognizer only (clean neighbourhood)":30,"on stumble/long-pause line":14,"next to a planted error":6}
  17  recognizer only (clean neighbourhood) / dropped-words
      earnest-act1-cigarette#7 C16 note:dropped-words "Yes. But why does"->"" 0.8
      earnest-act1-cigarette#9 C20 note:dropped-words "who"->"" 0.8
      earnest-act1-cigarette#10 C10 note:dropped-words "one of"->"" 0.8
  9  recognizer only (clean neighbourhood) / added-words
      earnest-act1#3 E3 note:added-words ""->"any" 0.507
      earnest-act1#4 E10 note:added-words ""->"missed her" 0.541
      earnest-act1#5 E3 note:added-words ""->"any" 0.674
  5  on long-pause line / dropped-words
      earnest-act1-cigarette#1 C15 note:dropped-words "aunts"->"" 0.8
      earnest-act1-cigarette#1 C15 note:dropped-words "aunts"->"" 0.8
      romeo-balcony#7 R5 note:dropped-words "nor"->"" 0.8
  4  on stumble line / dropped-words
      earnest-act1#3 E7 note:dropped-words "sir"->"" 0.8
      earnest-act1#8 E5 note:dropped-words "sir"->"" 0.8
      earnest-act1#9 E5 note:dropped-words "sir"->"" 0.8
  3  recognizer only (clean neighbourhood) / wrong-words
      earnest-act1-cigarette#2 C6 note:wrong-words "inside"->"side" 0.503
      earnest-act1-cigarette#8 C23 note:wrong-words "Bunburyist"->"bumby" 0.529
      romeo-balcony#7 R8 note:wrong-words "my"->"thy" 0.586
  2  on aside line / wrong-words
      earnest-act1-cigarette#2 C4 note:wrong-words "offer"->"a" 0.548
      earnest-act1-cigarette#8 C24 note:wrong-words "meaning"->"me" 0.53
  2  on stumble line / paraphrase
      earnest-act1#5 E11 note:paraphrase "Yes, sir; eight bottles and a pint"->"yes sir take bottles in a pint" 0.554
      romeo-balcony#3 R11 note:paraphrase "Neither, fair saint, if either thee dislike"->"neither neither fair sight of either of thee dislike" 0.645
  2  adjacent to dropped-line / dropped-words
      romeo-balcony#3 R4 note:dropped-words "is my enemy; thou art thyself, though not a Montague"->"" 0.8
      romeo-balcony#3 R6 note:dropped-words "O, be some other name! What's in a name? That"->"" 0.8
  1  on aside line / dropped-words
      earnest-act1-cigarette#9 C23 note:dropped-words "Bunburyist"->"" 0.8
  1  adjacent to dropped-line / dropped-line
      hamlet-to-be#3 H3 note:dropped-line "To die, to sleep, no more; and by a sleep to say we end the heartache and the thousand natural shocks that flesh is heir to"->"" 0.95
  1  on stumble line / dropped-line
      hamlet-to-be#3 H4 note:dropped-line "It is a consummation devoutly to be wished"->"" 0.95
  1  adjacent to transposed / dropped-line
      hamlet-to-be#3 H5 note:dropped-line "To die, to sleep; to sleep, perchance to dream; ay, there's the rub, for in that sleep of death what dreams may come, when we have shuffled off this mortal coil, must give us pause"->"" 0.95
  1  adjacent to added-words / added-words
      hamlet-to-be#3 H8 note:added-words ""->"t" 0.561
  1  on long-pause line / wrong-words
      hamlet-to-be#6 H6 note:wrong-words "There's"->"does" 0.539
  1  on aside line / added-words
      hamlet-to-be#9 H6 note:added-words ""->"sorry" 0.602
  1  adjacent to dropped-words / wrong-words
      hamlet-to-be#10 H8 note:wrong-words "ills"->"s" 0.632
  1  on stumble line / wrong-words
      romeo-balcony#4 R8 note:wrong-words "thus"->"best" 0.588
  1  recognizer only (clean neighbourhood) / paraphrase
      romeo-balcony#5 R11 note:paraphrase "Neither, fair saint, if either thee dislike"->"neither fair sight of either of thee dislike" 0.61
```

## Round 1 — engine changes, tuned on seeds 1–10, measured on held-out seeds 11–30

Engine state: the round-1 commits on `feat/engine-pass` (aligner changes in §5–§6 of the spec plus the seconds-based stabilizer) and the two tuned defaults below. Same config as Step 0 (all scenes, error rate 0.35, benign rate 0.2, model zipformer-en-2023-06-21). Held-out runs: `harness/out/r1-gate` (all conditions, Patience 0.5), `harness/out/r1-gate-p0` (solo close-mic, Patience 0). Re-running with the same arguments reproduced identical numbers (`r1-stable-0.3` and `r1-floor-0` are the same configuration and gave identical rows).

### Tuning, seeds 1–10, solo close-mic (70 runs, 119.7 min, 192 planted errors)

`--stable-sec` sweep (rule, spec §7.1: the smallest `s` whose false notes per 10 min at Patience 0.5 is ≤ the value at 0.3). Latency p50 is from the Patience-0 run of the same `s`.

| s | False notes /10 min (P0.5) | False alerts /10 min (P0.5) | Core recall (P0.5) | Latency p50, s (P0) |
|---|---|---|---|---|
| 0.1 | 32.000 | 1.671 | 0.529 | 1.096 |
| 0.2 | 32.167 | 1.671 | 0.529 | 1.357 |
| 0.3 | 12.616 | 0.919 | 0.471 | 1.457 |

Only 0.3 satisfies the rule (0.1 and 0.2 are both far above it), so **`stableSec` = 0.3** (was 0.2). The sweep is monotone and 0.3 is the edge of it; see "Round-2 candidate" below.

`--heard-floor` sweep at `s` = 0.3 (rule, spec §5.3: the floor that passes the most of the three Patience-0.5 solo targets: false alerts ≤ 1, false notes ≤ 1, core recall ≥ 0.90):

| f | False alerts /10 min | False notes /10 min | Core recall | Targets passed (of 3) |
|---|---|---|---|---|
| 0 | 0.919 | 12.616 | 0.471 | 1 (false alerts) |
| 0.3 | 1.504 | 15.123 | 0.558 | 0 |
| 0.6 | 3.091 | 19.551 | 0.587 | 0 |

**`heardConfidenceFloor` = 0** (unchanged), so no noise-property test was added. Floor above 0 buys recall (0.47 → 0.59) at the price of false alerts and false notes, and neither is close to its target.

Defaults changed: `Stabilizer` and the CLI `--stable-sec` default 0.2 → 0.3, and the `cli-args` defaults test (commit `7ca1c2e`). Any recognizer built on `Stabilizer` takes the new default.

### Solo targets on held-out seeds 11–30 (solo close-mic, 140 runs, 237.0 min, 454 planted errors)

| Target | Patience | Step 0 | Round 1 | Required | Result |
|---|---|---|---|---|---|
| False alerts per 10 min | 0.5 | 4.77 | 0.633 | ≤ 1 | PASS |
| False notes per 10 min | 0.5 | 9.58 | 10.761 | ≤ 1 | FAIL |
| Core recall | 0.5 | 0.728 | 0.492 | ≥ 0.90 | FAIL |
| Alert latency p50 | 0 | 1.154 s | 1.087 s | < 0.5 s | FAIL |

Patience 0 (reported, not gated): false alerts 14.68 → 0.675 per 10 min, false notes 72.54 → 10.634 per 10 min, core recall 0.764 → 0.354, latency p95 6.82 s → 6.93 s.

Other solo close-mic metrics, Step 0 → round 1: recall 0.758 → 0.533; recall counting checks 0.927 → 0.943; false checks per run 4.27 → 6.62; same-category rate 0.623 → 0.425; benign violations per run 0.207 → 0.329; latency p95 (P0.5) 9.16 s → 6.72 s.

Sound-alike detection rate (`soundAlikeRecall`, 33 planted sound-alikes), solo close-mic only: 0.091 (3) → 0.303 (10). It fell in the far-field rooms (see the worsenings list below).

| Category | Planted | Step 0 detected | Round 1 detected |
|---|---|---|---|
| dropped-words | 82 | 68 | 29 |
| transposed | 56 | 45 | 25 |
| added-words | 63 | 44 | 26 |
| wrong-words | 87 | 43 | 38 |
| dropped-line | 77 | 68 | 54 |
| called-for-line | 61 | 50 | 48 |
| paraphrase | 28 | 26 | 22 |

Round 1 did what the spec expected for false alerts (−87%, now passing) and for the Patience-0 false-alarm rates, and it moved sound-alike detection from 9% to 30%. It did not help the false-note count at Patience 0.5, and it cost a lot of recall (below).

### Director conditions against the Step 0 baseline (per scene, Patience 0.5, 60 runs per condition)

| Condition | False alerts / scene | False notes / scene | Core recall |
|---|---|---|---|
| director-close-mic | 1.367 → 0.117 | 3.017 → 2.867 | 0.722 → **0.514** |
| director-far-field | 2.283 → 0.050 | 4.233 → 1.583 | 0.701 → **0.403** |
| director-far-field-hard | 11.767 → 0 | 11.650 → 0.417 | 0.542 → **0.188** |

Against the spec targets (≤ 1 alert, ≤ 2 notes per scene, recall ≥ 0.75): director-far-field and director-far-field-hard now pass the alert and note targets, and still fail recall. The same comparison for the solo far-field rooms: solo-far-field core recall 0.715 → 0.301, solo-far-field-hard 0.585 → 0.138, with false alerts and false notes down in both.

**Worsenings (reported, not blocking, spec §1).** `gate` exits FAIL, and every line of it is core recall: all three director conditions and all three solo conditions are below baseline. Every worsening against the Step 0 baseline (held-out seeds, `r1-gate` vs `s0-gate`):

- Core recall fell in all six conditions (figures above and in the solo far-field line above).
- Overall recall fell in every condition: solo close-mic 0.758 → 0.533, solo far-field 0.709 → 0.315, solo far-field-hard 0.548 → 0.101, director close-mic 0.776 → 0.594, director far-field 0.710 → 0.373, director far-field-hard 0.583 → 0.102.
- Same-category rate fell in every condition: solo 0.623 → 0.425, 0.529 → 0.231, 0.256 → 0.097; director 0.649 → 0.503, 0.522 → 0.312, 0.224 → 0.083 (close-mic, far-field, far-field-hard).
- Sound-alike recall fell in the far-field rooms: solo-far-field 0.182 → 0.152, solo-far-field-hard 0.394 → 0, director-far-field 0.276 → 0.103, director-far-field-hard 0.310 → 0.034. The gain 0.091 → 0.303 is solo close-mic only (director-close-mic also rose, 0.103 → 0.172).
- False notes per 10 min rose in solo close-mic, 9.58 → 10.761 (1.621 → 1.821 per run); the gate passes it only because it is within its tolerance. All other conditions' false notes fell or held (director-close-mic 3.017 → 2.867 per scene). False alerts fell in every condition.
- False checks per run rose in every room: solo 4.27 → 6.62, 8.75 → 11.42, 17.8 → 21.7; director 7.75 → 12.28, 17.0 → 22.8, 31.9 → 42.1 (close-mic, far-field, far-field-hard).
- Benign violations per run rose in solo close-mic (0.207 → 0.329) and director-close-mic (0.45 → 0.65).
- Latency p50: solo-far-field-hard 2.50 s → 5.99 s; director-far-field-hard has no alerts at all now, so its latency is undefined (was 3.06 s).

Cause (from the Step 5 attribution on tuning seeds, and the same classification on the held-out director-far-field-hard runs): the recall loss is the note threshold, not missed detection. Recall counting checks rose or held in every condition (director-close-mic 0.923 → 0.948, far-field 0.931 → 0.953, far-field-hard 0.765 → 0.801). Missed core labels are almost all checks whose confidence is under 0.5. Mean word confidence is about 0.73 close-mic, 0.68 far-field, 0.46–0.50 far-field-hard, so the audio-quality factor is about 0.86, 0.75 and 0.60. A wrong-words note is 0.85 × (mean heard-word confidence) × (audio quality) ≈ 0.53 close-mic before any similarity downgrade, ≈ 0.25 in far-field-hard. Both factors come from the same recognizer confidence, so a low-confidence stretch is penalised twice. A dropped-words note is 0.8 × (neighbour confidence) × 0.6 if a mismatch is adjacent × audio quality, which lands near or below 0.5 (these two products are arithmetic from `classify.ts`, not separately measured). In far-field-hard 67 of 144 core labels are checks with confidence under 0.30 and 28 produced no note or check at all.

### Where the solo false notes and misses come from (tuning seeds 1–10, Step 5)

The held-out breakdowns quoted in this section (the far-field-hard and 246-label miss counts) are explanatory only; nothing was chosen from them.

Commands: `npx tsx harness/scripts/false-note-causes.ts harness/out/r1-tune/runs.json -v` and `label-outcomes.ts … --misses`. Output saved as `harness/out/r1-tune-causes.txt` and `r1-tune-outcomes.txt`. Extra counting (not part of the committed scripts) was done with throw-away scripts outside the repo. The false-note counts below follow the script's rule (status `note` on a line with no planted error), so they are lower than the `falseNotes` metric, which also counts surplus notes on lines with planted errors. Step 0's 54 used the same rule.

```
## solo-close-mic: 126 false notes   (Step 0: 54)
  buckets: {"on aside line":11,"on stumble/long-pause line":27,"recognizer only (clean neighbourhood)":76,"next to a planted error":12}
  74  recognizer only (clean neighbourhood) / wrong-words
      earnest-act1-cigarette#1 C16 note:wrong-words "dear"->"de" 0.713
      earnest-act1-cigarette#9 C10 note:wrong-words "cigarette"->"cigar" 0.702
      earnest-act1#5 E12 note:wrong-words "invariably"->"in" 0.769
  19  on long-pause line / wrong-words      (e.g. "account"->"accoun", "cards"->"car")
  11  on aside line / wrong-words           (e.g. "simply"->"sim", "contumely"->"con")
   6  on stumble line / wrong-words
   5  adjacent to dropped-line / wrong-words
   5  adjacent to dropped-words / wrong-words
   6  other (1–1 each: dropped-words, paraphrase, …)
```

**False notes: one cause dominates.** In solo close-mic 111 of the 126 false notes (88%) are a single-word `wrong-words` note whose heard word is a leading fragment of the scripted word ("cigar" for "cigarette", "de" for "dear", "ex" for "expression"). The same holds in the other conditions: 58 of 71 (solo far-field), 69 of 82 (director close-mic), 43 of 49 (director far-field). Of the 38 solo close-mic false notes on benign lines (stumble, long pause, aside), 32 are fragments. The stabilizer releases a word the recognizer is still extending, and 0.3 s without a change does not cover it. The effect of `s` fits this: false notes per 10 min go 32.0, 32.2, 12.6 for s = 0.1, 0.2, 0.3.

Round-2 candidate (information only; the committed default is unchanged, chosen by the rule on {0.1, 0.2, 0.3}): two further tuning-seed runs at Patience 0.5, solo close-mic, outside the specified sweep:

| s | False notes /10 min | False alerts /10 min | Core recall | Latency p50 (P0.5), s |
|---|---|---|---|---|
| 0.3 (committed) | 12.616 | 0.919 | 0.471 | 1.478 |
| 0.4 | 2.005 | 0.167 | 0.442 | 1.557 |
| 0.5 | 2.005 | 0.167 | 0.442 | 1.657 |

Raising the hold to 0.4 s would cut false notes six-fold on tuning seeds for 0.03 of core recall and about 0.08 s of latency; it does not reach the ≤ 1 target by itself. Not measured on held-out seeds: this candidate rests on tuning seeds alone.

**Missed core labels (solo close-mic, tuning seeds: 104 core labels, 49 detected, 55 missed):**

| Why missed | Count |
|---|---|
| a check of the right category exists, confidence 0.40–0.50 | 14 |
| a check of the right category exists, confidence 0.30–0.40 | 11 |
| a check of the right category exists, confidence under 0.30 | 13 |
| only checks of another category | 4 |
| no note or check at all | 13 |

By kind: dropped-words 19 of 29 missed (all checks), wrong-words 28 of 44 (19 checks, 9 nothing), dropped-line 8 of 31 (4 checks, 4 nothing). The held-out runs have the same shape (246 core labels in `r1-gate`: 121 detected, 87 right-category checks, 15 other-category checks only, 23 nothing).

- **Confidence arithmetic (42 of 55 misses are checks under 0.5, 38 of them of the right category):** the double penalty described above, plus the 0.6 similar-sounding downgrade on substitutions. 14 of them are within 0.1 of the threshold.
- **Recognizer snaps to the scripted word (13 "nothing" cases):** 8 of the 9 wrong-words "nothing" cases are the planted sound-alike "sir" → "sore" ("Yes, sore."), which the recognizer writes as "sir" (spoken "Yes, sore." heard "YES SIR"); the 4 dropped-line cases are all in earnest-act1's "Yes, sir" exchange (E5, E9), where the recognizer heard the next line and the aligner raised nothing (cause not traced). The "sir"/"sore" cases are invisible to the aligner.

**Requested extra counts (solo close-mic, tuning seeds unless noted):**

(i) Homophones with different spelling. False notes involving such a pair: 0 of 126. Missed labels with a homophone pair in a note on the line: 1 (to/too on a transposed label); the other solo and director conditions give 0 to 3 each (eight/ate, night/knight, no/know, to/too). Direct scan of the heard stream: 11 of 786 spoken segments contain a homophone-spelled word in place of the script word (too/two 2, eight/ate 2, counsel/council 2, one each of to/too, of/off, know/no, night/knight, no/know), and none of them produced a false note. The list is a hand-made set of about 190 groups, so these are lower bounds. On this evidence a pronunciation dictionary for homophones would not move any target.

(ii) False notes from a director quote that stops mid-line (director-close-mic / director-far-field): the notes on lines that follow a "Go back to '…'" quote are 6 and 1 in the loose count, but 4 and 1 of those are the fragment pattern above. Left over: 2 `jumped-cue` notes in director-close-mic (earnest-act1-cigarette#8 C18 and romeo-balcony#8 R7, each on the line right after a quote) and 0 in director-far-field. 0 false notes sit on the quoted earlier line itself. This pattern is consistent with the known residual but I did not trace those two runs to confirm the mechanism. It is 2 of 82 and 0 of 49 false notes.

(iii) Notes from single-word commits fired by the 0.4 s timeout at Patience 0. Method: re-ran all 70 solo close-mic tuning-seed runs through a copy of `runEngine` with a wrapper that records, for each event, whether it was emitted inside `tick`, inside `push` (a heard word) or in `finalize`, and the number of words fed since the last committing call; the origin of a note is the phase of its first `flag` event. A second pass with `tick` never called measures what the timeout contributes. Counting the same way as the cause script (notes with status `note` on lines with no planted error): 122 false notes (10.2 per 10 min). 106 (87%) were first flagged inside a timeout commit, 12 on a heard word, 4 had no flag event. Of the 106, all had at most one word pending (70 with the leftover word of the previous commit, 36 with a lone newly heard word), and 105 are `wrong-words` fragments. Of all 253 notes standing at the end, 163 (64%) came from timeout commits and 17 had no flag event. Without the timeout, false notes are 126 instead of 122 and detections 103 instead of 97 of 192, so the timeout fires the fragment notes but does not create them: the next word or the end of the run commits the same word. The cause is the fragment, not the timeout. The "pending" count is an approximation (it resets after any committing call and cannot see leftover words), so treat the 36/70 split as approximate and the 106 as exact.

### Decision

Targets missed: false notes per 10 min (10.761 vs ≤ 1), core recall (0.492 vs ≥ 0.90), alert latency p50 at Patience 0 (1.087 s vs < 0.5 s) → Round 2 (Task 18). Only the false-alerts target passes (0.633 vs ≤ 1).

Inputs for round 2, from the attribution: (1) the stabilizer fragment problem accounts for about 88% of solo false notes, and a longer hold (0.4 s on tuning seeds) removes most of them; (2) recall is limited by note confidence (double penalty from heard-word confidence and the audio-quality factor, the similarity downgrade, and the dropped-word evidence factor), with 42 of 55 misses being checks under 0.5 (the other 13 raise nothing, mostly the "sir"/"sore" sound-alike); (3) homophones are not a measurable cause, so no pronunciation dictionary is needed for them; (4) the director quote residual is small (2 notes in 40 runs).

## Round 2 — fragment rule, confidence counted once, re-tuned on seeds 1–10, measured on held-out seeds 11–30

Engine state: `feat/engine-pass` at `f40124d`. Same config as Step 0 and Round 1 (all scenes, error rate 0.35, benign rate 0.2, model zipformer-en-2023-06-21). Held-out runs: `harness/out/r2-gate` (all six conditions, Patience 0.5), `harness/out/r2-gate-p0` (solo close-mic, Patience 0), gate comparison in `harness/out/r2-gate-compare.log`. Defaults in force: `stableSec` 0.3, `heardConfidenceFloor` 0, `noteMinConfidence` 0.65, `alertMinConfidence` 0.75.

### Changes made in round 2 (spec §8a)

Selected by the Round 1 attribution (88% of solo false notes were leading-fragment wrong-words; recognizer confidence was counted twice). The pronunciation dictionary and the two-speed stabilizer were not selected.

1. **Fragment rule** (`d41cd9f`, `classifyOps`): a substitution pair whose heard word is a strict leading prefix of the expected word (letters only, heard ≥ 2 letters) is classified as its own `wrong-words` note capped at 0.45 (always a check) and marked quiet (never alerts). Other pairs in the group are classified as before.
2. **Recognizer confidence counted once** (`d41cd9f`): the audio-quality factor now multiplies only notes with no heard words and no other confidence evidence (`dropped-line`, `jumped-cue`, `called-for-line`). Notes with heard words use heard confidence only; `dropped-words` uses the neighbour evidence only; the paraphrase note uses mean heard confidence only. Two existing tests changed expectation deliberately (named in the commit message): `classify.test.ts` 'poor audio quality turns a note into a check' (replaced by 'poor audio quality turns a dropped line into a check') and the `run-engine.test.ts` meter test (now expects 0.85 × 0.55 with no meter factor).
3. **`stableSec` re-sweep** (tuning seeds): rule unchanged, 0.3 kept.
4. **Threshold re-tune** (`df99e0a` adds `--note-min` / `--alert-min`; `f40124d` sets the values): `noteMin` 0.5 → 0.65, `alertMin` 0.75 (unchanged value, now explicit).

### Tuning, seeds 1–10, solo close-mic (70 runs, 119.7 min, 192 planted errors; tables copied from the `f40124d` commit message)

`--stable-sec` re-sweep with the round-2 engine (rule, spec §7.1: smallest `s` whose false notes at Patience 0.5 is ≤ the value at 0.3). These runs used the thresholds in force before the re-tune (noteMin 0.5; the 0.3 / P0.5 row equals the noteMin 0.5, alertMin 0.75 row of the grid below).

| stableSec | Patience | False alerts /10 min | False notes /10 min | Core recall | Targets passed (of 3) | Latency p50, s |
|---|---|---|---|---|---|---|
| 0.1 | 0.5 | 0.33 | 6.60 | 0.510 | 1 | 1.50 |
| 0.1 | 0 | 0.58 | 10.19 | 0.462 | 1 | 0.94 |
| 0.2 | 0.5 | 0.33 | 6.60 | 0.510 | 1 | 1.60 |
| 0.2 | 0 | 0.58 | 10.53 | 0.481 | 1 | 0.96 |
| 0.3 | 0.5 | 0.25 | 4.43 | 0.548 | 1 | 1.33 |
| 0.3 | 0 | 0.84 | 6.68 | 0.490 | 1 | 1.17 |

0.1 and 0.2 give 6.60 false notes, above the 4.43 at 0.3, so **`stableSec` = 0.3** stays. No `align` test expectation changed.

Threshold grid at Patience 0.5, `stableSec` 0.3. Targets: false alerts ≤ 1, false notes ≤ 1, core recall ≥ 0.90 per 10 min. Every pair passes exactly 1 of 3 (false alerts). `alertMin` does not affect notes or recall, only false alerts. Rule: most targets passed, then lower false notes, then higher core recall, then closest to (0.5, 0.75), which gives **noteMin 0.65, alertMin 0.75**.

| noteMin | alertMin | False alerts /10 min | False notes /10 min | Core recall | Targets passed (of 3) |
|---|---|---|---|---|---|
| 0.45 | 0.7 | 0.58 | 33.67 | 0.712 | 1 |
| 0.45 | 0.75 | 0.25 | 33.67 | 0.712 | 1 |
| 0.45 | 0.8 | 0.17 | 33.67 | 0.712 | 1 |
| 0.45 | 0.85 | 0.00 | 33.67 | 0.712 | 1 |
| 0.45 | 0.9 | 0.00 | 33.67 | 0.712 | 1 |
| 0.5 | 0.7 | 0.58 | 4.43 | 0.548 | 1 |
| 0.5 | 0.75 | 0.25 | 4.43 | 0.548 | 1 |
| 0.5 | 0.8 | 0.17 | 4.43 | 0.548 | 1 |
| 0.5 | 0.85 | 0.00 | 4.43 | 0.548 | 1 |
| 0.5 | 0.9 | 0.00 | 4.43 | 0.548 | 1 |
| 0.55 | 0.7 | 0.58 | 2.92 | 0.481 | 1 |
| 0.55 | 0.75 | 0.25 | 2.92 | 0.481 | 1 |
| 0.55 | 0.8 | 0.17 | 2.92 | 0.481 | 1 |
| 0.55 | 0.85 | 0.00 | 2.92 | 0.481 | 1 |
| 0.55 | 0.9 | 0.00 | 2.92 | 0.481 | 1 |
| 0.6 | 0.7 | 0.58 | 2.09 | 0.404 | 1 |
| 0.6 | 0.75 | 0.25 | 2.09 | 0.404 | 1 |
| 0.6 | 0.8 | 0.17 | 2.09 | 0.404 | 1 |
| 0.6 | 0.85 | 0.00 | 2.09 | 0.404 | 1 |
| 0.6 | 0.9 | 0.00 | 2.09 | 0.404 | 1 |
| 0.65 | 0.7 | 0.58 | 1.25 | 0.337 | 1 |
| 0.65 | 0.75 | 0.25 | 1.25 | 0.337 | 1 |
| 0.65 | 0.8 | 0.17 | 1.25 | 0.337 | 1 |
| 0.65 | 0.85 | 0.00 | 1.25 | 0.337 | 1 |
| 0.65 | 0.9 | 0.00 | 1.25 | 0.337 | 1 |

The grid shows the structure of the problem: false notes fall as `noteMin` rises (33.67 → 1.25) and so does core recall (0.712 → 0.337). On the tuning seeds, no `noteMin` in 0.45–0.65 passes both, and the ≤ 1 false-note target is only approached at the top of the range, where recall is about a third.

### Solo targets on held-out seeds 11–30 (solo close-mic, 140 runs, 237.0 min, 454 planted errors)

| Target | Patience | Step 0 | Round 1 | Round 2 | Required | Result |
|---|---|---|---|---|---|---|
| False alerts per 10 min | 0.5 | 4.77 | 0.633 | **0.211** | ≤ 1 | PASS |
| False notes per 10 min | 0.5 | 9.58 | 10.761 | **1.604** | ≤ 1 | FAIL (0.604 over) |
| Core recall | 0.5 | 0.728 | 0.492 | **0.313** | ≥ 0.90 | FAIL (0.587 short) |
| Alert latency p50 | 0 | 1.154 s | 1.087 s | **1.035 s** | < 0.5 s | FAIL (0.535 s over) |

Round 2 against Round 1: false alerts 0.633 → 0.211 (better), false notes 10.761 → 1.604 (−85%, still above target), core recall 0.492 → 0.313 (worse), latency p50 1.087 → 1.035 s (barely moved). Only the false-alerts target passes.

Patience 0 (reported, not gated; `r2-gate-p0`): false alerts 14.68 → 0.675 → **0.591** per 10 min, false notes 72.54 → 10.634 → **1.815** per 10 min, core recall 0.764 → 0.354 → **0.175**, latency p95 6.82 s → 6.93 s → 6.93 s.

Other solo close-mic metrics, Step 0 → Round 1 → Round 2: recall 0.758 → 0.533 → 0.311; recall counting checks 0.927 → 0.943 → 0.943; false checks per run 4.27 → 6.62 → 8.16; same-category rate 0.623 → 0.425 → 0.253; benign violations per run 0.207 → 0.329 → 0.036; latency p95 (P0.5) 9.16 s → 6.72 s → 6.93 s; latency p50 (P0.5) 1.704 s → 1.540 s → 1.519 s.

Sound-alike detection rate (`soundAlikeRecall`, 33 planted sound-alikes), solo close-mic: 0.091 (3) → 0.303 (10) → 0.091 (3).

| Category | Planted | Step 0 detected | Round 1 detected | Round 2 detected |
|---|---|---|---|---|
| dropped-words | 82 | 68 | 29 | 10 |
| transposed | 56 | 45 | 25 | 4 |
| added-words | 63 | 44 | 26 | 8 |
| wrong-words | 87 | 43 | 38 | 18 |
| dropped-line | 77 | 68 | 54 | 49 |
| called-for-line | 61 | 50 | 48 | 35 |
| paraphrase | 28 | 26 | 22 | 17 |

What happened: false notes fell by the amount the attribution predicted (the fragment rule plus the higher note bar), but the recognizer finds almost every error and the engine now shows it as a quiet check rather than a note. Recall counting checks is 0.943 in solo close-mic, while recall counting notes only is 0.311. False checks are 8.16 per run, about 48 per 10 min (arithmetic from the run totals), so the check channel holds the detections and is noisy. Arithmetic from the scoring rules (not separately measured): a wrong-words note is 0.85 × mean heard-word confidence, and mean word confidence close-mic is about 0.73, so a typical real error scores about 0.62 before any similarity downgrade, just under the 0.65 `noteMin`. That is why lowering `noteMin` buys recall and false notes together (below).

#### Trade-off point, not a tuning input

One extra run, solo close-mic, held-out seeds, Patience 0.5, `--note-min 0.5` (`harness/out/r2-gate-note050`). It is reported only to show the trade-off; the committed default is unchanged, and nothing was chosen from held-out seeds.

| noteMin | False alerts /10 min | False notes /10 min | Core recall | Recall counting checks | False checks / run |
|---|---|---|---|---|---|
| 0.65 (committed) | 0.211 | 1.604 | 0.313 | 0.943 | 8.16 |
| 0.5 (trade-off point) | 0.211 | 4.178 | 0.533 | 0.943 | 7.92 |

Lowering `noteMin` from 0.65 to 0.5 adds 0.220 core recall for 2.57 extra false notes per 10 min; neither point passes both. The held-out figures agree with the tuning-seed grid (0.65: 1.25 / 0.337; 0.5: 4.43 / 0.548).

### Director conditions against the Step 0 baseline (per scene, Patience 0.5, 60 runs per condition; Step 0 → Round 1 → Round 2)

| Condition | False alerts / scene | False notes / scene | Core recall |
|---|---|---|---|
| director-close-mic | 1.367 → 0.117 → 0.117 | 3.017 → 2.867 → 0.450 | 0.722 → 0.514 → **0.417** |
| director-far-field | 2.283 → 0.050 → 0.100 | 4.233 → 1.583 → 0.267 | 0.701 → 0.403 → **0.333** |
| director-far-field-hard | 11.767 → 0 → 0.017 | 11.650 → 0.417 → 0.067 | 0.542 → 0.188 → **0.000** |

Against the spec targets (≤ 1 alert, ≤ 2 notes per scene, recall ≥ 0.75): director-far-field and director-far-field-hard pass the alert and note targets and fail recall (0.333 and 0.000). director-close-mic has no target row. The solo far-field rooms behave the same way: solo-far-field false alerts 7.17 → 0.084 and false notes 12.49 → 1.139 per 10 min, core recall 0.715 → 0.220; solo-far-field-hard false alerts 27.98 → 0.042 and false notes 29.62 → 0.380 per 10 min, core recall 0.585 → 0.045.

**Every worsening against the Step 0 baseline** (held-out seeds, `r2-gate` vs `s0-gate`; `gate` exits FAIL and every FAIL line is core recall, all six conditions):

- **Core recall** fell in all six conditions: solo close-mic 0.728 → 0.313, solo far-field 0.715 → 0.220, solo far-field-hard 0.585 → 0.045; director close-mic 0.722 → 0.417, far-field 0.701 → 0.333, far-field-hard 0.542 → 0.000.
- **Overall recall** fell in all six: solo 0.758 → 0.311, 0.709 → 0.196, 0.548 → 0.040; director 0.776 → 0.343, 0.710 → 0.196, 0.583 → 0.008 (close-mic, far-field, far-field-hard).
- **Same-category rate** fell in all six: solo 0.623 → 0.253, 0.529 → 0.148, 0.256 → 0.024; director 0.649 → 0.298, 0.522 → 0.171, 0.224 → 0.003.
- **Sound-alike recall** fell or held: solo close-mic 0.091 → 0.091 (equal; it was 0.303 in round 1), solo far-field 0.182 → 0, solo far-field-hard 0.394 → 0, director close-mic 0.103 → 0.069, director far-field 0.276 → 0.069, director far-field-hard 0.310 → 0.
- **False checks per run** rose in all six: solo 4.27 → 8.16, 8.75 → 12.74, 17.81 → 22.52; director 7.75 → 14.48, 17.03 → 24.75, 31.88 → 43.90.
- **Latency:** solo far-field p95 7.24 s → 8.56 s (worse); director-far-field-hard has no measurable alert latency any more (p50 was 3.06 s, p95 11.66 s; the condition raises one alert in 60 runs, and it is not a detection). Solo close-mic, director close-mic and director far-field p50 and p95 improved, as did solo far-field-hard p50 (2.50 s → 2.38 s) and p95 (13.21 s → 6.72 s).
- **False alerts, false notes and benign violations** did not worsen against Step 0 in any condition (false alerts per run: solo 0.807 → 0.036, 1.214 → 0.014, 4.736 → 0.007; director 1.367 → 0.117, 2.283 → 0.100, 11.767 → 0.017. Benign violations per run fell in all six).
- **Recall counting checks** rose in all six (solo close-mic 0.927 → 0.943, far-field 0.947 → 0.949, far-field-hard 0.808 → 0.813; director 0.923 → 0.948, 0.931 → 0.953, 0.765 → 0.801).

**Also worse than Round 1** (so these are costs of round 2 specifically): core and overall recall, same-category rate and false checks per run in all six conditions; sound-alike recall in solo close-mic (0.303 → 0.091), solo far-field (0.152 → 0), director close-mic (0.172 → 0.069), director far-field (0.103 → 0.069), director far-field-hard (0.034 → 0); false alerts per run in solo far-field-hard (0 → 0.007, 0.042 per 10 min; benign violations 0 → 0.014), director far-field (0.050 → 0.100) and director far-field-hard (0 → 0.017); latency p95 in solo close-mic (6.72 → 6.93 s) and solo far-field (4.91 → 8.56 s); latency p50 in director far-field (1.265 → 1.285 s). The false-alert rises are one to six alerts across 60 or 140 runs, so they are noise-sized.

### Decision: M3 NO-GO

Solo close-mic after the two permitted rounds: false alerts 0.211 per 10 min (≤ 1, PASS), false notes 1.604 per 10 min (≤ 1, FAIL, 0.604 over), core recall 0.313 (≥ 0.90, FAIL, 0.587 short), alert latency p50 at Patience 0 1.035 s (< 0.5 s, FAIL, 0.535 s over). Three of four targets fail, so the rule in the pass spec (§1, §3) gives **NO-GO**. Targets are not loosened and there is no third round; the pass stops here.

Options for the user (these need a decision and, except (a), a new spec):

- **(a) Accept a named shortfall and start M3 anyway.** False notes are the nearest miss: 1.604 vs ≤ 1 is about one stray note per 6 minutes of rehearsal. Core recall and latency are not near: at 0.313, roughly two of three planted dropped-word, wrong-word and dropped-line errors never reach the actor as a note, and 1.035 s is about twice the target. Recall counting quiet checks is 0.943, with about 48 false checks per 10 min, so whether an error shown as a check is acceptable to the actor is a product question. That is a change in how the target is read, not a measured pass, and it is the user's call.
- **(b) Spec the two-speed stabilizer for latency** (fast release for words that can raise alerts, with alert retraction). The evidence is mixed: in the tuning-seed re-sweep (Patience 0) latency p50 is 0.94 s at `stableSec` 0.1 and 1.17 s at 0.3, so even a 0.1 s hold leaves about 0.9 s that the stabilizer does not explain. I did not attribute that remainder (candidates are the commit/anchoring confirmation words in the aligner and the recognizer's own delay), so this option alone is unlikely to reach 0.5 s, and it does nothing for false notes or recall.
- **(c) Per-actor audio or real recordings, to check whether synthetic TTS plus this recognizer is representative.** Every threshold in this pass was tuned on Piper audio through one recognizer, and the recall miss comes from the recognizer's word confidence (about 0.73 close-mic) landing just under the note bar. Real voices may give a different confidence distribution, in either direction; this is the only option that tests whether the target gap is real.
- **(d) A better recognizer model, or hotword/contextual biasing toward the script words.** A stronger model or biasing should raise confidence on correctly spoken words and cut mishearings. Biasing also pushes the recognizer to write the script word when the actor said something close (already seen with "sir"/"sore", where the recognizer writes "sir"), so it could hide real errors. Neither was measured.

Not recommended without new evidence: further threshold or `stableSec` tuning. The grid above shows no pair in range passes more than one target, and the held-out numbers match it.
