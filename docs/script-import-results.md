# DASMA — M2a Script Import Results

Spec: docs/superpowers/specs/2026-10-11-script-import-design.md (§1 targets, §6.4 definitions, §6.5 rounds). Corpus: `npm run harness -- build-corpus`, deterministic. Metric notes: fixes/page is the mean over a family's documents of fixes/page; false flags/page is pooled; a unit whose boundary shifts scores a merge and a split (spec-literal).

## Round 1 — tuning baseline

Constants as committed at `fc1b5f4`. Command: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round1-tune-baseline`.

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 289 | 0.74 | 5 | 95.4% | 20.4% | 0.11 | 98.25% | FAIL: worstPageFixes 5 > 4; speakerAccuracy 0.954 < 0.98; flaggedShare 0.204 < 0.9; textAccuracy 0.9825 < 0.995 |
| word | 18 | 186 | 0.43 | 4 | 97.7% | 48.5% | 0.03 | 99.13% | FAIL: speakerAccuracy 0.977 < 0.98; flaggedShare 0.485 < 0.9; textAccuracy 0.9913 < 0.995 |
| classical | 9 | 130 | 0.80 | 9 | 95.0% | 81.6% | 2.98 | 99.59% | FAIL: worstPageFixes 9 > 4; speakerAccuracy 0.950 < 0.98; flaggedShare 0.816 < 0.9; falseFlagsPerPage 2.98 > 2 |

| Family | missedSpeech | inventedSpeech | wrongSpeaker | missedHeading | inventedHeading | split | merge |
|---|---|---|---|---|---|---|---|
| licensed | 169 | 15 | 20 | 0 | 0 | 0 | 12 |
| word | 97 | 0 | 1 | 0 | 0 | 1 | 0 |
| classical | 8 | 1 | 58 | 0 | 10 | 21 | 0 |

### Causes of the largest fix kinds

Classical has the most fixes per page; licensed fails the most targets and has the most fixes. Both were read with `script-dump` and a per-fix listing of `truthUnit` and `predictedUnit`.

- **licensed missedSpeech (169), also word missedSpeech (97):** licensed 1 and 2 and word 2 lose a short speech that shares its line with an inline direction, such as `(Shaking his head.) Dead!`. Most of the line's letters are italic, so the whole line counts as italic, and `italic` + `italicPerMark` (1 + 2.5 × the italic share, ≈ 3.3 each way) outweighs the cue → dialogue transition. Some of these lines also open and close with a bracket, `(drops her cloak) Someone is coming now! (Goes to the door.)`, so `bracketBlock` + `bracketPerMark` (≈ 4 each way) push them to direction as well.
- **licensed wrongSpeaker (20), inventedSpeech (15) and merge (12):** pasted text (variant p) keeps the running title header. `A DOLL'S HOUSE` is shaped like a name and recurs, so it becomes a speaker. It also hides the real cue printed just before it, because a cue directly followed by another cue is dropped as a title block. `THE IMPORTANCE OF BEING EARNEST` (five words, too long to be a name) is read as an invented speech.
- **classical wrongSpeaker (58):** a speaker is prefix-merged into a joint speaker. `MARCELLUS` becomes an alias of `MARCELLUS AND BARNARDO` (and `HORATIO` of `HORATIO AND MARCELLUS`, `ROSENCRANTZ` of `ROSENCRANTZ AND GUILDENSTERN`), so every later speech by Marcellus is credited to the pair. These speeches are mostly flagged, because the 0.8 alias confidence multiplies a line confidence below 1. The runs of these fixes make the worst page (9).
- **classical split (21):** two different causes. (a) A speaker who speaks only once in the excerpt (`GHOST.`, `ALL.`, `LUCIANUS.`) has an inline cue that isn't "known", and `cueInline.primary` (1.5) is too weak to beat dialogue, so the speech joins the previous one. (b) Classical 2 sung stanzas and read letters are separate truth units of the same speaker with no cue between them, so they merge into one predicted unit. That is truth granularity, not a tagger fault.
- **classical false flags (2.98/page):** almost all are in classical 2 (≈ 125 per document). Abbreviated cues (`HAM`, `KIN`) are prefix-merged at 0.8, so every abbreviated speech falls below the flag line. They should be cast-list merges at 0.95, but the cast list is never read: the header `Dramatis Personæ` doesn't match `CAST_LIST_HEADER`, because the regex's `\b` after `æ` fails without the `u` flag (see shortfall S3).

