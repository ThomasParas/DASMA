# DASMA — M2a Script Import Engine: Design Spec

Date: 2026-10-11 · Status: draft for review
Parent spec: [`2026-10-10-dasma-design.md`](2026-10-10-dasma-design.md) (cited as "MVP spec §n"). This spec covers the first half of MVP spec §11 milestone M2. M2 is split in two:

- **M2a** is this spec: the script engine. It covers import, clean-up, auto-tagging, the `.dasma` format and the re-import diff. All of it is logic with no UI, measured in Node.
- **M2b** is a later spec: the screens. It covers the library, import, tag correction and persistence.

---

## 1. Goal and success criteria

DASMA can only check lines against a script it has read correctly. M2a builds `packages/script`. That package turns a PDF, a Word file or pasted text into a tagged `Script`: speeches with their speakers, stage directions and headings, each with a tag confidence. It also proves on a synthetic corpus that the result is "fast to fix" (MVP spec §6).

**The pass succeeds** when each of the three layout families (§6.2) meets every target below on its own held-out documents (§6.3):

| Target | Required |
|---|---|
| Fixes per page, mean across the family's documents | ≤ 1 |
| Fixes on the family's worst page | ≤ 4 |
| Spoken units with the right speaker | ≥ 98% |
| Errors that are flagged, not silent | ≥ 90% |
| False flags: correct units that are flagged, mean per page | ≤ 2 |
| Spoken words that match the source exactly | ≥ 99.5% |

§6.4 defines a fix, a flag and a page.

**Fixed rules:**
- Targets are never loosened.
- There are at most two measure-and-tune rounds (§6.5). After round 2 the pass reports GO or NO-GO, whether it passed or failed.
- Everything stays offline. Import never touches the network.
- No licensed script is ever committed. Test material is public domain or synthetic. A user's own scripts are scored locally only (§6.6).

## 2. Scope

**In scope**
- `packages/script`: extraction (PDF, docx, pasted text), clean-up, document profiling, tagging, cast and alias building, overlap marks, `.dasma` read/write, the re-import diff, and an adapter that feeds the engine.
- Harness: the play sources, corpus renderers, and the `build-corpus`, `script-eval` and `script-dump` commands.
- Updates to the MVP spec data model (§7).

**Out of scope** (M2b or later)
- Every screen, including tag correction, cut and overlap marking, and character merge and rename.
- IndexedDB persistence, productions and script versions.
- OCR for scanned PDFs.
- Legacy `.doc`, `.pages` and `.rtf` files.

## 3. Architecture

### 3.1 Package layout

```
packages/script/
  src/
    types.ts          RawLine, RawDoc, CleanLine, DocProfile, Unit, Character, Script, errors
    extract/pdf.ts    extractPdf(bytes)   — pdfjs-dist
    extract/docx.ts   extractDocx(bytes)  — fflate + a minimal XML reader for word/document.xml
    extract/text.ts   extractText(text)
    extract/pages.ts  assignEstimatedPages(lines) — pure
    clean.ts          cleanDoc(raw) → CleanDoc
    profile.ts        profileDoc(clean) → DocProfile
    weights.ts        every hand-set scoring constant, FLAG_BELOW
    tag.ts            tagDoc(clean, profile) → line states → units
    characters.ts     buildCast(cueTokens, castList?) → {characters, resolve(token)}
    overlap.ts        applyOverlapMarks(units)
    format.ts         writeDasma / readDasma
    diff.ts           diffScripts(old, next)
    import.ts         importScript(input)
    align-adapter.ts  toAlignLines(script)
    index.ts
  test/
```

**Boundary rules**

- Every file except `extract/pdf.ts` and `extract/docx.ts` is pure TypeScript, with no `node:*` and no DOM.
- The two extractors may import only `pdfjs-dist` and `fflate`.
- `@dasma/align` is the only workspace import. `align-adapter.ts` imports its types, and `overlap.ts` and `diff.ts` use its pure `tokenize` and `normalizeToken` so word indices and normalisation match the engine.
- The same code runs in the browser app and in the Node harness.

**Dependencies (pinned)**

