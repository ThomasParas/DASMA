# DASMA — M2a Script Import Results

Spec: docs/superpowers/specs/2026-10-11-script-import-design.md (§1 targets, §6.4 definitions, §6.5 rounds). Corpus: `npm run harness -- build-corpus`, deterministic. Metric notes: fixes/page is the mean over a family's documents of fixes/page; false flags/page is pooled; a unit whose boundary shifts scores a merge and a split (spec-literal).

## Summary

**Verdict: NO-GO.** On the last held-out run (round 2, frozen at `0d1ca20`), licensed passes every target, but word and classical each miss at least one. The spec allows two measure-and-tune rounds (§6.5), and both are used, so the options below are for the user to decide.

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 255 | 0.01 | 2 | 100.0% | 100.0% | 0.60 | 99.99% | PASS |
| word | 18 | 186 | 0.64 | 6 | 97.1% | 98.3% | 0.22 | 97.11% | FAIL: worstPageFixes 6 > 4; speakerAccuracy 0.971 < 0.98; textAccuracy 0.9711 < 0.995 |
| classical | 15 | 197 | 0.14 | 3 | 99.4% | 10.3% | 0.37 | 99.93% | FAIL: flaggedShare 0.103 < 0.9 |

A unit whose boundary shifts scores a merge and a split (spec-literal), so fixes/page counts one misplaced boundary twice.

The held-out set was measured once, at `0d1ca20`. Two fixes (`ce0833e`, an S1 guard, and `dae6251`, the running-line rules keeping headings and speaker cues) were made after that measurement; the tuning numbers are unchanged and the verdict stands (see "Post-run fix").

### Shortfalls

| Id | Family | Target | Measured | Cause |
|---|---|---|---|---|
| H1 | word | worst page (≤ 4) | 6 | Word 3's leading tabs make a 36-pt band that the profile takes as the direction band, so a tab-indented own-line speech is tagged as a direction (114 missedSpeech, all flagged, in 8 of the 9 word 3 documents). |
| H2 | word | speaker accuracy (≥ 98%) | 97.1% | H1. |
| H3 | word | text accuracy (≥ 99.5%) | 97.11% | H1: the lost speeches' words are missing from the spoken text. |
| H4 | classical | flagged share (≥ 90%) | 10.3% (3 of 29) | Three confident errors: (i) Romeo's wrapped setting line `Fifth Act, at Mantua.` matches the act-heading pattern (12 inventedHeading, 11 unflagged); (ii) `CAPULET` prefix-merges into `CAPULET'S COUSIN` at the cast-list confidence 0.95 (10 unflagged wrongSpeaker in one document); (iii) in Hamlet 3, a speaker who speaks once in a non-primary convention (`SECOND CLOWN.`, `ROSENCRANTZ AND GUILDENSTERN.`) joins the previous speech at ≈ 0.86, just above the flag line (4 unflagged). |

Details are in "Round 2 — held-out" below.

**Options**

- **(a) Accept the named shortfalls and let the M2b correction screen carry them.** H1's lost speeches are all flagged (word flagged share 98.3%), so the screen lists every one first; the cost is about 1.3 fixes per page on word 3 style documents (about 13 per 10-page document). H4 is the dangerous one to accept: 26 classical errors are not flagged, so a user finds them only by reading.
- **(b) Targeted rule changes, named:**
  - **H1, leading-tab indent:** in docx, an indent made only by leading tabs is not band evidence; or, more generally, a band counts as the direction band only when most of its lines also carry a direction mark (italic, a bracket). Word 3's band 36 has no italic and 10% parentheses.
  - **H4 (i), wrapped setting line:** extend S5 so that a heading-pattern line inside the cast list that continues the previous line (the previous line ends without `.`, `!`, `?` or `:`) stays front matter.
  - **H4 (ii), possessive merge:** a token that is itself a cast-list name never prefix-merges, and a name never merges into a possessive (`X'S …`). The same rule should stop a cast-list line such as `CHORUS.` being read as a cue before `frontMatterEnd`.
  - **H4 (iii), one-off cues in another convention:** let a cast-list match count as known for a cue in any convention, or flag a speech when a cue-shaped line for a cast-list name is absorbed into it.
