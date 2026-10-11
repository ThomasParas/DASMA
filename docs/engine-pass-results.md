# DASMA — Engine-Change Pass Results

Spec: docs/superpowers/specs/2026-10-10-engine-pass-design.md · Numbers are per machine (TTS audio is cached per machine).

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

Defaults changed: `Stabilizer` and the CLI `--stable-sec` default 0.2 → 0.3, and the `cli-args` defaults test (commit `7ca1c2e`). The browser recognizer also takes the new default.

### Solo targets on held-out seeds 11–30 (solo close-mic, 140 runs, 237.0 min, 454 planted errors)

| Target | Patience | Step 0 | Round 1 | Required | Result |
|---|---|---|---|---|---|
| False alerts per 10 min | 0.5 | 4.77 | 0.633 | ≤ 1 | PASS |
| False notes per 10 min | 0.5 | 9.58 | 10.761 | ≤ 1 | FAIL |
| Core recall | 0.5 | 0.728 | 0.492 | ≥ 0.90 | FAIL |
| Alert latency p50 | 0 | 1.154 s | 1.087 s | < 0.5 s | FAIL |

Patience 0 (reported, not gated): false alerts 14.68 → 0.675 per 10 min, false notes 72.54 → 10.634 per 10 min, core recall 0.764 → 0.354, latency p95 6.82 s → 6.93 s.

Other solo close-mic metrics, Step 0 → round 1: recall 0.758 → 0.533; recall counting checks 0.927 → 0.943; false checks per run 4.27 → 6.62; same-category rate 0.623 → 0.425; benign violations per run 0.207 → 0.329; latency p95 (P0.5) 9.16 s → 6.72 s.

Sound-alike detection rate (`soundAlikeRecall`, 33 planted sound-alikes): 0.091 (3) → 0.303 (10).

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

**Worsenings (reported, not blocking, spec §1).** `gate` exits FAIL, and every line of it is core recall: all three director conditions and all three solo conditions are below baseline. False alerts and false notes improved or held in every condition. Other worsenings: director-close-mic benign violations per run 0.45 → 0.65, and false checks per run rose in every condition (director-close-mic 7.75 → 12.28, director-far-field 17.0 → 22.8, director-far-field-hard 31.9 → 42.1); director-far-field-hard has no alerts at all now, so its latency is undefined (was p50 3.06 s).

Cause (from the Step 5 attribution on tuning seeds, and the same classification on the held-out director-far-field-hard runs): the recall loss is the note threshold, not missed detection. Recall counting checks rose or held in every condition (director-close-mic 0.923 → 0.948, far-field 0.931 → 0.953, far-field-hard 0.765 → 0.801). Missed core labels are almost all checks whose confidence is under 0.5. Mean word confidence is about 0.73 close-mic, 0.68 far-field, 0.46–0.50 far-field-hard, so the audio-quality factor is about 0.86, 0.75 and 0.60. A wrong-words note is 0.85 × (mean heard-word confidence) × (audio quality) ≈ 0.53 close-mic before any similarity downgrade, ≈ 0.25 in far-field-hard. Both factors come from the same recognizer confidence, so a low-confidence stretch is penalised twice. A dropped-words note is 0.8 × (neighbour confidence) × 0.6 if a mismatch is adjacent × audio quality, which lands near or below 0.5 (these two products are arithmetic from `classify.ts`, not separately measured). In far-field-hard 67 of 144 core labels are checks with confidence under 0.30 and 28 produced no note or check at all.

### Where the solo false notes and misses come from (tuning seeds 1–10, Step 5)

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

Raising the hold to 0.4 s would cut false notes six-fold on tuning seeds for 0.03 of core recall and about 0.08 s of latency; it does not reach the ≤ 1 target by itself. Not measured on held-out seeds.

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
