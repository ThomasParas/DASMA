# DASMA — Pre-Flight Decisions & Research

**DASMA: Director's Assistant – Stage Manager App**
Status: pre-flight complete, design in progress · Last updated: 2026-10-10

This document records every decision made during pre-flight, the reasoning behind it, and the research it rests on. It is the reference for the design spec that comes next.

---

## 1. The product in one paragraph

DASMA listens to a live voice feed and compares it against a script or monologue the user provides, entirely offline. It tells the user what was said correctly, what was dropped, and what was changed — either instantly (an alert on the wrong word) or after the run (a report). Its headline use is **standing in for the stage manager "on book"** when a director runs scenes without one: following along, prompting actors who call for a line, and producing line notes afterward.

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Primary user | **Both solo and director modes — director mode is the main pain point** | It's the user's own need, and the market gap: no existing product listens to a multi-actor scene or produces line notes automatically. |
| D2 | Build order | **Build and validate the matching engine on solo/close-mic use; shape all output around line notes and multi-character scripts from day one** | Solo is the easier audio problem for proving accuracy; designing for line notes up front means director mode is the next milestone, not a rewrite. |
| D3 | Audio setup (director mode) | **One laptop on the director's table** (built-in or whatever mic it has) | If DASMA is in use, a human SM isn't available — so proper mics can't be assumed either. Far-field room audio is the **baseline target**, not an edge case. |
| D4 | Audio sources | **Pluggable audio-source interface**; per-actor sources (e.g. one phone per actor) are a future option, not MVP | Capturing audio well is a separate problem; DASMA's job is the software. The interface keeps the door open. |
| D5 | During a director-mode run | **Core:** silent live view for the director + on-book prompting. **Optional:** audible buzz into the room. **Included:** director quick-mark. | See §3. |
| D6 | Script import (MVP) | **Text-based PDF** (publisher scripts), **Word / Google Docs**, **pasted plain text** | Covers licensed plays and new work. Scanned PDFs (OCR) and screenplay formats (Fountain/FDX) are deferred. |
| D7 | Script pipeline | Extract text → auto-tag (character / dialogue / stage direction) → **tag-correction screen** → save as a reusable DASMA script file | Stage plays have no standard format; auto-tagging will be imperfect, so a fast human correction step is required, not optional. |
| D8 | Language | **English only** for MVP | Model choice and phonetic matching are language-specific. |
| D9 | Strictness | **Word-perfect by default**, with a strict ↔ lenient slider; gist mode lives at the lenient end (stretch goal) | Licensed theatre typically requires word-perfect delivery; other uses (auditions, speeches) want leniency. |
| D10 | Line-note output | **Printable PDF per actor** + copy to clipboard. No email/cloud. | Matches how SMs deliver notes; keeps everything offline. |
| D11 | Platform | **Browser-first offline web app (PWA) in TypeScript, packaged later as a Tauri desktop app** | Zero-install link sharing suits a free MVP; Tauri reuses the same UI, so the desktop/air-gapped build is packaging, not a rewrite. Mobile comes later. |
| D12 | First milestone | **Engine test harness before any UI**: record a real scene from the director's table (with deliberate errors), run it through recognizer + aligner, measure false alarms per run and errors caught | Far-field accuracy from a laptop is the single biggest technical unknown. Find out in week one. |
| D13 | Solo-mode cues | **Layered:** cue line always on screen; on-device TTS reads it aloud by default (distinct voice per character where possible, mutable); optional self-recorded cues per character replace TTS. Settings: cue length (full line / last few words), hide-my-lines (shown / first letters / hidden-until-said). Matching pauses while a cue plays. | Covers every preference; TTS/display machinery is shared with director-mode on-book prompting. |
| D14 | Grace window | **User-adjustable slider** ("Patience": instant ↔ relaxed), default set from test-harness results. Affects only the live alert; the after-run report always judges with full context. | Optimal pause is unknown and likely varies by person and cast. |
| D15 | Speaker attribution (director mode) | **Script order + self-recovery** with a visible "lost" state showing best-guess positions; **manual jump** (click/search a line) anytime, also used to start mid-scene. Notes are attributed to the character who owns the line. Per-actor voice ID **deferred**. | Covers a normal run; the director keeps an escape hatch. Voice ID is costly and unreliable far-field. |
| D16 | Overlapping dialogue | **Overlap zones are "unchecked":** detected from `/` overlap marks on import or tagged in the correction screen; no alerts, cursor holds position, report says "overlap — not checked". Two-cursor matching **revisited once per-actor audio exists**. | One far-field mic can't separate simultaneous voices; protects the false-alarm budget. |
| D17 | Audio retention & consent | **Rolling in-memory buffer; only short clips around each line note / quick-mark are saved** (≈5 s before, 3 s after), playable from the note. Kept with the session until deleted, with an **optional auto-delete after N days**. **"No audio clips" switch** per production (text + timestamps only). Full-run recording off by default, opt-in. Always: audio never leaves the device, visible listening indicator, first-run reminder to inform the cast. | Clips make notes verifiable (and expose app mishears); the switch and auto-delete respect actors, unions, and privacy. |
| D18 | Sharing scripts with the cast | **Export/import a `.dasma` script file** (text + tags + overlaps + cuts), passed around by whatever means the director already uses (AirDrop, USB, email, shared drive). Re-import shows a "script updated: N lines changed" summary. Line notes stay separate (D10). Practice stats flowing back to the director **deferred**. | No hosting (scripts are copyrighted; offline-first); tagging is done once by the director. |
| D19 | Cuts | **In MVP:** director can mark passages as cut; cut text is never expected, alerted, or noted. Cuts travel in the `.dasma` file. | Directors routinely cut licensed scripts; one unhandled cut would break notes for a whole scene. |
| D20 | Browser support | **Chrome & Edge: supported and tested. Safari & Firefox: best effort.** Always request persistent storage (warn if denied); backup/export of scripts and sessions is first-class. Tauri desktop build is the real fix for Safari users and air-gapped machines. | Chromium has the strongest WASM/WebGPU/PWA support; Safari may evict site data after ~7 days unused. |
| D21 | Test audio | **Synthetic first:** public-domain scenes with planted, auto-labeled errors (drops, swaps, paraphrases, skips, self-corrections, long pauses), multiple TTS voices, simulated room (reverb, distance, noise, laptop-mic response). **Real rehearsal recordings later** from the user (target 10–15 min, 2–3 scenes, a couple of rooms) to set defaults and validate far-field viability. | Synthetic audio is unlimited and labeled but optimistic; real audio is the truth test. |

