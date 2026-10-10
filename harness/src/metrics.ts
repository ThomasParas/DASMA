import { tokenize, type NoteDraft } from '@dasma/align';
import { isBenign, type Label } from './perturb';
import type { TimedEvent } from './run-engine';
import type { RenderedSegment } from './tts';

export const CORE_KINDS: ReadonlySet<string> = new Set(['dropped-words', 'wrong-words', 'dropped-line']);

export interface ScoredRun {
  errorLabels: number;
  detected: number;
  detectedInclChecks: number;
  sameCategory: number;
  coreLabels: number;
  coreDetected: number;
  soundAlike: { labels: number; detected: number };
  perCategory: Record<string, { labels: number; detected: number }>;
  falseNotes: number;
  falseChecks: number;
  falseAlerts: number;
  benignViolations: number;
  alertLatencies: number[];
}

export function labelTime(label: Label, segments: RenderedSegment[]): number | null {
  const s = segments[label.segmentIndex];
  if (!s) return null;
  const n = Math.max(1, tokenize(s.seg.text).length);
  return s.start + ((Math.min(label.wordIndex, n - 1) + 1) / n) * (s.end - s.start);
}

export interface FlagRecord {
  note: NoteDraft;
  alert: boolean;
  audioTime: number;
}

/** The notes that stand at the end of a run: a later lineDone for the same line supersedes earlier ones. */
export function finalNotes(events: TimedEvent[]): NoteDraft[] {
  const finalByLine = new Map<string, NoteDraft[]>();
  for (const { event } of events) if (event.type === 'lineDone') finalByLine.set(event.lineId, event.notes);
  return [...finalByLine.values()].flat();
}

export function flagRecords(events: TimedEvent[]): FlagRecord[] {
  return events.flatMap(({ event, audioTime }) => (event.type === 'flag' ? [{ note: event.note, alert: event.alert, audioTime }] : []));
}

export function scoreRun(labels: Label[], events: TimedEvent[], segments: RenderedSegment[]): ScoredRun {
  return scoreOutcome(labels, finalNotes(events), flagRecords(events), segments);
}

export function scoreOutcome(labels: Label[], notes: NoteDraft[], flags: FlagRecord[], segments: RenderedSegment[]): ScoredRun {
  const errors = labels.filter((l) => !isBenign(l.kind));
  const errorsPerLine = new Map<string, number>();
  for (const l of errors) errorsPerLine.set(l.lineId, (errorsPerLine.get(l.lineId) ?? 0) + 1);
  const benignLines = new Set(labels.filter((l) => isBenign(l.kind)).map((l) => l.lineId));
  const s: ScoredRun = {
    errorLabels: 0, detected: 0, detectedInclChecks: 0, sameCategory: 0, coreLabels: 0, coreDetected: 0, soundAlike: { labels: 0, detected: 0 },
    perCategory: {}, falseNotes: 0, falseChecks: 0, falseAlerts: 0, benignViolations: 0, alertLatencies: [],
  };
  for (const label of errors) {
    const onLine = notes.filter((n) => n.lineId === label.lineId);
    const hit = onLine.some((n) => n.status === 'note');
    const cat = (s.perCategory[label.kind] ??= { labels: 0, detected: 0 });
    s.errorLabels++;
    cat.labels++;
    if (hit) {
      s.detected++;
      cat.detected++;
    }
    if (label.soundAlike) {
      s.soundAlike.labels++;
      if (hit) s.soundAlike.detected++;
    }
    if (onLine.length) s.detectedInclChecks++;
    if (onLine.some((n) => n.status === 'note' && n.category === label.kind)) s.sameCategory++;
    if (CORE_KINDS.has(label.kind)) {
      s.coreLabels++;
      if (hit) s.coreDetected++;
    }
    const t = labelTime(label, segments);
    const alert = flags.find((f) => f.alert && f.note.lineId === label.lineId);
    if (t !== null && alert) s.alertLatencies.push(Math.max(0, alert.audioTime - t));
  }
  // Fair counting (pass spec §4.4): on a line with k planted errors, the first k notes and the first k alerts
  // can be detections; any beyond that are false. Lines with no planted error count every note and alert as false.
  const notesSeen = new Map<string, number>();
  for (const n of notes) {
    const k = errorsPerLine.get(n.lineId) ?? 0;
    if (n.status !== 'note') {
      if (k === 0) s.falseChecks++;
      continue;
    }
    if (k === 0) {
      s.falseNotes++;
      if (benignLines.has(n.lineId)) s.benignViolations++;
      continue;
    }
    const seen = (notesSeen.get(n.lineId) ?? 0) + 1;
    notesSeen.set(n.lineId, seen);
    if (seen > k) s.falseNotes++;
  }
  const alertsSeen = new Map<string, number>();
  for (const f of flags) {
    if (!f.alert) continue;
    const seen = (alertsSeen.get(f.note.lineId) ?? 0) + 1;
    alertsSeen.set(f.note.lineId, seen);
    if (seen > (errorsPerLine.get(f.note.lineId) ?? 0)) s.falseAlerts++;
  }
  return s;
}

