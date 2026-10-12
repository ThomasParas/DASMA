# DASMA — Director's Assistant / Stage Manager App

DASMA listens to a live rehearsal and compares what is said against the script, entirely offline. It produces stage-manager-style line notes (dropped lines, wrong words, paraphrases, jumped cues, called-for-line) per actor, and can optionally alert immediately on a wrong word.

**Status:** early development. The matching engine (`packages/align`), the recognizer wrapper (`packages/asr`, sherpa-onnx streaming Zipformer), the script importer (`packages/script`) and a synthetic-rehearsal test harness (`harness/`) exist. There is no app UI yet. See the results of the latest engine pass in [docs/engine-pass-results.md](docs/engine-pass-results.md).

## Repository layout

| Path | What it is |
|---|---|
| `packages/align` | Pure-TypeScript script/speech aligner and line-note classifier |
| `packages/asr` | Recognizer interface, stabilizer, sherpa-onnx Node binding |
| `packages/script` | Script import: PDF, Word and pasted text into tagged scripts; `.dasma` files; re-import diff |
| `harness/` | Generates labelled synthetic rehearsals (Piper TTS + room simulation), runs the engine, scores it |
| `apps/web` | Placeholder for the browser app |
| `docs/` | Decisions, design specs, plans and results |

## Getting started

Requires Node ≥ 24.

```bash
npm install
npm test
```

The harness needs speech models (downloaded once, hashes pinned in `harness/models.lock.json`):

```bash
npm run harness -- fetch-models
npm run harness -- evaluate --scenes earnest-act1 --seeds 1 --rooms close-mic
npm run harness -- script-eval --set heldout --gate
npm run harness -- script-dump <file>
```

## Design documents

- [docs/preflight-decisions.md](docs/preflight-decisions.md) — product decisions and research
- [docs/superpowers/specs/2026-10-10-dasma-design.md](docs/superpowers/specs/2026-10-10-dasma-design.md) — MVP design spec

## License

MIT — see [LICENSE](LICENSE). Bundled scenes are public-domain texts (Wilde, Shakespeare). Speech models are downloaded separately under their own licenses.