- **(c) More layout variety in the corpus.** H1 looks partly like a renderer artefact: word 3 puts a tab before random lines, which real typed scripts do less uniformly. A variant that tabs every speech line (or none) would show whether the rule in (b) is needed in practice. H4 (i) and (ii) are real Gutenberg text, not artefacts.
- **(d) Score real scripts locally with `--set local` before deciding**, to see whether word 3's tabs and the classical confident errors occur in the scripts DASMA's users import.

### What M2b's screen must carry

These fix kinds are still common on held-out documents:

- **missedSpeech (114, flagged):** a speech tagged as a direction. The screen needs a one-tap "this is speech by …" retag, ideally applied to every flagged line of the same shape.
- **wrongSpeaker (15, 13 unflagged):** mostly a whole character merged into another (`CAPULET` → `CAPULET'S COUSIN`). The screen needs character split and alias editing ("these speeches belong to CAPULET"), not only per-unit retagging, and it should show each character's aliases so a wrong merge is visible without a flag.
- **inventedHeading (12, 11 unflagged):** front-matter text read as a heading. A retag from heading to front matter.
- **merge, split and inventedSpeech (7):** unit boundary edits (split a unit at a line, join two units) and text editing (spec §6, item 4).

## Real-script risks

Risks the synthetic corpus structurally cannot measure. Each is one line with a repro sketch and a proposed remedy. They are decisions for the user (M2a.1 or M2b), not changes made on this branch, except C1, which is fixed. Before M2b's screen design, score a few real scripts with `--set local` (spec §6.6) to see which of these occur in the scripts DASMA's users import.

- **C1, running-line rules deleted headings and numbered speakers (fixed, `dae6251`).** Repro: pasted text with `Scene 1` … `Scene 4`, or `GUARD 1` / `GUARD 2` cueing three speeches each; a real-page document whose `SCENE 2` / `SCENE 3` start pages. Remedy applied: headings and cue-shaped lines are exempt from the running-line rules.
- **I1, prefix merge between two distinct cast-list names (open).** Repro: a cast list naming `MAX` and `MAXINE`, then speeches cued `MAX` and `MAXINE`; `MAX` merges into `MAXINE` at 0.92, above the flag line, so it is silent. Same mechanism as `CAPULET` → `CAPULET'S COUSIN` (H4 ii). Remedy: a token that is itself a cast-list name never prefix-merges into another cast-list name.
- **I2, `classicalAbbrev` matches ordinary capitalised words (open).** Repro: continuation paragraphs that start `Okay.`, `Sorry.`, `Right.` or `Fine.` in a script that already has a few such lines. Each reads as a cue and invents a character, flagged at 0.60, or unflagged at 0.97 once `classicalAbbrev` reaches the secondary share of cues. Remedy: accept a classical cue only for a token on a cast list or a known-abbreviation list, or require its speaker to recur in the primary convention too.
- **I3, `NAME<tab>dialogue` and unpunctuated `NAME dialogue` layouts are unrecognised (open, loud).** Repro: `ANNA<tab>Where is the car?` as a docx or pasted line. No speaker is found and import warns `noSpeakers`, so the failure is visible. Remedy: add a tab-separated and a caps-name-then-text convention, or point the user at paste with colons.
- **I4, shallow docx styles (open).** Repro: a docx whose paragraphs have no `basedOn` chain, use only the default paragraph style, or style runs with `rStyle`. The corpus's docx files never do this, so how much indent, italic and bold evidence is lost is unmeasured. A docx with a single explicit page break puts nearly every unit on page 2 and skips the running-header rule. Remedy: resolve `rStyle` and the default style, and treat one page break as no real pages.
- **Numbered speakers in pasted text (fixed with C1).** `GUARD 1` / `GUARD 2` now survive clean-up and tag as separate characters.

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
- **classical false flags (2.98/page):** almost all are in classical 2 (≈ 125 per document). Abbreviated cues (`HAM`, `KIN`) are prefix-merged at 0.8, so every abbreviated speech falls below the flag line. They should be cast-list merges at 0.95, but the cast list is never read: the header `Dramatis Personæ` doesn't match `CAST_LIST_HEADER`, because the regex's trailing `\b` is ASCII-only (with or without the `u` flag), so it never matches after `æ` (see shortfall S3).

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