| Package | Version | Used by |
|---|---|---|
| `pdfjs-dist` | `6.3.289` | `packages/script` (the legacy build; in Node it runs without a worker) |
| `fflate` | `0.8.3` | `packages/script` |
| `pdf-lib` | `1.17.1` | devDependency of the harness and of `packages/script` tests |
| `docx` | `9.7.1` | devDependency of the harness and of `packages/script` tests |
| `diff` | `9.0.0` | devDependency of the harness (word alignment for scoring) |

Every pin is a release at least two weeks old. The newest `pdfjs-dist` (6.4.299) and `docx` (9.10.0) were too recent.

The MVP spec named mammoth for docx files. It is replaced because it discards paragraph alignment and indentation, and those are the strongest speaker-name signals in a Word script.

### 3.2 Data flow

```
bytes ─► extract ─► RawDoc ─► cleanDoc ─► CleanDoc ─► profileDoc ─► DocProfile ─┐
                                                                                 ▼
                                    tagDoc ─► buildCast ─► applyOverlapMarks ─► Script
```

```ts
type ImportInput =
  | { kind: 'pdf'; bytes: Uint8Array }
  | { kind: 'docx'; bytes: Uint8Array }
  | { kind: 'text'; text: string };

function importScript(input: ImportInput, opts?: { title?: string }): Promise<ImportResult>;
interface ImportResult { script: Script; profile: DocProfile; warnings: ImportWarning[]; pages: number }
```

## 4. Extraction and clean-up

### 4.1 `RawDoc`

```ts
interface RawSpan { text: string; left: number; right: number; italic: boolean; bold: boolean }
interface RawLine {
  page: number;          // 1-based
  text: string;          // the spans' text in reading order
  spans: RawSpan[];      // pdf: text items; docx: runs; text: one span
  left: number;          // left edge, in points (pdf), twips/20 (docx) or leading-space columns ×6 (text)
  right: number;
  centered: boolean;
  italic: boolean;       // more than half the line's characters are italic
  bold: boolean;
  size: number;          // font size in points; 0 if unknown
}
interface RawDoc { source: 'pdf' | 'docx' | 'text'; pageWidth: number; pages: number; realPages: boolean; lines: RawLine[] }
```

**Estimated pages.** A docx file without page breaks, and pasted text without form feeds, gets estimated pages (`realPages: false`). Each line takes `max(1, ceil(characters / 80))` page lines, and a new page starts every 50 page lines. One pure helper, `assignEstimatedPages`, does this, and the corpus renderers use the same helper for their truth pages.

- **PDF:** text items are grouped into a line when their baselines are within 2 pt of each other, then sorted by x. A space goes between two items when the gap is at least 0.2 × the font size and neither side already has whitespace. Italic and bold come from pdf.js's font flags, or else from the font name (`Italic`, `Oblique`, `Bold`, `Black`, `Semibold`). A line counts as centred when its midpoint is within 3% of the page width of the text column's midpoint or of the page centre (ruling R6), and it is at least 5% of the page width narrower than the column.
- **docx:**
  - Each `w:p` paragraph becomes one line.
  - `w:jc="center"` sets `centered`.
  - `w:ind` sets `left`.
  - Run properties `w:i` and `w:b`, and the paragraph style's own, set `italic` and `bold`.
  - `w:br w:type="page"`, `w:pageBreakBefore` and `w:lastRenderedPageBreak` start a new page. A document with none of them gets estimated pages.
  - A `w:tab` at the start of a paragraph adds 36 pt of indent.
- **Text:**
  - Each line becomes one line. Leading tabs count as 4 spaces.
  - A form feed (`\f`) starts a new page. Text without form feeds gets estimated pages.
  - Pasted text has no italic, bold or centring.
- **Errors.** Each condition raises `ScriptImportError` with a code:
  - `noTextLayer`: the PDF has no text items on any page.
  - `encrypted`: the PDF is password-protected.
  - `unreadable`: pdf.js or the zip reader throws, or `word/document.xml` is missing.
  - `unsupportedFormat`: the bytes start with an OLE header (legacy `.doc`), the `.pages` zip signature, or `{\rtf`.
  - `empty`: no lines are left after clean-up.

  The user-facing message for each code is in §5.4.

### 4.2 Clean-up (`cleanDoc`)

The rules run in this order:

