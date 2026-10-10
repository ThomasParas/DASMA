import type { Op } from './window-align';

/**
 * Index of the last op that is safe to commit, or -1.
 * Leading matches always commit. Beyond that, the ops up to p commit when p ends a run of at least
 * `confirmWords` matches and every deviation block before p is followed (within ..p) by enough
 * matches: `confirmWords` normally, max(confirmWords, 2) if the block skips expected words.
 */
export function commitPoint(ops: Op[], confirmWords: number): number {
  let lead = 0;
  while (lead < ops.length && ops[lead]!.kind === 'match') lead++;
  for (let p = ops.length - 1; p >= lead; p--) {
    if (ops[p]!.kind !== 'match') continue;
    let run = 0;
    for (let q = p; q >= 0 && ops[q]!.kind === 'match'; q--) run++;
    if (run < confirmWords) continue;
    if (blocksConfirmed(ops, lead, p, confirmWords)) return p;
  }
  return lead - 1;
}

function blocksConfirmed(ops: Op[], from: number, p: number, confirmWords: number): boolean {
  let i = from;
  while (i <= p) {
    if (ops[i]!.kind === 'match') {
      i++;
      continue;
    }
    let j = i;
    let hasDel = false;
    while (j <= p && ops[j]!.kind !== 'match') {
      if (ops[j]!.kind === 'del') hasDel = true;
      j++;
    }
    let matchesAfter = 0;
    for (let q = j; q <= p; q++) if (ops[q]!.kind === 'match') matchesAfter++;
    if (matchesAfter < (hasDel ? Math.max(confirmWords, 2) : confirmWords)) return false;
    i = j;
  }
  return true;
}

/**
 * After the grace timeout: commit everything except skips that are not followed by two matches.
 * Never less than `commitPoint(ops, 1)`: a timeout must not commit less than instant confirmation would.
 */
export function commitPointOnTimeout(ops: Op[]): number {
  return Math.max(commitPoint(ops, 1), timeoutTail(ops));
}

/** Timeout-only tail rule: commit trailing deviations, stopping at a skip not followed by two matches. */
function timeoutTail(ops: Op[]): number {
  let end = -1;
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === 'match') {
      end = i;
      i++;
      continue;
    }
    let j = i;
    let hasDel = false;
    while (j < ops.length && ops[j]!.kind !== 'match') {
      if (ops[j]!.kind === 'del') hasDel = true;
      j++;
    }
    let k = j;
    while (k < ops.length && ops[k]!.kind === 'match') k++;
    if (hasDel && k - j < 2) break;
    end = k - 1;
    i = k;
  }
  return end;
}