## Named shortfalls (need a code or truth change, not a constant)

Class, per the round-1 review: **(a)** a defect, where built code contradicts the spec's stated intent; **(b)** a truth artefact, where the corpus truth asks for something no spec-conformant importer can see; **(c)** a new rule the spec doesn't yet have. (a) and (b) were fixed before round 2 (see "Round 1 → round 2 fixes"); (c) are round-2 rule candidates.

| Id | Class | Shortfall | Evidence | Proposed rule |
|---|---|---|---|---|
| S1 | (c) new rule | **Pasted-text running header.** In text input a title header with no digits survives clean-up. It becomes a speaker (`A DOLL'S HOUSE`) or an invented speech (`THE IMPORTANCE OF BEING EARNEST`). | Tune: licensed p 44 of 54 licensed fixes, licensed text accuracy 99.40%, most unflagged licensed errors. Held-out: licensed p wrongSpeaker 33, merge 11, inventedSpeech 13, worst page 9. | Recurring-header rule for pasted text: drop a non-dialogue-shaped line that recurs ≥ 3 times next to a page-number line, or at the estimated page boundaries. |
| S2 | (c) new rule | **Prefix merge into joint speakers.** `MARCELLUS` → `MARCELLUS AND BARNARDO`. Reviewers also noted that the prefix test isn't word-bounded (`ALL` → `ALLEN`); that wasn't seen in this corpus. | Tune: classical wrongSpeaker 57, worst page 9, speaker accuracy 95.5%. | Never merge a name into an `X AND Y` / `X & Y` token, and require a word boundary for a whole-word prefix. |
| S3 | (a) defect | **`Dramatis Personæ` is not a cast-list header.** `CAST_LIST_HEADER`'s trailing `\b` is ASCII-only, so it fails after `æ`, and Gutenberg Shakespeare has no cast list. Abbreviations merge at 0.8 instead of 0.95, and every abbreviated speech is flagged. | Tune: classical 2 ≈ 130 false flags per document (classical 4.16/page). Held-out: romeo 2 69–125 per document (classical 2.31/page). | Replace the trailing `\b` with a Unicode-aware end-of-word lookahead, `(?![\p{L}\p{N}_])` under `/iu`. The `u` flag alone does not help: `\b` stays ASCII-only under `/iu`. |
| S4 | (a) defect | **Bracket block across two inline directions.** `(drops her cloak) Someone is coming now! (Goes to the door.)` counts as one bracketed block, because the bracket opened at the line start closes mid-line. | Tune: residual missedSpeech in licensed 2 (6) and word 2 (10). A stronger constant fix is blocked by the stand-alone-direction unit test (cycle 5). | A block only when the bracket opened at the line start is the one that closes at the line end. |
| S5 | (c) new rule | **Setting line read as a heading.** Gutenberg's `SCENE. Elsinore.` at the end of the cast list matches `^scene\b`. | Tune: classical inventedHeading 9, all unflagged. Held-out: classical inventedHeading 16 (15 unflagged), the main reason held-out classical flagged share is 32.6%. | A `SCENE` line with no number or ordinal that ends the front matter stays front matter. |
| S6 | (b) truth artefact | **Same-speaker units with no cue between them** (songs, letters, continuation speeches) merge into one predicted unit. | Tune: classical split 11 (classical 2). Held-out: classical 3 split 11, licensed split 12. | Truth granularity, not a misread: spec §5.3 ends a speech only at a cue or heading, so the truth should merge a same-speaker continuation that has nothing visible before it. |

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

## Round 1 → round 2 fixes

Task 18b fixed the two defects (a) and the truth artefact (b) before round 2. These are not tuning changes; no constant in `weights.ts` changed.

