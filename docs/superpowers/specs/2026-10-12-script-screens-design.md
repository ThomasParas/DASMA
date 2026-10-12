# DASMA — M2b Script Screens: Design Spec

Date: 2026-10-12 · Status: draft for review
Parent spec: [`2026-10-10-dasma-design.md`](2026-10-10-dasma-design.md) (cited as "MVP spec §n"). Engine spec: [`2026-10-11-script-import-design.md`](2026-10-11-script-import-design.md) (cited as "M2a spec §n"). M2a results: [`docs/script-import-results.md`](../../script-import-results.md).

M2 is split in two. M2a built the script engine (`@dasma/script`). **M2b is this spec: the screens.** It completes MVP flow §3 "Prepare a production": create a production, import a script, fix tags, mark cuts and overlaps, enter the cast list, and export `.dasma`. An actor imports that file.

---

## 1. Goal and success criteria

**Goal:** a director, in Chrome or Edge on a laptop with no network, prepares a real production alone. The tag-correction screen is the centre of the work. M2a's held-out gate was NO-GO, so the screen must make every mistake listed in the M2a results ("What M2b's screen must carry") fixable with a single action.

**Who and where:** directors fix tags on a **laptop with keyboard and trackpad or mouse**. A touch/tablet layout is a later milestone, and every decision here keeps it cheap (§3.3).

**M2b is done when all five hold:**

1. **Real script.** The user imports one of their licensed scripts in Chrome with the network off. They fix its tags, mark some cuts and overlaps, and enter the cast. The time this takes, the page count and the number of fixes are recorded in `docs/script-screens-results.md`. The script itself is never recorded or committed.
2. **Round trip.** The user exports `.dasma` (with the cast list), opens it as a second production, and sees an identical script and cast.
3. **Re-import.** The user re-imports an edited copy of the script. The review screen shows the right counts, and fixes are kept on unchanged lines.
4. **Answer key.** "Export answer key" produces a `.truth.json`. Saved beside the script in `harness/local/`, it lets `npm run harness -- script-eval --set local` score the importer on that script.
5. **Checks.** Typecheck, lint and every test pass.

The bar is a solid, plain tool: no visual design pass, onboarding or help text beyond the shortcut sheet.

## 2. Scope

**In M2b:**
- Library, production page, import (with appending several files), tag correction, cast list, cuts and overlaps, `.dasma` export and import, re-import review.
- IndexedDB persistence (Dexie).
- The persistent-storage request and its warning (pulled forward from M5; §9).
- A developer-only "Export answer key" button.
- New pure functions in `@dasma/script`: edit operations, the check queue, "similar units", `appendScripts`, `toAnswerKey`, and the importer's `unitHints` output.

**Not in M2b:**
- Model download and engine status (M3); run settings (M3/M4).
- Backup zip, PWA offline install, Playwright E2E (M5). M2b makes no network calls, so it already works offline from the local dev or preview server or any static copy; installing it as an offline app is M5.
- A touch layout (later).
- Importer accuracy work. M2a.1 (the open real-script risks) is decided separately.

## 3. Architecture

### 3.1 `packages/script`: the editing layer

All correction logic is pure, browser-free and tested in Node, like the importer.