---

## 3. Director-mode run behavior (D5 detail)

- **Live view (silent, default):** script scrolls with the scene; words light up as spoken; errors marked. Nothing audible to the room. Line notes compiled at end of run.
- **On book (core):** when an actor calls "Line!", DASMA shows the next line large on screen and/or speaks it via on-device text-to-speech. Automatically logged as a *called for line* note. This is what turns DASMA from a checker into a replacement for the person on book.
- **Audible buzz (optional, per-session toggle):** for drill-style rehearsals.
- **Director quick-mark:** one keypress flags "something was off here" — either an error the app missed or a flag the director doubts. The surrounding audio is kept for review after the run.

---

## 4. Technical direction (from research)

### 4.1 The core risk: false alarms vs. hidden errors

- Local speech recognizers mishear ~3–10% of words in clean conditions, more across a room. A naive "transcribe and diff" approach buzzes on perfect runs — and two false buzzes destroy trust.
- The obvious fix — telling the recognizer what to expect — backfires if pushed hard: it starts "hearing" the correct line even when the actor said it wrong. Reading-tutor research confirms a recognizer constrained to the target text can't detect miscues on its own.
- A Sept 2026 study of recitation checking found **45% of transcript-vs-reference differences were benign or self-corrected**. Differences must be *classified*, not just diffed.

### 4.2 Engine architecture: "listen honestly, align in our own code"

