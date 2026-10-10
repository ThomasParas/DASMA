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
