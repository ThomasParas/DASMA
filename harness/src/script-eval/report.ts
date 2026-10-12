import type { DocScore, FixKind } from './score';

/** Spec §1, per family on the held-out set. Never loosened. */
export const SCRIPT_GATE = {
  fixesPerPage: 1,
  worstPageFixes: 4,
  speakerAccuracy: 0.98,
  flaggedShare: 0.9,
  falseFlagsPerPage: 2,
  textAccuracy: 0.995,
} as const;

export interface FamilyMetrics {
  family: string;
  docs: number;
  pages: number;
  errors: number;
  fixesPerPage: number;
  worstPageFixes: number;
  speakerAccuracy: number;
  flaggedShare: number;
  falseFlagsPerPage: number;
  textAccuracy: number;
}

export function familyMetrics(scores: readonly DocScore[]): FamilyMetrics[] {
  return [...new Set(scores.map((s) => s.family))].map((family) => {
    const xs = scores.filter((s) => s.family === family);
    const sum = (f: (s: DocScore) => number) => xs.reduce((n, s) => n + f(s), 0);
    const pages = sum((s) => s.pages);
    const errors = sum((s) => s.fixes.length);
    const flagged = sum((s) => s.fixes.filter((f) => f.flagged).length);
    const spoken = sum((s) => s.spokenUnits);
    const spokenWords = sum((s) => s.spokenWords);
    return {
      family,
      docs: xs.length,
      pages,
      errors,
      fixesPerPage: pages ? errors / pages : 0,
      worstPageFixes: Math.max(0, ...xs.flatMap((s) => s.fixesByPage)),
      speakerAccuracy: spoken ? sum((s) => s.speakerRight) / spoken : 1,
      flaggedShare: errors ? flagged / errors : 1,
      falseFlagsPerPage: pages ? sum((s) => s.falseFlags) / pages : 0,
      textAccuracy: spokenWords ? 1 - sum((s) => s.textErrors) / spokenWords : 1,
    };
  });
}

export function gateFailures(m: FamilyMetrics): string[] {
  const g = SCRIPT_GATE;
  const out: string[] = [];
  if (m.fixesPerPage > g.fixesPerPage) out.push(`fixesPerPage ${m.fixesPerPage.toFixed(2)} > ${g.fixesPerPage}`);
  if (m.worstPageFixes > g.worstPageFixes) out.push(`worstPageFixes ${m.worstPageFixes} > ${g.worstPageFixes}`);
  if (m.speakerAccuracy < g.speakerAccuracy) out.push(`speakerAccuracy ${m.speakerAccuracy.toFixed(3)} < ${g.speakerAccuracy}`);
  if (m.flaggedShare < g.flaggedShare) out.push(`flaggedShare ${m.flaggedShare.toFixed(3)} < ${g.flaggedShare}`);
  if (m.falseFlagsPerPage > g.falseFlagsPerPage) out.push(`falseFlagsPerPage ${m.falseFlagsPerPage.toFixed(2)} > ${g.falseFlagsPerPage}`);
  if (m.textAccuracy < g.textAccuracy) out.push(`textAccuracy ${m.textAccuracy.toFixed(4)} < ${g.textAccuracy}`);
  return out;
}

const KINDS: FixKind[] = ['missedSpeech', 'inventedSpeech', 'wrongSpeaker', 'missedHeading', 'inventedHeading', 'split', 'merge'];
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function formatScriptReport(title: string, metrics: readonly FamilyMetrics[], scores: readonly DocScore[], verbose: boolean): string {
  const lines = [
    `# ${title}`,
    '',
    '| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const m of metrics) {
    const failures = gateFailures(m);
    lines.push(
      `| ${m.family} | ${m.docs} | ${m.pages} | ${m.fixesPerPage.toFixed(2)} | ${m.worstPageFixes} | ${pct(m.speakerAccuracy)} | ${pct(m.flaggedShare)} | ${m.falseFlagsPerPage.toFixed(2)} | ${pct(m.textAccuracy, 2)} | ${failures.length ? `FAIL: ${failures.join('; ')}` : 'PASS'} |`,
    );
  }
  lines.push('', '## Fixes by kind', '', `| Family | ${KINDS.join(' | ')} |`, `|---|${KINDS.map(() => '---').join('|')}|`);
  for (const m of metrics) {
    const fs = scores.filter((s) => s.family === m.family).flatMap((s) => s.fixes);
    lines.push(`| ${m.family} | ${KINDS.map((k) => fs.filter((f) => f.kind === k).length).join(' | ')} |`);
  }
  if (verbose) {
    lines.push('', '## Documents', '', '| Document | Pages | Fixes | Flagged | False flags | Speaker | Text errors |', '|---|---|---|---|---|---|---|');
    for (const s of scores) {
      lines.push(
        `| ${s.docId} | ${s.pages} | ${s.fixes.length} | ${s.fixes.filter((f) => f.flagged).length} | ${s.falseFlags} | ${s.speakerRight}/${s.spokenUnits} | ${s.textErrors}/${s.spokenWords} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