1. **Running headers and footers.**
   - **PDF and docx with real pages:** a line in the first or last 3 lines of a page is removed when, with digits masked, its text recurs in that same edge zone on at least 40% of pages, and on at least 3 pages.
   - **Text, and docx with estimated pages:** a line is removed when all three hold:
     - with digits masked, it recurs at least 3 times;
     - it contains a digit;
     - its digits differ between copies.

     A page number counts up, so it goes. "SERVANT 2" stays the same, so it is kept.

     A digit-free running header in this input is removed by rule S1 (§6.5a).
2. **Page numbers.** A line is removed when its whole text matches `^(page\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?$` (case-insensitive) or a Roman numeral up to `xl`.
3. **Line numbers.** A number `n` is removed when both conditions hold:
   - `n` is a multiple of 5;
   - `n` is greater than the previous removed number in the same scene (the first is accepted).

   Where it sits:
   - **PDF:** a separate text item further than 24 pt outside the text column's left or right edge.
   - **docx and text:** a token at the start or end of a line, separated by at least 2 spaces or a tab.
4. **Hyphenation.** A line ending in a letter plus `-`, followed by a line starting with a lowercase letter, is rejoined without the hyphen. The joined line keeps the first line's layout. Dashes (`—`, `–`) and doubled hyphens are never touched.
5. **Characters.**
   - Ligatures `ﬁ ﬂ ﬀ ﬃ ﬄ ﬅ ﬆ` become plain letters.
   - Curly quotes become straight ones.
   - Soft hyphens are removed.
   - Non-breaking and thin spaces become plain spaces, and runs of whitespace collapse to one space.
6. Lines that end up empty are dropped. Each surviving line records its origin as `source: {page, line}`, where `line` is its index in `RawDoc.lines`.

## 5. Profiling and tagging

### 5.1 Profile (`profileDoc`)

```ts
type SpeakerConvention = 'ownLine' | 'inlinePeriod' | 'inlineColon' | 'classicalAbbrev';
interface DocProfile {
  bands: number[];                       // indent bands: left edges clustered within 12 pt (pdf/docx) or 1 column (text)
  speakerBand: number | 'centered' | null;
  dialogueBand: number | null;
  directionBand: number | null;
  primary: SpeakerConvention | null;
  secondary: SpeakerConvention | null;   // kept when it covers ≥ 15% of speeches
  directionMarks: { italic: number; parens: number; brackets: number; ownBand: number }; // shares, 0..1, of non-speaker lines
  castList: string[];                    // names from a DRAMATIS PERSONAE / CHARACTERS / CAST block, if present
  cueTokens: Map<string, number>;        // candidate speaker token → count in speaker position
  frontMatterEnd: number;                // index of the first non-front-matter line
}
```

**What each convention matches**

| Convention | A line matches when |
|---|---|
| `ownLine` | the whole line is 1–4 words; at least 80% of its letters are capitals; it is optionally followed by `.` or `:` or a parenthetical, such as `HAMLET (aside)`; and the next line is not like that. |
| `inlinePeriod` | the line starts `^[A-Z][A-Z'’ .-]{1,30}\.\s+\S`, with at least 80% capitals in the name. |
| `inlineColon` | the line starts `^[A-Za-z][A-Za-z'’ .-]{1,30}:\s*\S`. |
| `classicalAbbrev` | the line starts `^[A-Z][a-z]{1,5}\.\s+\S`, such as `Ham. `. |

**How the profile is chosen**

- A token counts toward `cueTokens` only if it occurs in speaker position at least 2 times. Comparison ignores case and trailing punctuation.
- `primary` is the convention with the most matches among recurring tokens.
- A cast list is a block starting with a line that matches `^(dramatis person(ae|æ)|characters|cast( of characters)?|(the )?persons (in|of) the play|persons represented)\b` (case-insensitive). The block ends at the first heading, the first line longer than 12 words, or after 40 lines. A setting line (rule S5, §6.5a) neither ends the block nor adds a name. A setting line names a place, so a bare `SCENE` stays a heading. Each name is the text before the first `,`, `:` or ` — `, uppercased, without a trailing `.`.
- `frontMatterEnd` is the first line that is either a heading (§5.2) or the first of three consecutive speeches that use the primary convention. A setting line inside or at the end of the cast list is not that heading (rule S5, §6.5a).