## Round 1 — tuning cycles

Each cycle changed one constant group, re-ran `script-eval --set tune` and `npm test`. Five of the eight permitted cycles were used. Tuning stopped there because every target still failing on the tuning set traces to a rule shortfall (below), not to a constant.

| Cycle | Change | Tune fixes/page (lic / word / class) | Other gated movement | Result |
|---|---|---|---|---|
| 1 | `EMISSION.dialogue` and `.direction` `italic` 1 → 0.5, `italicPerMark` 2.5 → 0.5 | 0.74 → 0.19 / 0.43 → 0.06 / 0.80 → 0.76 | licensed speaker 95.4 → 99.3%, text 98.25 → 99.40%; word speaker 97.7 → 99.7%, text → 99.66% (pass) | kept, `1e96665` |
| 2 | `EMISSION.dialogue.bracketBlock` 1 → 0.5, `.bracketPerMark` 3 → 1; `EMISSION.direction.bracketBlock` 1.5 → 0.5, `.bracketPerMark` 3 → 1 | 0.19 / 0.06 → 0.10 / 0.76 | word flagged share 14 → 100% (word passes every target); classical false flags 3.04 → 4.08 (already failing) | kept as a net win, `7ed5cdb` |
| 3 | same group at 1 / 1.5 (both states) | 0.19 / 0.06 / 0.76 | word flagged share 29% | reverted: no word gain |
| 4 | `EMISSION.cueInline.primary` 1.5 → 3 | 0.19 / 0.10 → 0.04 / 0.76 → 0.66 | classical split 21 → 11; classical flagged share 87 → 85%, false flags 4.08 → 4.16 | kept, `ba4aca0` |
| 5 | `EMISSION.dialogue.bracketBlock` 0.5 → 0, `.bracketPerMark` 1 → 0 | 0.19 → 0.17 / 0.04 → 0.00 / 0.66 → 0.68 | classical false flags 4.16 → 3.98 | reverted: breaks `tag.test.ts` "tags an own-line script with a stand-alone direction". That test pins a behaviour (a lone `(He sits.)` between speeches is a direction), so the change was wrong |

Cycle 2 makes classical false flags worse because Gutenberg-style `[Exit Polonius.]` lines, which carry no italic or band evidence, sit close to the direction/dialogue boundary and get a posterior of about 0.4–0.6. The units come out the same, since `buildUnits` splits brackets out of a speech either way. The cycle was kept because it turns twelve silent word errors into flagged ones, and classical false flags fail on the classical 2 abbreviations anyway (S3). The cycle 5 test also sets a floor: by hand calculation, the dialogue bracket penalty can't go below about 1.4 at a bracket share of 1.

### Constants changed in round 1

All in `packages/script/src/weights.ts`. Nothing in `clean.ts` or `profile.ts` changed.

| Constant | Old | New | Justifying tune movement |
|---|---|---|---|
| `EMISSION.dialogue.italic` | 1 | 0.5 | cycle 1: licensed fixes/page 0.74 → 0.19, word 0.43 → 0.06 |
| `EMISSION.dialogue.italicPerMark` | 2.5 | 0.5 | cycle 1 |
| `EMISSION.direction.italic` | 1 | 0.5 | cycle 1 |
| `EMISSION.direction.italicPerMark` | 2.5 | 0.5 | cycle 1 |
| `EMISSION.dialogue.bracketBlock` | 1 | 0.5 | cycle 2: word flagged share 14 → 100% |
| `EMISSION.dialogue.bracketPerMark` | 3 | 1 | cycle 2 |
| `EMISSION.direction.bracketBlock` | 1.5 | 0.5 | cycle 2 |
| `EMISSION.direction.bracketPerMark` | 3 | 1 | cycle 2 |
| `EMISSION.cueInline.primary` | 1.5 | 3 | cycle 4: classical 0.76 → 0.66, word 0.10 → 0.04 |

