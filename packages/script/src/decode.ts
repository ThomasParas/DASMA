const NEG = Number.NEGATIVE_INFINITY;

function logSumExp(xs: readonly number[]): number {
  let m = NEG;
  for (const x of xs) if (x > m) m = x;
  if (m === NEG) return NEG;
  let sum = 0;
  for (const x of xs) sum += Math.exp(x - m);
  return m + Math.log(sum);
}

/**
 * Viterbi path and forward-backward posteriors for a first-order chain.
 * All inputs are log-scores; -Infinity forbids a start or a transition.
 */
export function decode(start: number[], transitions: number[][], emissions: number[][]): { path: number[]; posterior: number[][] } {
  const T = emissions.length;
  const S = start.length;
  if (T === 0) return { path: [], posterior: [] };

  const score: number[][] = [start.map((v, s) => v + emissions[0][s])];
  const back: number[][] = [start.map(() => -1)];
  for (let t = 1; t < T; t++) {
    const row: number[] = [];
    const from: number[] = [];
    for (let s = 0; s < S; s++) {
      let best = NEG;
      let arg = 0;
      for (let p = 0; p < S; p++) {
        const v = score[t - 1][p] + transitions[p][s];
        if (v > best) [best, arg] = [v, p];
      }
      row.push(best + emissions[t][s]);
      from.push(arg);
    }
    score.push(row);
    back.push(from);
  }
  const path = new Array<number>(T);
  let last = 0;
  for (let s = 1; s < S; s++) if (score[T - 1][s] > score[T - 1][last]) last = s;
  path[T - 1] = last;
  for (let t = T - 1; t > 0; t--) path[t - 1] = back[t][path[t]];

  const alpha: number[][] = [start.map((v, s) => v + emissions[0][s])];
  for (let t = 1; t < T; t++) {
    alpha.push(Array.from({ length: S }, (_, s) => logSumExp(alpha[t - 1].map((a, p) => a + transitions[p][s])) + emissions[t][s]));
  }
  const beta: number[][] = new Array(T);
  beta[T - 1] = new Array<number>(S).fill(0);
  for (let t = T - 2; t >= 0; t--) {
    beta[t] = Array.from({ length: S }, (_, s) => logSumExp(beta[t + 1].map((b, n) => transitions[s][n] + emissions[t + 1][n] + b)));
  }
  const posterior = alpha.map((a, t) => {
    const joint = a.map((v, s) => v + beta[t][s]);
    const z = logSumExp(joint);
    return joint.map((v) => (z === NEG ? 0 : Math.exp(v - z)));
  });
  return { path, posterior };
}