### 5.2 Line states and scoring (`tag.ts`, `weights.ts`)

Each cleaned line takes one of six states:

| State | Meaning |
|---|---|
| `cue` | A speaker name on its own line. |
| `cueInline` | A speaker name followed by dialogue on the same line. |
| `dialogue` | Spoken text. |
| `direction` | A stage direction. |
| `heading` | Matches `^act\s+([ivxlc]+|\d+|one|two|three|four|five)\b`, `^(first|second|third|fourth|fifth|last)\s+act\b`, `^scene\b` or `^(the\s+)?(prologue|epilogue)\b` (all case-insensitive), and is at most 12 words long. `ACT DROP` and similar are not headings. |
| `front` | Front matter: the title page, cast list, notices. |

Directions use two internal states, `dirIn` (inside a speech, so dialogue may follow and continue the same speaker) and `dirOut` (outside a speech). Both become `direction` units, and a line's confidence sums their posteriors.

**Emission scores**

- Every state gets a log-score for every line. The score is a weighted sum of these features:
  - the share of capital letters;
  - the word count;
  - the final punctuation;
  - whether the line starts with a `cueTokens` or `castList` name, after alias resolution;
  - whether the line's band is the profile's speaker, dialogue or direction band;
  - italic;
  - an opening `(` or `[`;
  - a heading-pattern match;
  - whether the line comes before `frontMatterEnd`.
- Feature weights depend on the profile. For example, being centred adds to `cue` only when `speakerBand === 'centered'`. A line that is all capitals, sits in the dialogue band and doesn't match a cue token scores as `dialogue`.
- Every constant lives in `weights.ts`. They are hand-set, never trained.

**Choosing the sequence**

- A fixed transition matrix encodes what can follow what:
  - `cue → dialogue | direction`, where a direction that opens a speech is allowed;
  - `dialogue → dialogue | cue | cueInline | direction | heading`;
  - `direction → dialogue | cue | cueInline | direction | heading`, where `dialogue` continues the current speech;
  - `front` is only reachable from `front` or the start.
- Viterbi decoding picks the best sequence of states.
- Forward-backward gives each line's posterior probability for its chosen state. That posterior is the line's confidence.

### 5.3 From lines to units

- **Speeches.** A speech starts at a `cue` or `cueInline` line and runs until the next `cue`, `cueInline` or `heading`. Direction lines inside it become `direction` units, and dialogue lines after a direction continue the same speaker (`(He sits.)` followed by more of the speech).
- **Speech text.** The speech's dialogue lines are joined with `\n`. For `cueInline`, the name prefix and its `.` or `:` are removed from the text.
- **Directions inside a speech.**
  - A parenthetical `(...)` or bracketed `[...]` span inside dialogue is split out. So is an italic run from docx or PDF of at least 3 words with non-italic text on at least one side. Shorter italic runs are emphasis ("I believe it *is*") and stay spoken.
  - The speech becomes `dialogue`, `direction`, `dialogue`, with the same `characterId` on both dialogue parts.
  - A direction inside a speech is never sent to the engine.
- **Unit kinds.** A `cue` line becomes a `characterName` unit. A `heading` line becomes a `heading` unit, and a `front` line a `frontMatter` unit. Consecutive `direction` lines become one `direction` unit. A line of only `*`, `#` or `~` characters becomes a `sceneBreak`.
- **Unit confidence.** `tagConfidence` is the lowest posterior among the unit's lines. For spoken units, it is then multiplied by the alias confidence of the speaker (§5.4).
- **Flags.** A unit is *flagged* when `tagConfidence < FLAG_BELOW`. That constant starts at 0.8 and is tuned (§6.5).
- **Ids.** Units get ids `u1…uN` in document order.

### 5.4 Cast, aliases, overlap, warnings

**Cast and aliases (`buildCast`)**

- Each cue token is normalised by uppercasing it, stripping trailing `.` and `:`, and collapsing spaces.
- Each character is `{id, name, aliases}`. `name` is the longest form found. `id` is that name lowercased, with non-letters replaced by `-`.
- Token A merges into name B when all three hold:
  - A is a prefix of B;
  - A is at least 3 letters long;
  - A is a prefix of no other name.