- **S3 (a), `fix(script): cast-list header matches Dramatis Personæ`.** `CAST_LIST_HEADER` ends in `(?![\p{L}\p{N}_])` under `/iu` instead of `\b`. `Dramatis Personæ`, `DRAMATIS PERSONAE`, `Persons Represented`, `THE PERSONS IN THE PLAY` and `Characters` match; `Characterisation of…` and `Castle` don't.
- **S4 (a), `fix(script): a bracket block must close at a line end`.** `bracketBlocks` tracks bracket depth character by character. A block counts only if the bracket opened at the line start first returns to depth 0 at the end of a line (only `.,;:!?` and whitespace may follow). `(drops her cloak) Someone is coming now! (Goes to the door.)` is no longer a block, nor is a two-line block that closes mid-way through its second line.
- **S6 (b), `fix(harness): truth merges same-speaker continuations with no visible boundary`.** When a source dialogue unit continues the same speaker's dialogue with nothing between them, its leading text is appended (`\n`-joined) to the previous dialogue truth unit, and its paragraphs point at that unit. Inline directions inside the continuation still split it as usual. Rendering is unchanged: on every tuning document the paragraphs, the next rng draw and the cast are identical before and after, and only the truth changes (11 dialogue truth units merged across the tuning set).

### Interactions

With S3 fixed, Gutenberg Shakespeare's cast list is read and abbreviations merge at 0.95, so the classical 2 abbreviation flags shrink. What still keeps classical false flags failing is round-1 cycle 2 (weaker bracket weights): it leaves lines near `[Exit Polonius.]`-style brackets with lower line confidence, and a speech merged at 0.95 needs a line confidence of about 0.84 to stay above the flag line. Cycle 2 trades against S4: it was kept to turn silent word errors from `(a) text (b)` lines into flagged ones, and S4 now removes those errors at the source. A tune-set counterfactual after these fixes (cycle 2 reverted in-process, no file changed) gives classical false flags 2.54 → 1.51 per page and word 0.52 → 0.09, with identical fixes in every family. So cycle 2 is re-decided in round 2, now that S3, S4 and S6 have landed.

### After round-1 defect fixes (tuning set)