export interface Aggregate {
  runs: number;
  audioMinutes: number;
  errorLabels: number;
  /** null when no errors were planted: there is nothing to have recalled, so no rate (never a vacuous 1.0). */
  recall: number | null;
  recallInclChecks: number | null;
  coreRecall: number | null;
  sameCategoryRate: number | null;
  soundAlikeLabels: number;
  soundAlikeRecall: number | null;
  perCategory: Record<string, { labels: number; detected: number }>;
  falseNotesPerRun: number;
  falseAlertsPerRun: number;
  falseChecksPerRun: number;
  benignViolationsPerRun: number;
  falseNotesPer10Min: number;
  falseAlertsPer10Min: number;
  latencyP50: number | null;
  latencyP95: number | null;
  rtfMean: number;
}

export function aggregate(runs: Array<ScoredRun & { durationSec: number; rtf: number }>): Aggregate {
  const sum = (f: (r: ScoredRun & { durationSec: number; rtf: number }) => number) => runs.reduce((s, r) => s + f(r), 0);
  const n = Math.max(1, runs.length);
  const minutes = sum((r) => r.durationSec) / 60;
  const per10 = (x: number) => (minutes > 0 ? (x / minutes) * 10 : 0);
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  const lat = runs.flatMap((r) => r.alertLatencies).sort((a, b) => a - b);
  const pct = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.max(0, Math.ceil(p * lat.length) - 1))]! : null);
  const perCategory: Record<string, { labels: number; detected: number }> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.perCategory)) {
      const c = (perCategory[k] ??= { labels: 0, detected: 0 });
      c.labels += v.labels;
      c.detected += v.detected;
    }
  }
  const errorLabels = sum((r) => r.errorLabels);
  return {
    runs: runs.length,
    audioMinutes: minutes,
    errorLabels,
    recall: ratio(sum((r) => r.detected), errorLabels),
    recallInclChecks: ratio(sum((r) => r.detectedInclChecks), errorLabels),
    coreRecall: ratio(sum((r) => r.coreDetected), sum((r) => r.coreLabels)),
    sameCategoryRate: ratio(sum((r) => r.sameCategory), errorLabels),
    soundAlikeLabels: sum((r) => r.soundAlike.labels),
    soundAlikeRecall: ratio(sum((r) => r.soundAlike.detected), sum((r) => r.soundAlike.labels)),
    perCategory,
    falseNotesPerRun: sum((r) => r.falseNotes) / n,
    falseAlertsPerRun: sum((r) => r.falseAlerts) / n,
    falseChecksPerRun: sum((r) => r.falseChecks) / n,
    benignViolationsPerRun: sum((r) => r.benignViolations) / n,
    falseNotesPer10Min: per10(sum((r) => r.falseNotes)),
    falseAlertsPer10Min: per10(sum((r) => r.falseAlerts)),
    latencyP50: pct(0.5),
    latencyP95: pct(0.95),
    rtfMean: sum((r) => r.rtf) / n,
  };
}

export interface EvalReport {
  createdAt: string;
  config: Record<string, unknown>;
  conditions: Record<string, Aggregate>;
}

type Target = { metric: keyof Aggregate; op: '<=' | '>=' | '<'; value: number; label: string };

const FAR: Target[] = [
  { metric: 'falseAlertsPerRun', op: '<=', value: 1, label: 'False alerts per scene' },
  { metric: 'falseNotesPerRun', op: '<=', value: 2, label: 'False notes per scene' },
  { metric: 'coreRecall', op: '>=', value: 0.75, label: 'Recall (dropped/wrong word, dropped line)' },
];

