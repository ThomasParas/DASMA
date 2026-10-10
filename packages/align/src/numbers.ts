const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};

function below100(n: number): string[] {
  if (n < 20) return [ONES[n]!];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? [TENS[t]!, ONES[o]!] : [TENS[t]!];
}

function below1000(n: number): string[] {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const out: string[] = [];
  if (h) out.push(ONES[h]!, 'hundred');
  if (r || !h) out.push(...below100(r));
  return out;
}

function cardinal(n: number): string[] {
  if (n === 0) return ['zero'];
  if (n >= 1e12) return String(n).split('').map((d) => ONES[Number(d)]!);
  const out: string[] = [];
  let rest = n;
  const scales: Array<[number, string]> = [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  for (const [value, name] of scales) {
    if (rest >= value) {
      out.push(...below1000(Math.floor(rest / value)), name);
      rest %= value;
    }
  }
  if (rest > 0) out.push(...below1000(rest));
  return out;
}

function year(n: number): string[] {
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return [...below100(hi), 'hundred'];
  if (lo < 10) return [...below100(hi), 'oh', ONES[lo]!];
  return [...below100(hi), ...below100(lo)];
}

function ordinalize(words: string[]): string[] {
  const last = words[words.length - 1]!;
  const rest = words.slice(0, -1);
  let ord: string;
  if (ORDINAL[last]) ord = ORDINAL[last]!;
  else if (last.endsWith('y')) ord = `${last.slice(0, -1)}ieth`;
  else ord = `${last}th`;
  return [...rest, ord];
}

export function numberToWords(n: number, mode: 'cardinal' | 'ordinal' = 'cardinal'): string[] {
  if (mode === 'ordinal') return ordinalize(cardinal(n));
  if ((n >= 1100 && n <= 1999) || (n >= 2010 && n <= 2099)) return year(n);
  return cardinal(n);
}