### Constants considered and left alone

- **`PREFIX_MERGE_CONFIDENCE` (0.8).** Raising it would clear most classical 2 false flags, which come from correct abbreviations. It would also unflag the joint-speaker merges, which are wrong (about 57 tune errors). That swaps one failing target for another and makes the errors silent, so it stays at 0.8 until S2 and S3 are fixed.
- **`FLAG_BELOW` (0.8).** A sweep of the flag line on the tune set after cycle 1 (no retagging needed) showed licensed and word errors are confidently wrong. At 0.92, licensed reaches only 46% flagged while its false flags rise to 6.9/page, so it is no lever.
- **`STOP_FIRST_WORDS` + `A`/`THE`.** This would stop `A DOLL'S HOUSE` becoming a speaker (S1). It would also stop real speakers such as `THE STRANGER` or `A VOICE` being found, so it isn't kept.

## Round 1 — tuning, final

Command: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round1-tune-final`.

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 289 | 0.19 | 3 | 99.3% | 27.8% | 0.46 | 99.40% | FAIL: flaggedShare 0.278 < 0.9; textAccuracy 0.9940 < 0.995 |
| word | 18 | 186 | 0.04 | 3 | 99.8% | 100.0% | 0.54 | 99.75% | PASS |
| classical | 9 | 130 | 0.66 | 9 | 95.5% | 85.0% | 4.16 | 99.87% | FAIL: worstPageFixes 9 > 4; speakerAccuracy 0.955 < 0.98; flaggedShare 0.850 < 0.9; falseFlagsPerPage 4.16 > 2 |

| Family | missedSpeech | inventedSpeech | wrongSpeaker | missedHeading | inventedHeading | split | merge |
|---|---|---|---|---|---|---|---|
| licensed | 7 | 15 | 20 | 0 | 0 | 0 | 12 |
| word | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| classical | 2 | 0 | 57 | 0 | 9 | 11 | 1 |

What remains on the tuning set:

- **licensed:** 44 of its 54 fixes and nearly all its text errors are in the three pasted-text (p) documents, from the running header (S1).
- **classical:** 57 wrongSpeaker fixes are joint-speaker merges (S2). Nine inventedHeading fixes, all unflagged, are `SCENE. Elsinore.` (S5). The false flags are the classical 2 abbreviations (S3).

## Named shortfalls (need a rule change, not a constant)

| Id | Shortfall | Evidence | Proposed rule |
|---|---|---|---|
| S1 | **Pasted-text running header.** In text input a title header with no digits survives clean-up. It becomes a speaker (`A DOLL'S HOUSE`) or an invented speech (`THE IMPORTANCE OF BEING EARNEST`). | Tune: licensed p 44 of 54 licensed fixes, licensed text accuracy 99.40%, most unflagged licensed errors. Held-out: licensed p wrongSpeaker 33, merge 11, inventedSpeech 13, worst page 9. | Recurring-header rule for pasted text: drop a non-dialogue-shaped line that recurs ≥ 3 times next to a page-number line, or at the estimated page boundaries. |
| S2 | **Prefix merge into joint speakers.** `MARCELLUS` → `MARCELLUS AND BARNARDO`. Reviewers also noted that the prefix test isn't word-bounded (`ALL` → `ALLEN`); that wasn't seen in this corpus. | Tune: classical wrongSpeaker 57, worst page 9, speaker accuracy 95.5%. | Never merge a name into an `X AND Y` / `X & Y` token, and require a word boundary for a whole-word prefix. |
| S3 | **`Dramatis Personæ` is not a cast-list header.** `CAST_LIST_HEADER`'s trailing `\b` fails after `æ` (no `u` flag), so Gutenberg Shakespeare has no cast list. Abbreviations merge at 0.8 instead of 0.95, and every abbreviated speech is flagged. | Tune: classical 2 ≈ 130 false flags per document (classical 4.16/page). Held-out: romeo 2 69–125 per document (classical 2.31/page). | Fix the regex (`u` flag, or a lookahead for space, punctuation or end of line). |
| S4 | **Bracket block across two inline directions.** `(drops her cloak) Someone is coming now! (Goes to the door.)` counts as one bracketed block, because the bracket opened at the line start closes mid-line. | Tune: residual missedSpeech in licensed 2 (6) and word 2 (10). A stronger constant fix is blocked by the stand-alone-direction unit test (cycle 5). | A block only when the bracket opened at the line start is the one that closes at the line end. |
| S5 | **Setting line read as a heading.** Gutenberg's `SCENE. Elsinore.` at the end of the cast list matches `^scene\b`. | Tune: classical inventedHeading 9, all unflagged. Held-out: classical inventedHeading 16 (15 unflagged), the main reason held-out classical flagged share is 32.6%. | A `SCENE` line with no number or ordinal that ends the front matter stays front matter. |
| S6 | **Same-speaker units with no cue between them** (songs, letters, continuation speeches) merge into one predicted unit. | Tune: classical split 11 (classical 2). Held-out: classical 3 split 11, licensed split 12. | Accept for M2b, or split on a vertical gap / verse indent. This is truth granularity, not a misread. |

