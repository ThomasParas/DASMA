/** A heard token once resolved: committed (matched or not) or discarded while lost / re-anchoring. */
export interface HeardMark {
  start: number;
  end: number;
  matched: boolean;
}

export const OFF_SCRIPT_MIN_RUN = 4;
export const OFF_SCRIPT_MAX_MATCHES = 1;
export const OFF_SCRIPT_MAX_GAP_SEC = 1.0;

/**
 * Pass spec §6.2: time spans of off-script talk — at least OFF_SCRIPT_MIN_RUN consecutive heard words with at most
 * OFF_SCRIPT_MAX_MATCHES script matches among them, no gap between words longer than OFF_SCRIPT_MAX_GAP_SEC.
 */
export function offScriptSpans(marks: HeardMark[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i + OFF_SCRIPT_MIN_RUN <= marks.length; i++) {
    let matches = 0;
    let ok = true;
    for (let k = i; k < i + OFF_SCRIPT_MIN_RUN; k++) {
      if (k > i && marks[k]!.start - marks[k - 1]!.end > OFF_SCRIPT_MAX_GAP_SEC) {
        ok = false;
        break;
      }
      if (marks[k]!.matched) matches++;
    }
    if (!ok || matches > OFF_SCRIPT_MAX_MATCHES) continue;
    const start = marks[i]!.start;
    const end = marks[i + OFF_SCRIPT_MIN_RUN - 1]!.end;
    const last = spans.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  return spans;
}

export function insideAny(spans: Array<[number, number]>, start: number, end: number): boolean {
  return spans.some(([s, e]) => start >= s && end <= e);
}