1. **Streaming recognizer, mostly unbiased.** At most a *light* boost toward the next ~10–20 script words (helps with character names and rare words).
2. **Our own alignment cursor** tracks position in the script, using phonetic similarity so homophones aren't flagged.
3. **Confirmation / grace window:** a word is flagged only after the following words confirm the actor went off-script. This also absorbs self-corrections ("the — *a* dagger").
4. **Re-anchoring:** when the speaker jumps or skips, find the new position in the script — this is what produces *skipped line*, *jumped cue*, and *out of order* notes.
5. **Classification** of each difference: real error vs. self-corrected vs. benign.
6. **Optional second pass:** a more accurate model re-checks each finished line and can withdraw a false flag before it becomes a line note. The buzz stays fast; the written record stays trustworthy.

### 4.3 Model choices

| Role | Choice | Notes |
|---|---|---|
| Live recognizer | **sherpa-onnx + streaming Zipformer (English)** | Apache-2.0; ~20–80 MB; true streaming (~200–400 ms est.); runs in browser (WASM), desktop (native), iOS/Android — one engine everywhere. Supports light hotword boosting. |
| Second-pass checker (optional) | **NVIDIA Parakeet-TDT-0.6B-v3** | CC-BY-4.0; best accuracy in class; chunked, not streaming; ~1.2 GB fp16 in browser via WebGPU — likely desktop-only in practice. |
| Accuracy upgrade to watch | NVIDIA Nemotron Speech Streaming 0.6B | True streaming, ~7.7% WER at 160 ms chunks; sherpa-onnx support unverified. |
| Gist mode (stretch) | **all-MiniLM-L6-v2** (~23 MB) sentence similarity, + rule checks for negations, numbers, names | Embeddings treat "I will" ≈ "I won't"; the rule layer is mandatory. Small local LLM (e.g. Qwen3-0.6B) possible for end-of-line verdicts. |
| Text-to-speech (on-book prompting) | On-device TTS (e.g. Kokoro, or OS voices) | To be chosen in design. |

**Ruled out for the live path:**
- **Whisper** — chunked (1–5 s latency), hallucinates during silence (actors pause dramatically), and using the script as its prompt hides real errors.
- **Chrome Web Speech on-device mode** — Chrome-only, experimental, needs an online download to install (breaks air-gap).
- **Apple on-device speech** — Apple-only; contextual biasing doesn't apply to its streaming transcriber.

---

## 5. Market landscape

### 5.1 Closest competitors

| Product | Platform | Listens & verifies? | Offline? |
|---|---|---|---|
| Call for Line | iPhone (pre-launch) | Yes — per-word, after the run; nailed/swapped/dropped | Not stated |
| Cue Line | iOS | Yes — accuracy score + missed words | Scoring on device |
| Offbook | Web | Yes — strict/lenient slider (only paraphrase control found) | No (server-side) |
| LineLearn | Web | Yes (claimed, phoneme-level) | Not stated |
| LineEcho | Browser | Partly — words light up, missed words stay unlit | Recognition on device |
| understudy (open source, MIT) | PWA | Yes — per-line score, per-word color map | Yes |
| Tarteel (Quran) | iOS/Android | **Yes, live** — flags each mistake as it happens | No |
| Line-It (UrbanByte) | iPad/Mac | No — *manual* SM line-notes tool | Yes |
| AI scene-partner apps (Counterpart, Linus, CueUp, Run Lines, ScenePartner, etc.) | Mostly iOS | No — detect cue/end of line only | Mostly no |

### 5.2 Gaps DASMA fills

1. Nothing listens to a **multi-actor scene** from one device.
2. Nothing produces **line notes automatically** — SM tools are fully manual.
3. No actor app gives a **real-time alert** on a wrong word (only Tarteel, cloud-based).
4. **Offline** word-level checking is rare.
5. **Gist** judgment (meaning kept vs. changed) doesn't exist.
6. Nobody handles **self-corrections, jumps, skips** explicitly.
7. Nobody addresses **far-field room audio**.

### 5.3 Ideas to borrow