- Merge confidence:
  - 0.95 when B is in `castList`;
  - 0.8 when there is no cast list;
  - 1.0 for an exact match.
- When a prefix fits several names, it stays its own character, with confidence 0.5, so its speeches are flagged.
- A joint name (one containing ` AND ` or ` & `) is never a merge target (rule S2, §6.5a).
- `ALL`, `BOTH` and similar names are ordinary characters.

**Overlap marks (`applyOverlapMarks`)**

- A `/` inside a dialogue unit is removed. The words after it, through the end of that unit, become an overlap range.
- The next spoken unit gets an overlap range over its first `k` words. `k` is the number of words after the slash, at least 1, and at most the length of that unit.
- Ranges use the engine's `tokenize` word indices.

**Warnings**

Import still goes ahead, but returns one of these warnings:

| Warning | When |
|---|---|
| `noSpeakers` | No speaker was found. |
| `mixedConventions` | `secondary` is set. |
| `manyFlagged` | More than 30% of units are flagged. |
| `ambiguousAlias` | A short name could belong to more than one character. Carries the token. |

**Messages for import errors (from §4.1)**

| Code | Message |
|---|---|
| `noTextLayer` | "Scanned PDFs aren't supported yet; paste the text instead." |
| `encrypted` | "This PDF is password-protected; remove the password and try again." |
| `unreadable` | "This file couldn't be read; it may be damaged." |
| `unsupportedFormat` | "Save it as .docx or PDF and try again." |
| `empty` | "No script text was found in this file." |

## 6. Corpus and measurement

### 6.1 Source plays

Each source play is stored once, with its correct tags, as `harness/corpus/plays/<id>.json`:

```ts
interface SourcePlay {
  id: string; title: string; source: string;            // edition and public-domain statement
  cast: { id: string; name: string; aliases: string[] }[];
  units: { kind: UnitKind; characterId?: string; text: string }[];   // text: verse lines joined by \n
}
```

The plays all come from Project Gutenberg, with the Gutenberg header and licence block stripped:

| Play | Source | Used for |
|---|---|---|
| `earnest` | Wilde, *The Importance of Being Earnest* (1895) | tuning |
| `dolls-house` | Ibsen, *A Doll's House*, tr. R. Farquharson Sharp (1910) | tuning |
| `hamlet` | Shakespeare, *Hamlet* | tuning |
| `seagull` | Chekhov, *The Sea-Gull*, the English translation in Gutenberg eBook #1754 (published before 1931; public domain in the US) | held out |
| `romeo` | Shakespeare, *Romeo and Juliet* | held out |

**Building the tagged files**

- One paragraph-based converter, `harness/src/corpus/convert-gutenberg.ts`, with a small config per play, builds each tagged file once from a downloaded `pg<id>.txt`. The output is committed.
- The converter keeps the title and the cast list as front matter, and drops Gutenberg's contents lists, scene lists and premiere casts.
- The converter fails if a speaker doesn't appear in the play's own cast list, apart from a short exception list in the play's config (for example `ALL`, `BOTH`, and Gutenberg's typo `ABKADINA` for `ARKADINA`).
- Inline directions stay attached to their speech in the source file as `[...]` spans, and Gutenberg's `_word_` emphasis stays as `_..._`. The renderers lay both out in each style's own form; truth text never contains the marks.

### 6.2 Layout families

Renderers in `harness/src/corpus/` turn a source play into a document of about 15 pages. Each one starts at a seeded scene boundary and includes the front matter.