| Export | File | What it does |
|---|---|---|
| `applyEdit(script, op): Script` | `src/edit/apply.ts` | Applies one `EditOp` (§6) and returns a new script. Unchanged units and characters are reused by reference. Throws `EditError` for an op that does not apply (unknown unit id, a join with nothing before it, an overlap outside dialogue). |
| `EditOp`, `EditError` | `src/edit/ops.ts` | The tagged union of operations (§6.2) and its error. |
| `checkQueue(script): CheckItem[]` | `src/edit/check.ts` | Unsure units in script order, each with a `reason` (§6.1). |
| `similarUnits(script, hints, unitId): string[]` | `src/edit/similar.ts` | Other unsure units "like this one" (§6.4). |
| `appendScripts(a, b, pageOffset): Script` | `src/edit/append.ts` | Joins two imported scripts in order (§5.2). |
| `pruneCharacters(script, keep): Script` | `src/edit/apply.ts` | Removes characters with no dialogue units, unless their id is in `keep` (the cast list's keys). |
| `toAnswerKey(script, pages): AnswerKey` | `src/answer-key.ts` | The `.truth.json` shape that `script-eval --set local` reads (§8). |
| `ImportResult.unitHints` | `src/units.ts`, `src/import.ts` | New additive output: `Record<unitId, UnitHint>` with `{ band: number \| null; italic: boolean }`, the indent band and italic flag of the unit's first line. It changes no tag, so M2a scores are unchanged. |

`EditError`, `CheckItem`, `AnswerKey` and `UnitHint` are exported types. New unit ids follow the importer's pattern `u<n>` and take the next number above the highest in the script, as `carryOver` already does.

### 3.2 `apps/web`

Organised by screen:

| Folder | Holds |
|---|---|
| `src/db/` | The Dexie schema (§4) and a repository: `listProductions`, `getProduction`, `createProduction`, `updateProduction`, `deleteProduction`, `getLiveVersion`, `listVersions`, `saveScript` (with the `rev` check), `addVersion`, `getMeta`, `setMeta`. Screens never touch Dexie directly. |
| `src/import/` | `import.worker.ts`, a module Web Worker that runs `importScript` (and `readDasma`); `importClient.ts`, a promise wrapper with progress and crash handling. |
| `src/router.ts` | A hash router of about 40 lines: `#/`, `#/new`, `#/p/:id`, `#/p/:id/import`, `#/p/:id/fix`, `#/p/:id/reimport`. |
| `src/screens/` | `Library`, `ImportScreen`, `Production`, `FixTags`, `ReimportReview`, `OpenDasma`. |
| `src/fix/` | `useScriptEditor` (§7.1) and the Fix tags parts: `CheckList`, `CharacterList`, `ScriptView`, `FixPanel`, `CharacterPicker`, `ShortcutSheet`. |
| `src/ui/` | Primitives. `Button` takes an optional `shortcut` and renders its key hint. One `useShortcuts` hook binds keys to the same handlers the buttons call. |

**New dependencies:**
- **App:** `dexie`.
- **Dev only:** `fake-indexeddb`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`.

**pdf.js in the worker.** `pdfjs-dist` needs `GlobalWorkerOptions.workerSrc` in the browser (Node runs it without a worker). Running it inside our own module worker is unproven, so the plan's first task is a spike: import a PDF fixture through `import.worker.ts` in Chrome under `vite dev` and `vite preview`, and record the result in the plan's ledger. If nested workers fail, the fallback is pdf.js's in-thread mode inside our worker, which still keeps the main thread free.

### 3.3 Keeping touch cheap later

- Every keyboard shortcut has a visible button that calls the same handler (enforced by `Button` + `useShortcuts` and a test, §10).
- No hover-only controls. No drag interactions: ranges are click then shift-click.
- Pointer events (`onPointerDown`/`onClick`), never mouse-only events.
- All correction rules live in `@dasma/script`; the screen is a view over them. `FixPanel` is self-contained so a tablet layout can host it as a bottom sheet.

## 4. Data and storage

One Dexie database, `dasma`, schema version 1:

```ts
interface ProductionRow {
  id: string;                         // crypto.randomUUID()
  title: string;
  cast: Record<string, string[]>;     // characterId → actor names (the .dasma shape)
  origin: 'created' | 'dasma';
  createdAt: number; updatedAt: number;
}
interface ScriptVersionRow {
  id: string;
  productionId: string;
  version: number;                    // 1, 2, 3 … the highest is live
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  importedFrom: { kind: 'pdf' | 'docx' | 'text' | 'dasma'; names: string[] };
  warnings: ImportWarning[];
  rev: number;                        // save counter
  createdAt: number;
}
interface MetaRow { key: string; value: unknown }  // 'persist' → 'granted' | 'denied'; 'devTools' → boolean
```

Indexes: `productions` by `id`, `updatedAt`; `scripts` by `id`, `[productionId+version]`; `meta` by `key`.

**Rules:**
- **Versions.** Corrections edit the live version in place. A re-import adds version n+1. Older versions are read-only and all are kept.
- **Confirmation is confidence.** Any edit to a unit, and "It's right", sets its `tagConfidence` to 1, which removes it from the check queue. `carryOver` already keeps confidence on unchanged units and re-flags changed ones, so no new field is needed.
- **Stable character ids.** Rename changes `name` only. Merge moves lines and aliases to the target and removes the source. A new character gets `slugId(name)`, made unique with `-2`, `-3` …. Cast keys stay valid.
- **Undo history** lives in memory only and is lost on reload; the saved script is always the latest state.
- **Two tabs.** `saveScript(id, script, expectedRev)` writes only if the stored `rev` equals `expectedRev`, then increments it. On a mismatch the editor stops saving and shows "This script was changed in another tab. Reload to continue." There is no silent overwrite.
- **Hints follow ids.** Split pieces inherit the parent's hint; a join keeps the first unit's hint. On re-import the new import's hints are re-keyed through the same id mapping `carryOver` applies.

## 5. Screens and flows

### 5.1 Library (`#/`)

- Production cards: title, live version, "N to check", last edited. Newest first.
- Buttons: **New production** and **Open .dasma file**.
- Banners: storage refused (§9).
- Empty state: one line naming the two ways to start.
- Footer: a **Show developer tools** switch, stored in `meta`.

### 5.2 Import (`#/new`; `#/p/:id/import` for a re-import)

- **New production only:** a title field, filled from the first file's name (without extension) until the user types.
- **Source:** pick or drop files (`.pdf`, `.docx`), or a paste box. **Add another file** builds an ordered list with move-up/move-down and remove buttons.
- **Several files.** Each file is imported separately in the worker. Results are joined in list order by `appendScripts(a, b, pageOffset)`:
  - units are concatenated; `b`'s unit ids are renumbered above `a`'s highest, and `b`'s `source` pages are shifted by `pageOffset` (the pages so far);
  - characters with the same id merge (aliases unioned, `a`'s name kept);
  - `pages` is the sum; warnings are the union; hints are re-keyed with the ids.
- **Progress:** the worker posts "Reading file 2 of 3…"; pdf.js page progress where available.
- **Errors** use `IMPORT_ERROR_MESSAGES`. For `noTextLayer` the screen adds **Paste the text instead**, which switches to the paste box. Nothing is saved after an error.
- **Warnings** are shown in plain words before continuing:
  - `noSpeakers`: "We couldn't find character names. Is each speech labelled like `NAME:` or with the name on its own line?"
  - `manyFlagged`: "Many lines are unsure (N%). Fixing will take longer than usual."
  - `mixedConventions`: "This script labels speakers in two ways; check the speaker of each speech."
  - `ambiguousAlias`: "`TOKEN` could be A or B; check those speeches."
- **Continue** creates the production and version 1 (new) and opens Fix tags, or opens Re-import review (re-import). A re-import is not saved until the review is accepted.

### 5.3 Production (`#/p/:id`)

- Title, editable in place.
- **Script:** version, number of units, "N to check", last edited, and buttons **Fix tags**, **Re-import**, **Export .dasma**.
- **Export .dasma** dialog: an "Include cast list" checkbox, then download `<title>.dasma` via `writeDasma(script, { cast })`. Cast entries with no actor names are left out.
- **Cast list:** one row per character (name, alias chips, an actor-names field accepting several names separated by commas). Saved on blur. Characters with no dialogue are listed after the rest.
- **Versions:** read-only list with version, date and source file names.
- **Export answer key** (developer tools only): downloads `<title>.truth.json` (§8).
- **Delete production:** confirmation requires typing the title. Deletes the production and all its versions.

### 5.4 Fix tags (`#/p/:id/fix`)

§6.

### 5.5 Re-import review (`#/p/:id/reimport`)

The new script is held in memory until accepted.

- **From a PDF, Word or pasted re-import:** `diff = diffScripts(live, next)`, then `merged = pruneCharacters(carryOver(live, next, diff), castKeys)`.
- **From a `.dasma` update** (an actor receiving the director's new file): the file's script is taken **as is**, without `carryOver`. The director's tags are authoritative, and `carryOver` would keep the actor's old tags on unchanged text. The diff is computed only for the summary.
- **Summary:** "N lines changed · N added · N removed · N unchanged". For a `.dasma` update it adds "N lines retagged or re-cut": unchanged-text pairs whose `kind`, `characterId`, `cut` or `overlapRanges` differ. Actors care about cuts.
- For a file re-import it also says "Your fixes are kept on unchanged lines."
- **Change list:** changed, added and removed units in script order, old text beside new, with a filter by type.
- **Keep as version n+1** saves the new version (the production's cast is kept, and cast entries are carried to the version's characters by id) and opens Fix tags, where changed lines are in the check list. **Cancel** discards it.
- **Known limit:** if the user split or joined units in the old version, the diff matches only one piece; the rest shows as removed or added. The changed piece is re-flagged.

### 5.6 Opening a `.dasma` file

- From the Library. `readDasma` runs in the worker.
- **Errors**, per `ScriptFormatError` reason:
  - `notJson` / `notDasma`: "This isn't a DASMA script file."
  - `newerVersion`: "This file was made by a newer version of DASMA. Update the app to open it."
  - `invalid`: "This DASMA file is damaged and can't be opened."
- **Title clash.** If a production with the same title exists, the user chooses **Update "<title>"** (opens Re-import review as a `.dasma` update) or **Import as a new production**. `.dasma` v1 carries no production id, and adding one would change the format, so matching is by title with an explicit choice.
- A new production gets `origin: 'dasma'`, the file's cast, and version 1 with `importedFrom.kind = 'dasma'` and empty `unitHints`.

## 6. The Fix tags screen

Three columns (layout A from brainstorming): **check list and characters** on the left, **the script** in the centre, **the fix panel** on the right. A header holds the title and version, "N to check", Undo and Redo buttons, the save state ("Saved", "Saving…", or an error from §9), and **Done** (back to the production page).

### 6.1 Check list

`checkQueue(script)` returns every unit with `tagConfidence < FLAG_BELOW`, in script order, with a reason:

| Reason | When |
|---|---|
| `newCharacter` | A `characterName` unit, or a dialogue unit, whose character has exactly one speech |
| `noSpeaker` | A `dialogue` unit without `characterId` |
| `heading` | A `heading` unit |
| `unsure` | Any other unsure unit (shown as "unsure dialogue", "unsure direction" …) |

Fixing or confirming an item removes it. `j`/`k` move through the list and select the unit in the script.

### 6.2 Edit operations

Each is one `EditOp`. Every op sets `tagConfidence = 1` on the units it touches.

| Op | Effect |
|---|---|
| `confirm { unitIds }` | Confidence only ("It's right"). |
| `setKind { unitIds, kind }` | Sets `kind`. Leaving `dialogue` clears `characterId` and `overlapRanges`. The text is kept. |
| `speechBy { unitIds, characterId }` | Sets `kind: 'dialogue'` and `characterId`. **On a `characterName` unit** (risk I2, "OKAY."), it also reassigns the speech that followed it: the following dialogue units up to the next `characterName`, `heading` or `sceneBreak` unit. Characters left with no dialogue are pruned (cast keys kept). |
| `newCharacter { name }` | Adds a character (`slugId`, made unique). Used by the picker's "New character…" before `speechBy`; applied as one undo step with it. |
| `setName { unitId, characterId }` | Sets `kind: 'characterName'` and records which character it cues: the following speech (as in `speechBy`'s reach) is assigned to `characterId`. |
| `editText { unitId, text }` | Replaces the text. Clears `overlapRanges` (word positions would be stale); the screen says so. Empty text is refused (use `remove`). |
| `split { unitId, atWord }` | Splits before word index `atWord` (1 ≤ atWord < word count). Both pieces keep kind, character, cut and `source`; overlap ranges are divided and re-based. The second piece gets a new id. |
| `join { unitId }` | Joins the unit onto the previous one: texts joined with a space, `source` concatenated, overlap ranges re-based. The result keeps the first unit's kind and character. |
| `remove { unitIds }` | Deletes units (for junk such as stray page furniture). |
| `setCut { unitIds, cut }` | Whole units. |
| `setCutWords { unitId, from, to, cut }` | Part of a unit: splits at `from` and `to` (as needed) and sets `cut` on the middle piece. `.dasma` stays at v1, since cuts stay per unit. |
| `setOverlap { unitId, from, to, on }` | Adds or removes the half-open word range `[from, to)` in `overlapRanges` (dialogue only); ranges are kept sorted and merged. |
| `insertSceneBreak { beforeUnitId }` / `removeSceneBreak { unitId }` | Adds or removes a `sceneBreak` unit. |
| `renameCharacter { characterId, name }` | Display name only. |
| `editAliases { characterId, aliases }` | Replaces the alias list (trimmed, de-duplicated, case-insensitive). |
| `mergeCharacters { fromId, intoId }` | Moves `fromId`'s dialogue to `intoId`, unions aliases (adding `from`'s name), removes `fromId`. The cast entry of `fromId` is merged into `intoId`'s by the screen. |
| `splitAlias { characterId, alias }` | Fixes silent merges (CAPULET → CAPULET'S COUSIN; MAX → MAXINE): creates a character named `alias`, removes the alias from the original, and moves every speech cued by a `characterName` unit whose text normalises to that alias. |
| `moveSpeeches { unitIds, characterId }` | Reassigns selected dialogue units to an existing or new character. |
| `batch { ops }` | Applies several ops as one undo step (used by apply-to-similar). |

Word indices are `tokenize` indices from `@dasma/align`, the same indices `overlapRanges` already uses.

### 6.3 Script view, selection and keys

- **Display:** names bold, directions italic, headings and scene breaks as rules, front matter dimmed. Cut text struck through and dimmed; overlap words with a wavy underline; unsure units with an amber left edge. Character colour is not used in M2b.
- **Long scripts:** each unit block uses CSS `content-visibility: auto` with an intrinsic size, so a 5,000-unit script stays responsive with no virtualisation library.
- **Selection:** click a unit to select it; shift-click extends to a range of units. Click a word to select it; shift-click a second word in the same unit selects the words between. No dragging.

| Key | Action | Button label |
|---|---|---|
| `j` / `k` | Next / previous item to check | Next / Previous |
| `↓` / `↑` | Next / previous unit | — (arrows on the panel) |
| `s` | Speech by… (opens the character picker) | Speech by… |
| `n` | Character name… (opens the picker) | Character name… |
| `d` | Direction | Direction |
| `h` | Heading | Heading |
| `f` | Front matter | Front matter |
| `Enter` | It's right | It's right |
| `e` | Edit text (`Cmd+Enter` saves, `Esc` cancels) | Edit text |
| `/` | Split before the selected word | Split here |
| `J` (shift-j) | Join with previous | Join to previous |
| `x` | Cut / uncut the selection (units or words) | Cut |
| `o` | Overlap on / off for the selected words | Overlap |
| `b` | Scene break before | Scene break before |
| `Delete` | Remove unit | Remove |
| `Cmd+Z` / `Shift+Cmd+Z` | Undo / redo | Undo / Redo |
| `?` | Shortcut sheet | ? |

Shortcuts are ignored while a text field or the picker has focus (except `Esc` and `Cmd+Enter`). On Windows/Linux `Ctrl` replaces `Cmd`.

**Character picker:** type to filter by name or alias; `1`–`9` pick the nearby speakers (the speakers of the closest dialogue units before and after, most recent first); the last row is "New character…", which asks for a name.

### 6.4 Apply to similar

When the selected unit is unsure, the fix panel shows "☐ Also apply to the N other lines like this" (hidden when N = 0). `similarUnits(script, hints, unitId)` returns the other units still in the check queue with:

- the same reason, and the same `kind`;
- and, if both units have hints, the same `band` and `italic`;
- and, for `newCharacter`, the same character name, normalised (every "OKAY." line).

With the box ticked, the action is applied to all of them as one `batch` (one undo step). For `speechBy` the chosen character is applied to every unit. The box resets after each action.

### 6.5 Characters panel

Each character shows name, alias chips and line count. Clicking it highlights its lines in the script. Its menu offers **Rename**, **Edit aliases**, **Merge into…**, and **Split alias out** (one entry per alias). **Move selected speeches to…** is in the fix panel when dialogue units are selected.

## 7. Editor state and saving

### 7.1 `useScriptEditor(versionId)`

- Loads the live version, holds `script` in React state, and exposes `apply(op)`, `undo()`, `redo()`, `canUndo`, `canRedo`, `saveState`.
- `apply` runs `applyEdit`; on `EditError` the script is unchanged and the message shows in the fix panel.
- Undo and redo are stacks of whole `Script` values (cheap thanks to structural sharing), capped at 200 steps.
- Saving: 500 ms after the last change, and immediately on route change, `visibilitychange` to hidden, and `pagehide`. Each save calls `saveScript` with the expected `rev`.

### 7.2 Cast and characters

The cast list is stored on the production keyed by character id. The editor passes the cast's keys to every pruning step, so a character with an actor is never pruned. Merging characters moves the cast entry as well (§6.2).

## 8. Answer key

`toAnswerKey(script, pages)` produces exactly what `script-eval --set local` reads:

```ts
interface AnswerKey {
  pages: number;
  cast: Character[];
  units: Array<{ kind: UnitKind; characterId?: string; text: string; page: number }>;
}
```

- `page` is the unit's first `source` page (at least 1); `pages` is at least 1.
- Cut units are included as their kind (cuts are not part of import truth).
- The harness's `draftTruth` is rebuilt on top of it (adding its `check` marks), so the browser and the CLI share one implementation. Its existing tests must still pass.
- The download is named `<title>.truth.json`. The screen reminds the user that it contains the script's text and belongs in `harness/local/` (git-ignored), next to the script file with the same stem.

## 9. Errors

| Situation | Behaviour |
|---|---|
| Import error | `IMPORT_ERROR_MESSAGES`; `noTextLayer` adds **Paste the text instead**. Nothing saved. |
| Worker crash or hang (no progress message for 60 s) | "Import stopped unexpectedly. Try again, or paste the text." Nothing saved. |
| Unsupported file | The Import picker accepts `.pdf` and `.docx`; Open .dasma accepts `.dasma`. A dropped file of another type gets `unsupportedFormat`'s message. |
| `.dasma` errors | §5.6. |
| Save fails (e.g. quota) | Red bar: "Not saved: the browser is out of space. Export a .dasma backup now." Edits stay in memory; the next change retries. |
| Another tab saved first | §4; editing continues in memory but saving stops until reload. |
| Persistent storage | `navigator.storage.persist()` is called when the first production is created. If refused, the Library shows: "Your browser may clear DASMA's data when disk space is low. Export a .dasma file after big changes." Dismissable; it reappears when a new production is created. |
| IndexedDB unavailable | Full-page message: "This browser is blocking storage, so DASMA can't keep your scripts. Use a normal Chrome or Edge window." |
| Safari or Firefox | A small "best effort" notice; not blocked (D20). |
| Leaving Fix tags | The pending save is flushed first. |

## 10. Testing

**`packages/script`** (Vitest, Node):
- Each `EditOp`, including its refusals.
- Each M2a "must carry" mistake fixed by one op on a small fixture: missed speech (`speechBy`), fake character "OKAY." (`speechBy` on a name), CAPULET'S COUSIN and MAXINE (`splitAlias`), heading → front matter (`setKind`), merge/split/invented speech (`split`, `join`, `editText`, `remove`).
- `checkQueue` reasons; `similarUnits` (the word-3 leading-tab case with hints); `appendScripts` (ids, pages, merged characters); `toAnswerKey` (and `draftTruth` still scoring its own import as perfect); `unitHints` present for every unit and M2a's tests unchanged.
- **Property test** (fast-check): random op sequences on random small scripts always yield a valid script. Unit ids are unique, every `characterId` names a character, overlap ranges are sorted, disjoint and within the unit, and `readDasma(writeDasma(s))` equals `s`.

**`apps/web`** (Vitest with jsdom, Testing Library, `fake-indexeddb`):
- The repository, including the `rev` conflict and cascade delete.
- `useScriptEditor`: apply, undo/redo, the debounced save and the flush.
- Each screen's main path: create from paste → fix → cast → export; open `.dasma` (new and update); re-import review counts.
- **Shortcut parity:** for every key in §6.3, pressing it and clicking its button produce the same script.
- The worker is mocked in jsdom; the real worker is covered by the spike (§3.2) and the manual done-check (§1).

Playwright stays in M5.

## 11. Changes to the MVP spec

Applied to [`2026-10-10-dasma-design.md`](2026-10-10-dasma-design.md) when M2b lands:

- **§5 Production:** `cast` is `Record<characterId, actorName[]>` (the `.dasma` shape); production gains `origin`. Settings arrive with M3/M4.
- **§6 item 4:** "range-select" means click then shift-click (no drag), for words and for units; partial cuts split the unit.
- **§6 item 5:** a `.dasma` update replaces the script as is and also counts retagged or re-cut lines.
- **§8.1 Library:** engine status and model download remain M3; the persistent-storage request is in M2b.
- **§11:** M2b covers the cast list (previously listed under M4) and the persistent-storage request (previously M5).