- **Call for Line:** a "Word Perfect" override button for mishears; adjustable pass threshold.
- **Offbook:** strict ↔ lenient slider as the user-facing control.
- **Tarteel / LineEcho:** words revealed/lit as spoken correctly; per-mistake alert.
- **LineEcho:** "lines to work on" across sessions.
- **Line-It:** one-tap per-actor line-notes report.
- **understudy:** sequence alignment (Needleman–Wunsch) + Double Metaphone phonetic matching.
- **promptme-ai / LiveKit teleprompter:** inverted-index re-anchoring after N unmatched words.

---

## 6. Line-note categories (working set)

There's no formal industry standard; this superset reflects common SM practice:

- Dropped line / skipped line
- Dropped word(s)
- Added word(s)
- Wrong word (substitution)
- Paraphrase
- Transposed / out of order
- Called for line
- Jumped cue / jumped ahead

(Mispronunciation and late cue are common but likely beyond reliable detection for MVP.)

---

## 7. Scope

**In MVP**
- Script import: text PDF, Word/Google Docs (exported file), pasted text; auto-tag + correction screen
- Cuts; overlap marking; `.dasma` script export/import for the cast
- Solo mode with close mic: instant alert and after-run report
- Director mode from one laptop: live view, on-book prompting, quick-mark, optional buzz
- Line notes per actor (PDF + clipboard)
- Strictness slider (word-perfect default)
- Fully offline after first load; English only

**Deferred**
- Gist mode (stretch)
- Per-actor audio sources
- Scanned-PDF OCR; Fountain / Final Draft import
- Tauri desktop packaging (soon after MVP); mobile apps (later)
- Second-pass accuracy model (likely arrives with desktop build)
- Premium features — only if real usage reveals them

---

## 8. Open questions (to resolve in design)

1. ~~Solo-mode cues~~ → resolved, see D13.
2. ~~Grace window~~ → resolved, see D14.
3. ~~Speaker attribution~~ → resolved, see D15.
4. ~~Overlapping dialogue~~ → resolved, see D16.
5. ~~Audio retention & consent~~ → resolved, see D17.
6. ~~Sharing scripts with the cast~~ → resolved, see D18 (and cuts, D19).
7. ~~Browser support targets~~ → resolved, see D20.
8. ~~Test recordings~~ → resolved, see D21.

---

## 9. Next steps

1. Finish the design walkthrough (architecture, components, data flow, error handling, testing) and resolve §8.
2. Write the design spec.
3. Build the engine test harness (D12) and measure far-field accuracy.
4. Implementation plan → build.

---

## Key sources

- sherpa-onnx — https://github.com/k2-fsa/sherpa-onnx
- Parakeet-TDT-0.6B-v3 — https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- Nemotron Speech Streaming — https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b
- Moonshine Voice — https://petewarden.com/2026/02/13/announcing-moonshine-voice/
- Reading-miscue detection limits (Rasmussen, SLaTE 2011) — https://people.es.aau.dk/~zt/doc/Rasmussen_miscue-paper_SLaTE2011.pdf
- Miscue detection with wav2vec2 vs Whisper — https://arxiv.org/abs/2406.07060v1
- Whisper hallucinations ("Careless Whisper") — https://arxiv.org/abs/2402.08021v2
- Recitation error classification study — https://arxiv.org/html/2609.12085v1
- Web Speech phrase boosting caveat (MDN) — https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionPhrase/boost
- all-MiniLM-L6-v2 ONNX — https://huggingface.co/Supabase/all-MiniLM-L6-v2
- understudy — https://github.com/akaSlip/understudy
- promptme-ai — https://github.com/larsbaunwall/promptme-ai
- screenplay-tools (Fountain/FDX) — https://github.com/wildwinter/screenplay-tools
- Call for Line — https://callforline.com · Offbook — https://offbook.com · LineLearn — https://linelearn.app · LineEcho — https://lineecho.app
- Tarteel mistake detection — https://tarteel.ai/blog/introducing-mistake-detection
- Line-It — https://urbanbyte.io/theatre-software/line-it-line-notes.html

*Competitor details come from vendor pages and store listings, not hands-on testing. Some latency and pricing figures are unverified.*