| Family | Variant | Format | Layout |
|---|---|---|---|
| `licensed` | 1 | PDF | Names centred in capitals. Italic directions in parentheses. Title header and page-number footer. |
| | 2 | PDF | Names indented 1.5 in. Italic directions indented, with no parentheses. "- 12 -" page numbers. |
| | 3 | PDF | Acting edition: `NAME.` in capitals at the start of the line, directions in brackets. Contains hyphenated line wraps. |
| | p | text | Variant 1 as plain text (no italic), including its headers and page numbers, with `fi` and `fl` as ligature characters as a PDF copy-paste gives them. The standard PDF fonts can't encode ligature glyphs, so ligatures are exercised here. |
| `word` | 1 | docx | `NAME:` in bold at the start of the line. Plain directions in parentheses. |
| | 2 | docx | Names centred and bold on their own line. Italic directions. |
| | 3 | docx | Mixed: mostly `NAME:`, some names on their own line, leading tabs. Names in mixed case such as `Nora:`. Some dialogue lines shouted in capitals. |
| | p | text | Variant 1 as plain text. |
| `classical` | 1 | PDF | Gutenberg style: `HAMLET.` at the start of the line, `[Exit.]` directions, `ACT I. SCENE II.` headings. |
| | 2 | PDF | Folger style: names in capitals on their own line. Right-margin line numbers every 5. Verse lines. Italic directions. Abbreviated names after the first full one. |
| | 3 | text | Pasted classical: `Ham.` in mixed case, space indentation, line numbers on the left. |
| | p | text | Variant 1 as plain text. |

- **Which plays each family uses.** `licensed` and `word` use `earnest`, `dolls-house` and `seagull`. `classical` uses `hamlet` and `romeo`.
- **Seeded variation.** Each document's seed varies the font family (one of three standard PDF fonts, or three docx fonts), the size (10–12 pt), the margins (0.75–1.25 in), the line width, and the excerpt's starting scene.
- **Correct tags travel with the document.** Every rendered document comes with its truth file: the cast (with every abbreviation the renderer used as an alias), the page count, and the correct units, each with its kind, speaker, text and the page it starts on. Scoring matches units by their words (§6.4), so it doesn't depend on how the extractor splits lines.

### 6.3 Tuning and held-out sets

- **Tuning set:** variants 1, 2 and p of the tuning plays, with seeds 1–3.
- **Held-out set:**
  - variant 3 of every play, with seeds 11–13;
  - all four variants of the held-out plays, with seeds 11–13.
- The gate (§1) is judged on the held-out set only. Tuning results are reported too.

### 6.4 Definitions

- **Page:**
  - PDF: a page of the PDF.
  - docx and text: a page as `RawDoc` estimates it (§4.1).
- **Matching units.** Every unit's words (the engine's `tokenize` and `normalizeToken`) are laid end to end, for the truth and for the prediction, and the two word streams are aligned with an order-preserving diff. A correct unit *lands* in the predicted units its words align to, and a predicted unit *comes from* the correct units its words align to.
- **What counts as a fix.** Each of the following counts as one fix:
  - **Missed speech:** a correct spoken unit with less than half its words landing in predicted spoken units.
  - **Invented speech:** a predicted spoken unit with less than half its words coming from correct spoken units.
  - **Wrong speaker:** a correct spoken unit, not missed, whose main predicted spoken unit has the wrong `characterId`. Predicted characters are resolved to correct ones by name and alias.
  - **Missed or invented heading:** the same half-the-words rule, for headings.
  - **Split:** a predicted spoken unit that comes from k ≥ 2 correct spoken units needs k − 1 fixes.
  - **Merge:** a correct spoken unit that lands in k ≥ 2 predicted spoken units needs k − 1 fixes.

  A unit counts toward a split or merge only with at least 2 aligned words, or 1 when the unit has at most 2 words. Confusion between two non-spoken kinds (`direction`, `characterName`, `frontMatter`, `sceneBreak`) is not a fix.
- **Owner and page.** Each fix has an owner: the predicted unit the user would click to fix it (the main predicted unit for a missed speech or heading, the unit itself otherwise, and the extra units for a merge). A fix is counted on its owner's first page, or on the correct unit's page when there is no owner.
- **Flagged error.** A fix whose owner is flagged.
- **False flag.** A flagged predicted unit that needs no fix.
- **Speaker accuracy.** The share of correct spoken units whose matched predicted unit is spoken and has the right speaker.
- **Text accuracy.** `1 − errors / correct spoken words`, comparing everything the prediction treats as spoken (in `toAlignLines` order) with everything the truth treats as spoken, word by word after `normalizeToken`. Each run of differences counts `max(words removed, words added)` errors, so a wrong word is one error.

### 6.5 Tuning rounds