Constants unchanged from round-1 final. Command: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round2-prefix-tune`. The held-out set was not run.

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 289 | 0.17 | 3 | 99.5% | 19.1% | 0.49 | 99.44% | FAIL: flaggedShare 0.191 < 0.9; textAccuracy 0.9944 < 0.995 |
| word | 18 | 186 | 0.00 | 0 | 100.0% | 100.0% | 0.52 | 100.00% | PASS |
| classical | 9 | 130 | 0.59 | 9 | 95.5% | 85.5% | 2.54 | 99.87% | FAIL: worstPageFixes 9 > 4; speakerAccuracy 0.955 < 0.98; flaggedShare 0.855 < 0.9; falseFlagsPerPage 2.54 > 2 |

| Family | missedSpeech | inventedSpeech | wrongSpeaker | missedHeading | inventedHeading | split | merge |
|---|---|---|---|---|---|---|---|
| licensed | 0 | 15 | 20 | 0 | 0 | 0 | 12 |
| word | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| classical | 2 | 0 | 57 | 0 | 9 | 0 | 1 |

Against round-1 final on the tuning set (the three fixes were measured together; each movement is attributed by its round-1 cause):

- **S4:** licensed missedSpeech 7 → 0 and word missedSpeech 10 → 0. Word now has no fixes. Licensed flagged share falls 27.8% → 19.1% because the errors removed were mostly flagged ones; what is left is mostly the unflagged pasted-text header errors (S1).
- **S3:** classical false flags 4.16 → 2.54 per page, still over 2 (see Interactions).
- **S6:** classical split 11 → 0.
- Still open, all (c): S1 (licensed p), S2 (classical wrongSpeaker 57, worst page 9), S5 (classical inventedHeading 9).


## Round 2 — rules S1, S2, S5

The user re-scoped round 2 (spec §6.5a): rules S1, S2 and S5 are added, each with unit tests, alongside constant tuning. Each rule was committed on its own and measured on the tuning set with the constants unchanged. The held-out set was not run until after freezing.

| Rule | Commit | What it does | Tune movement |
|---|---|---|---|
| S2 | `2e3414a` | `buildCast` never takes a joint name (one containing ` AND ` or ` & `) as a prefix-merge target, so the joint name stays its own character. `ROS` still merges into `ROSENCRANTZ`, not into `ROSENCRANTZ AND GUILDENSTERN`. | classical wrongSpeaker 57 → 0, fixes/page 0.59 → 0.09, worst page 9 → 2, speaker accuracy 95.5% → 99.8%. Flagged share 85.5% → 16.7%, because the errors left were the unflagged S5 headings. |
| S5 | `55a4fa5` | A `SCENE` line that names a place but has no number or ordinal (`SCENE. Elsinore.`) inside or at the end of the cast list neither ends the cast list nor the front matter. The tagger drops its heading feature before `frontMatterEnd`. A bare `SCENE` names no place and stays a heading: Earnest's scene heading is a bare `SCENE`, and a first version that treated it as a setting line invented 8 missedHeading fixes on the tuning set. | classical inventedHeading 9 → 0, fixes/page 0.09 → 0.02, flagged share 16.7% → 66.7%. |
| S1 | `baaa87f` | Estimated-page input: an identical line is a running header when at least 5 copies sit within 2 lines of a page-number line, or (when page numbers place too few) at a regular spacing: at least 20 lines after the previous copy and within 20% of the median gap. A line with more than one copy away from those positions after the first header recurs as content, so a speaker name is never removed. Title-page copies before the first header stay front matter. The thresholds are new exported constants in `clean.ts`. After the held-out run, `ce0833e` stopped the spacing route removing a cue-shaped line (see "Post-run fix"). | licensed fixes/page 0.17 → 0.02, worst page 3 → 1, inventedSpeech 15 → 0, wrongSpeaker 20 → 0, merge 12 → 5, text accuracy 99.44% → 99.99%, flagged share 19.1% → 80.0%. |

## Round 2 — tuning cycles

Two measure-and-change loops of the eight permitted, plus one flag-line sweep. The sweep is an analysis of the tagger's output at several thresholds, with no retagging and no file change (the same method as round 1).

| Loop | Change | Tune movement | Result |
|---|---|---|---|
| 1 | Revert round-1 cycle 2: `EMISSION.dialogue.bracketBlock` 0.5 → 1, `.bracketPerMark` 1 → 3; `EMISSION.direction.bracketBlock` 0.5 → 1.5, `.bracketPerMark` 1 → 3 | false flags/page classical 2.54 → 1.51, word 0.52 → 0.09, licensed 0.47 → 0.45; fixes identical in every family | kept, `d94cab9`. Cycle 2 was kept in round 1 to flag the `(a) text (b)` word errors; S4 removed those at the source, so it no longer buys anything |
| sweep | `FLAG_BELOW` at 0.80–0.95 | licensed flagged share reaches 100% from 0.82; false flags rise slowly to 0.84 (classical 1.59/page) and step up from 0.85 (classical 1.82 at 0.86, 3.21 at 0.90). Classical's one unflagged tune error sits at 0.91 and needs 0.92, where classical false flags are 5.59/page | analysis only |
| 2 | `FLAG_BELOW` 0.8 → 0.84 | licensed flagged share 80% → 100%; false flags/page licensed 0.45 → 0.63, word 0.09 → 0.11, classical 1.51 → 1.59 | kept, `0d1ca20` |

Tuning stopped there. The only tune target still failing is classical flagged share, 2 of 3 errors flagged. The unflagged one is a letter signed `HAMLET.` on its own line in classical 2, which reads exactly like a cue; no constant separates it. One further candidate was considered and not tried: lowering `EMISSION.cueInline.known` while raising `.primary` would stop a vocative `Nora.` at a line start reading as a classical cue (the 5 licensed merges, all flagged), but it weakens every cue outside the primary and secondary conventions, which is the risk for mixed-convention styles the tuning set doesn't hold.

### Constants changed in round 2

| Constant | Old | New | Justifying tune movement |
|---|---|---|---|
| `EMISSION.dialogue.bracketBlock` | 0.5 | 1 | loop 1: classical false flags 2.54 → 1.51/page, word 0.52 → 0.09 |
| `EMISSION.dialogue.bracketPerMark` | 1 | 3 | loop 1 |
| `EMISSION.direction.bracketBlock` | 0.5 | 1.5 | loop 1 |
| `EMISSION.direction.bracketPerMark` | 1 | 3 | loop 1 |
| `FLAG_BELOW` | 0.8 | 0.84 | loop 2: licensed flagged share 80% → 100% |

New constants from the rules (not tuned): `TEXT_HEADER_MIN_COPIES` 5, `TEXT_HEADER_NEAR_LINES` 2, `TEXT_HEADER_MIN_SPACING` 20, `TEXT_HEADER_SPACING_TOLERANCE` 0.2 and `TEXT_HEADER_MAX_STRAY` 1, all in `clean.ts`.

## Round 2 — tuning, final

Frozen at `0d1ca20`. Command: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round2-tune-final`.

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 289 | 0.02 | 1 | 100.0% | 100.0% | 0.63 | 99.99% | PASS |
| word | 18 | 186 | 0.00 | 0 | 100.0% | 100.0% | 0.11 | 100.00% | PASS |
| classical | 9 | 130 | 0.02 | 2 | 99.8% | 66.7% | 1.59 | 99.87% | FAIL: flaggedShare 0.667 < 0.9 |