export const TARGETS: Record<string, Target[]> = {
  'solo-close-mic': [
    { metric: 'falseAlertsPer10Min', op: '<=', value: 1, label: 'False alerts per 10 min' },
    { metric: 'falseNotesPer10Min', op: '<=', value: 1, label: 'False notes per 10 min' },
    { metric: 'coreRecall', op: '>=', value: 0.9, label: 'Recall (dropped/wrong word, dropped line)' },
    { metric: 'latencyP50', op: '<', value: 0.5, label: 'Alert latency p50, s (meaningful at --patience 0)' },
  ],
  'director-far-field': FAR,
  'director-far-field-hard': FAR,
};

export function checkTargets(condition: string, agg: Aggregate): Array<{ label: string; value: number | null; target: string; pass: boolean }> {
  return (TARGETS[condition] ?? []).map((t) => {
    const value = agg[t.metric] as number | null;
    const pass = value !== null && (t.op === '<=' ? value <= t.value : t.op === '>=' ? value >= t.value : value < t.value);
    return { label: t.label, value, target: `${t.op} ${t.value}`, pass };
  });
}

const fmt = (v: number | null) => (v === null ? 'n/a' : Number.isInteger(v) ? String(v) : v.toFixed(3));

export function formatReport(report: EvalReport): string {
  const out: string[] = [`# DASMA harness report`, '', `Created ${report.createdAt}`, '', '```json', JSON.stringify(report.config, null, 2), '```', ''];
  for (const [condition, agg] of Object.entries(report.conditions)) {
    out.push(`## ${condition}`, '', `${agg.runs} runs, ${agg.audioMinutes.toFixed(1)} min of audio, ${agg.errorLabels} planted errors, mean RTF ${agg.rtfMean.toFixed(3)}`, '');
    out.push('| Target | Value | Required | Result |', '|---|---|---|---|');
    for (const row of checkTargets(condition, agg)) out.push(`| ${row.label} | ${fmt(row.value)} | ${row.target} | ${row.pass ? 'PASS' : 'FAIL'} |`);
    out.push('', '| Metric | Value |', '|---|---|');
    for (const key of ['recall', 'recallInclChecks', 'sameCategoryRate', 'soundAlikeRecall', 'falseNotesPerRun', 'falseAlertsPerRun', 'falseChecksPerRun', 'benignViolationsPerRun', 'latencyP50', 'latencyP95'] as const) {
      out.push(`| ${key} | ${fmt(agg[key])} |`);
    }
    out.push('', '| Category | Planted | Detected | Rate |', '|---|---|---|---|');
    for (const [k, v] of Object.entries(agg.perCategory)) out.push(`| ${k} | ${v.labels} | ${v.detected} | ${fmt(v.labels ? v.detected / v.labels : null)} |`);
    out.push('');
  }
  return out.join('\n');
}

export function compareToBaseline(report: EvalReport, baseline: EvalReport): { pass: boolean; lines: string[] } {
  const lines: string[] = [];
  let pass = true;
  for (const room of Object.keys(baseline.conditions)) {
    if (!(room in report.conditions)) {
      lines.push(`${room}: FAIL condition is in the baseline but missing from the report`);
      pass = false;
    }
  }
  for (const [room, agg] of Object.entries(report.conditions)) {
    const base = baseline.conditions[room];
    if (!base) {
      lines.push(`${room}: no baseline — skipped`);
      continue;
    }
    // No recall evidence in the report is a failure whenever the baseline had some; with none in both there is nothing to compare.
    const recallOk = base.coreRecall === null || (agg.coreRecall !== null && agg.coreRecall >= base.coreRecall - 0.03);
    const checks: Array<[string, boolean]> = [
      [`coreRecall ${fmt(agg.coreRecall)} vs ${fmt(base.coreRecall)}`, recallOk],
      [`falseAlertsPerRun ${fmt(agg.falseAlertsPerRun)} vs ${fmt(base.falseAlertsPerRun)}`, agg.falseAlertsPerRun <= base.falseAlertsPerRun + 0.2],
      [`falseNotesPerRun ${fmt(agg.falseNotesPerRun)} vs ${fmt(base.falseNotesPerRun)}`, agg.falseNotesPerRun <= base.falseNotesPerRun + 0.3],
    ];
    for (const [text, ok] of checks) {
      lines.push(`${room}: ${ok ? 'ok  ' : 'FAIL'} ${text}`);
      if (!ok) pass = false;
    }
  }
  return { pass, lines };
}