- **Round 1:** measure the tuning set, adjust `weights.ts`, `FLAG_BELOW` and the clean-up thresholds, then measure the held-out set once.
- **Round 2:** at most one further tuning cycle, then a held-out measure. The result is GO or NO-GO.
- Both rounds and every held-out number go into `docs/script-import-results.md`. A NO-GO report names each shortfall and gives options.
- M2b may start whatever the result, because the correction screen is the safety net. A NO-GO changes how much M2b's screen must carry.

### 6.5a Round 2 re-scope (decided 2026-10-12)

Round 1 failed the held-out gate. Its results (`docs/script-import-results.md`) named six shortfalls. Three were defects in built code or in the corpus truth (S3 cast-list header after `æ`, S4 bracket blocks, S6 invisible same-speaker boundaries), and were fixed before round 2 as defects, not tuning. The other three need rules this spec didn't have. The user decided that **round 2 may add these three rules, each with unit tests, alongside constant tuning**:

- **S1, pasted-text running header.** In estimated-page input, a line that recurs at least 5 times with identical text (no digits needed), sits within 2 lines of a page-number line or at a regular spacing, and is not a recurring cue token, is a running header and is removed. The exact form is the implementer's, constrained by: speaker names that recur are never removed. Because spacing alone can't tell a running title from a minor speaker who enters at regular intervals, the regular-spacing route never removes a cue-shaped line.
- **S2, joint speakers.** A name never prefix-merges into a joint name (one containing ` AND ` or ` & `); a joint name stays its own character.
- **S5, setting line in front matter.** A `SCENE` line with no number or ordinal (e.g. `SCENE. Elsinore.`) inside or at the end of the cast list stays front matter rather than ending it as a heading. A setting line names a place, so a bare `SCENE` (Earnest's scene heading) stays a heading.

Everything else in §6.5 stands: tune on the tuning set only, at most 8 measure-and-change loops in round 2, then one held-out measurement and the GO/NO-GO verdict. Round 2 also re-decides round 1's cycle-2 bracket weights now that S3/S4 are fixed.

### 6.6 Harness commands

| Command | What it does |
|---|---|
| `npm run harness -- build-corpus` | Deterministically writes `harness/out/corpus/<family>/<play>-v<variant>-s<seed>.{pdf,docx,txt}` with its `.truth.json`. The directory is git-ignored. |
| `npm run harness -- script-eval [--set tune\|heldout\|local]` | Runs `importScript` on every document. Prints the §1 metrics per family, and per document with `--verbose`. Exits non-zero when `--gate` is given and a held-out target fails. `--set local` scores `harness/local/*` (git-ignored): each `<name>.{pdf,docx,txt}` paired with a hand-written `<name>.truth.json`. |
| `npm run harness -- script-dump <file>` | Writes `harness/out/dump/<name>.html`: the tagged script, with speakers, kinds and confidence shown, flagged units highlighted, and warnings listed. Used for eyeballing real scripts. |

## 7. Changes to the MVP spec

These changes are applied to [`2026-10-10-dasma-design.md`](2026-10-10-dasma-design.md) when M2a lands:

- **§4.1:** the `script` unit depends on `pdfjs-dist` and `fflate`, not mammoth.
- **§5 Script unit:**
  - `kind` gains `frontMatter`;
  - `overlap: boolean` becomes `overlapRanges?: [number, number][]`, matching the engine's `ScriptLineInput`;
  - each unit gains `source: {page: number; line: number}[]`.
- **§5 `.dasma` file:** `formatVersion: 1` uses this unit shape. Nothing has been exported yet, so no migration is needed.
- **§6:** points to this spec for the import rules. It adds that the tag-correction screen (M2b) must support text editing, because §1's text-accuracy target exists for that reason.

The resulting types:

```ts
type UnitKind = 'dialogue' | 'direction' | 'characterName' | 'heading' | 'sceneBreak' | 'frontMatter';
interface Unit {
  id: string; kind: UnitKind; characterId?: string; text: string;
  cut: boolean; overlapRanges?: Array<[number, number]>;
  tagConfidence: number;                       // 0..1
  source: Array<{ page: number; line: number }>;
}
interface Character { id: string; name: string; aliases: string[] }
interface Script { title: string; characters: Character[]; units: Unit[] }
```

M2a's `Script` is content only. The `id`, `productionId` and `version` fields arrive with M2b persistence.

## 8. `.dasma` format and the re-import diff

### 8.1 `format.ts`

```ts
function writeDasma(script: Script, opts?: { cast?: Record<string, string[]>; now?: Date }): string;
function readDasma(text: string): { script: Script; cast?: Record<string, string[]>; exportedAt: string };
```

**Writing**

- `writeDasma` emits `{format: 'dasma-script', formatVersion: 1, title, characters, units, cast?, exportedAt}` as 2-space-indented JSON.
- `cast` is included only when given (MVP spec §5: "include cast list").

**Reading**

`readDasma` validates the file by hand, with no schema library. On failure it throws `ScriptFormatError` with one of these reasons:

| Reason | When |
|---|---|
| `notJson` | The text doesn't parse as JSON. |
| `notDasma` | `format` is not `'dasma-script'`. |
| `newerVersion` | `formatVersion > 1`. Message: "made with a newer version of DASMA". |
| `invalid` | Includes a path, such as `units[12].kind`. Raised for a missing or ill-typed field, a duplicate unit id, a `characterId` that isn't in `characters`, an overlap range that is out of order, or a confidence outside 0..1. |

**Round trip.** Writing and then reading gives back the same script.

### 8.2 `diff.ts`

```ts
interface ScriptDiff {
  unchanged: Array<{ oldId: string; newId: string }>;
  changed: Array<{ oldId: string; newId: string; similarity: number }>;
  added: string[];      // new ids
  removed: string[];    // old ids
}
function diffScripts(old: Script, next: Script): ScriptDiff;
function carryOver(old: Script, next: Script, diff: ScriptDiff): Script;
```

**Matching units (`diffScripts`)**

- Units are compared with the engine's normalisation, by token-set Jaccard similarity.
- An alignment over the two unit sequences that preserves order (Needleman–Wunsch: gap cost 0, a match scores its similarity) pairs units when their similarity is at least 0.6.
- A pair with the same normalised text is `unchanged`. Any other pair is `changed`.
- A unit only matches a unit of the same spoken or non-spoken class.

**Carrying corrections over (`carryOver`)**

- The new script takes the old ids for matched units. Other new units get fresh ids that continue past the old script's highest number.
- An unchanged unit keeps the old unit's `kind`, `characterId`, `cut` and `overlapRanges`, so the user's corrections survive.
- A changed unit keeps the old `cut`, and its `tagConfidence` is capped at `FLAG_BELOW − 0.01`, so it is flagged for review.
- Characters are merged by `id`.
- M2b uses `changed` and `removed` to mark notes `lineChangedSinceNote` and to show "N lines changed".

## 9. Engine adapter

```ts
function toAlignLines(script: Script): ScriptLineInput[];   // ScriptLineInput from @dasma/align (type import)
```

- Only `dialogue` units are passed on, in order.
- Each one maps to `{id: unit.id, characterId: unit.characterId, text: unit.text, cut: unit.cut, overlapRanges: unit.overlapRanges}`.
- A dialogue unit without a `characterId` gets `characterId: 'unknown'`. That is always a flagged unit, because the tagger flags a speech with no resolved speaker.

## 10. Testing

**Unit tests (Vitest, `packages/script/test/`)**

- Each stage is tested on small inline fixtures:
  - every clean-up rule in §4.2, including the "SERVANT 2" case;
  - every convention in §5.1;
  - the six states in §5.2, including a shouted line in capitals, "SCENE" inside dialogue, and `LADY` next to two `LADY …` names;
  - overlap ranges;
  - every `ScriptFormatError` reason;
  - the diff cases: unchanged, changed, added, removed, reordered, and a correction surviving `carryOver`.
- The extractor tests build tiny PDF and docx files at test time, with `pdf-lib` and `docx` added as devDependencies of `packages/script`. No binary fixtures are committed.
- Every import error code has a test.

**Harness tests**

- `build-corpus` is deterministic: the same seed gives the same bytes and truth.
- `script-eval` scoring is checked on a hand-built prediction with known fix, flag and text-error counts.

**Gate**

- `script-eval --set heldout --gate` is the M2a gate.
- `npm test` stays fast. The corpus build and scoring are not part of `npm test`.
