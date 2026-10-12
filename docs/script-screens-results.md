# M2b script screens — results

Spec: [`docs/superpowers/specs/2026-10-12-script-screens-design.md`](superpowers/specs/2026-10-12-script-screens-design.md) §1.

## Automated checks

| Check | Result |
|---|---|
| `npx vitest run` | 796 tests passed, 4 skipped (79 test files passed, 2 skipped) |
| `npm run typecheck` | Clean (exit 0) |
| `npx eslint .` | Clean (exit 0) |
| `npm run build -w apps/web` | Builds (exit 0); Vite warns that the main chunk is over 500 kB |
| PDF import in a browser worker (Task 10 spike) | Works: nested pdf.js worker (`GlobalWorkerOptions.workerSrc` set inside the import worker); the in-thread fallback was not needed. Run under `vite dev` in a Chromium-based browser; it printed "OK 8 units; characters hamlet,horatio". |

## Done-check (run by the user, network off)

Run `npm run build -w apps/web && npx vite preview --port 4173` in `apps/web`, open `http://localhost:4173` in Chrome, then turn the network off.

1. **Real script.** New production → import one licensed script → fix its tags (check list to zero), mark at least one cut and one overlap, enter the cast. Record below; never record or commit the script.
2. **Round trip.** Production page → Export .dasma with the cast list → Library → Open .dasma file → Import as a new production. The script and cast must match.
3. **Re-import.** Edit a copy of the script file (change a few lines), Re-import it, check the counts, keep it, and confirm earlier fixes survived on unchanged lines.
4. **Answer key.** Show developer tools → Export answer key → save beside the script in `harness/local/` → `npm run harness -- script-eval --set local`.

| Item | Result |
|---|---|
| Script (family, pages) | (fill in, no title) |
| Time to fix, cut and cast (minutes) | (fill in) |
| Fixes per page (from `script-eval --set local`) | (fill in) |
| Round trip identical | (yes / no) |
| Re-import counts right, fixes kept | (yes / no) |
| Problems found | (fill in) |