| Family | missedSpeech | inventedSpeech | wrongSpeaker | missedHeading | inventedHeading | split | merge |
|---|---|---|---|---|---|---|---|
| licensed | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| word | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| classical | 2 | 0 | 0 | 0 | 0 | 0 | 1 |

## Round 2 — held-out

Run once, after freezing at `0d1ca20`. Command: `npm run harness -- script-eval --set heldout --gate --verbose --out harness/out/script-eval/round2-heldout`.

**Gate line: `SCRIPT GATE FAIL`**

| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| licensed | 18 | 255 | 0.01 | 2 | 100.0% | 100.0% | 0.60 | 99.99% | PASS |
| word | 18 | 186 | 0.64 | 6 | 97.1% | 98.3% | 0.22 | 97.11% | FAIL: worstPageFixes 6 > 4; speakerAccuracy 0.971 < 0.98; textAccuracy 0.9711 < 0.995 |
| classical | 15 | 197 | 0.14 | 3 | 99.4% | 10.3% | 0.37 | 99.93% | FAIL: flaggedShare 0.103 < 0.9 |

| Family | missedSpeech | inventedSpeech | wrongSpeaker | missedHeading | inventedHeading | split | merge |
|---|---|---|---|---|---|---|---|
| licensed | 0 | 0 | 1 | 0 | 0 | 0 | 2 |
| word | 114 | 0 | 1 | 0 | 0 | 1 | 0 |
| classical | 0 | 2 | 13 | 0 | 12 | 1 | 1 |

Against round 1 held-out: licensed goes from FAIL to PASS (fixes/page 0.29 → 0.01, worst page 9 → 2, flagged share 17.1% → 100%), from S1. Word is essentially unchanged (0.67 → 0.64 fixes/page; still word 3; its false flags fall 1.20 → 0.22/page). Classical improves in fixes/page (0.22 → 0.14) and false flags (2.31 → 0.37/page, from S3 and loop 1), but its flagged share falls 32.6% → 10.3%: S6 removed most of round 1's flagged classical errors, and S3 made one wrong merge confident (below).

### Causes, read after the final run

The held-out documents were opened only after the run above, to name causes for the verdict. Nothing was changed after the run. Word 3 was inspected with the importer's own profile and line tags; classical with the per-fix listing of truth and predicted units.