## Round 1 — held-out

Run once, after freezing. Commands: `npm run harness -- build-corpus --set heldout`, then `npm run harness -- script-eval --set heldout --gate --verbose --out harness/out/script-eval/round1-heldout`.

**Gate line: `SCRIPT GATE FAIL`**

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 255 | 0.29 | 9 | 99.1% | 17.1% | 0.93 | 99.53% | FAIL: worstPageFixes 9 > 4; flaggedShare 0.171 < 0.9 |
| word | 18 | 186 | 0.67 | 6 | 97.1% | 93.3% | 1.20 | 97.11% | FAIL: worstPageFixes 6 > 4; speakerAccuracy 0.971 < 0.98; textAccuracy 0.9711 < 0.995 |
| classical | 15 | 197 | 0.22 | 3 | 99.4% | 32.6% | 2.31 | 99.93% | FAIL: flaggedShare 0.326 < 0.9; falseFlagsPerPage 2.31 > 2 |

| Family | missedSpeech | inventedSpeech | wrongSpeaker | missedHeading | inventedHeading | split | merge |
|---|---|---|---|---|---|---|---|
| licensed | 4 | 13 | 34 | 0 | 0 | 12 | 13 |
| word | 114 | 0 | 1 | 0 | 0 | 5 | 0 |
| classical | 0 | 2 | 13 | 0 | 16 | 11 | 1 |

### Held-out against tuning

- **word: 0.67 held-out vs 0.04 tune (+0.63, over the 0.3 limit). The style behind it is word 3:** mixed `Name:` and own-line cues in mixed case, leading tabs, some lines shouted in capitals. All nine word 3 documents (earnest, dolls-house and seagull) hold 116 of the family's 120 fixes, and all 114 missedSpeech. The seagull word 1, 2 and p documents have 4 fixes between them. Of the missed speeches, 112 are flagged, and eight of the nine word 3 documents lose 97–468 spoken words each. So whole speeches are being tagged as non-dialogue at low confidence, not credited to the wrong speaker. The held-out documents were not opened, to keep them clean for round 2. Two candidates follow from the style: leading tabs moving speech lines off the dialogue band toward the direction band, and mixed-case own-line names that the all-capitals own-line pattern can't match. Neither is confirmed. There is no word 3 document in the tuning set, so this style was never tuned.
- **licensed: 0.29 vs 0.19 (+0.10, within the limit).** The worst pages (9 and 7) and 59 of the 76 fixes are in the seagull pasted-text documents. Their fix kinds (unflagged wrongSpeaker, merge and inventedSpeech) match S1, the running title header.
- **classical: 0.22 vs 0.66 (better).** Romeo has few joint speakers (S2), so wrongSpeaker drops to 13. The classical failures are flagged share (the unflagged `SCENE.` setting line, S5, and classical 3 splits, S6) and false flags (romeo 2 abbreviations, S3).