- **word 3 (114 missedSpeech, all flagged; 116 of the family's 116 fixes are in word 3 documents).** The cause is the leading tabs. A tab indents a line by 36 pt, and word 3 puts one before some lines at random. The profile then finds two bands, 0 and 36, takes 36 as the direction band (95% of direction-like lines are off the dialogue band, but only 10% carry a parenthesis and none are italic), and an own-line speech whose text line is tab-indented scores as a direction inside the speech (posterior ≈ 0.68). The speech is lost to the speaker, so speaker and text accuracy fall, and the worst page holds 6 such speeches. Round 1's second candidate, mixed-case own-line names, is not the cause: word 3's own-line names are capitals, and its mixed-case `Name:` cues are all found (confidence ≈ 0.99). The other two word fixes (seagull 3, seed 12) are an unflagged wrongSpeaker and split.
- **classical, inventedHeading (12, 11 unflagged), one per Romeo document.** Romeo's cast list ends with a setting line that wraps: `SCENE. During the greater part of the Play in Verona; once, in` / `the` / `Fifth Act, at Mantua.`. S5 keeps the first line as front matter, but the wrapped `Fifth Act, at Mantua.` matches the `^(first|…|fifth|last)\s+act\b` heading pattern and is tagged a heading, with confidence ≈ 1 in all but one document.
- **classical, wrongSpeaker (10, unflagged), Romeo 2 seed 11.** `CAPULET` prefix-merges into `CAPULET'S COUSIN`. Both are cast-list names, so the merge gets the cast-list confidence 0.95 and every Capulet speech is credited to his cousin without a flag. In round 1 the cast list wasn't read (S3), so the same merge sat at 0.8 and was flagged. The same document also reads the cast-list line `CHORUS.` as a cue (an unflagged inventedSpeech that swallows the rest of the cast list).
- **classical, Hamlet 3 (6 fixes, 4 unflagged).** Hamlet 3 uses classical abbreviations (`Ham.`). A speaker who speaks once in another convention, such as `SECOND CLOWN.` inline or `ROSENCRANTZ AND GUILDENSTERN.` on its own line, isn't a cue token, and the speech joins the previous one at a confidence of about 0.86, just above the flag line.

### Held-out against tuning

- **word: 0.64 held-out vs 0.00 tune (+0.64, over the 0.3 limit).** The style behind it is word 3 (leading tabs, above). There is no word 3 document in the tuning set by design (spec §6.3), so this style was never tuned.
- **classical: 0.14 vs 0.02 (+0.12, within the limit).** Romeo's wrapped setting line, and the `CAPULET'S COUSIN` merge in one document.
- **licensed: 0.01 vs 0.02.**

A unit whose boundary shifts scores a merge and a split (spec-literal), so one misplaced boundary counts as two fixes when reading fixes/page.

### Post-run fix

The held-out set was measured once, at `0d1ca20`, and was not re-run. After that measurement, review found that S1's regular-spacing route could remove a minor speaker who enters at regular intervals: in pasted text with no page numbers, a `MESSENGER` cue recurring at gaps of 27–33 lines lost 5 of its 6 cues, so those speeches would silently join the previous speaker. That breaks §6.5a ("speaker names that recur are never removed"). Commit `ce0833e` makes the spacing route skip any cue-shaped line (the page-number route is unchanged) and adds the regression test. The tuning set is unchanged: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round2-tune-postfix` gives a `scores.json` byte-identical to round2-tune-final. The verdict is unchanged: **NO-GO**.

**Second post-held-out fix (`dae6251`, whole-branch review, ruling R22).** The clean-up rule for estimated pages removed any line that, with digits masked, recurred 3 or more times with differing digits. That deleted `Scene 1` … `Scene 4` and numbered own-line speakers such as `GUARD 1` / `GUARD 2`: the scene headings vanished from the import, and the guards' speeches joined the previous speaker. The real-page edge-zone rule had the same hole for scene headings that start pages. The synthetic corpus never exercises either case, which is why neither run saw it. Headings and cue-shaped lines are now exempt from the digits rule, a masked line whose digit values repeat across copies is a speaker rather than a page counter, and the edge-zone rule keeps headings (an all-capitals running title is cue-shaped, and a cue that also speaks mid-page is already kept by its inner-count test). The own-line cue grammar also accepts a 1–2 digit number after the name (`GUARD 1`), so the kept lines tag as their own characters. The tuning set is unchanged: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/final-fix-tune` gives a `scores.json` byte-identical to round2-tune-final. The held-out set was not re-run. The verdict is unchanged: **NO-GO**.
