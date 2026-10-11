/** Page lines per estimated page. */
export const PAGE_LINES = 50;
/** Characters per estimated page line. */
export const CHARS_PER_PAGE_LINE = 80;

/**
 * Pages for documents without real page breaks (spec §4.1): each line fills
 * max(1, ceil(characters / 80)) page lines and a page holds 50. Returns the
 * 1-based page each line starts on. The corpus renderers use this too.
 */
export function estimatedPages(texts: readonly string[]): number[] {
  const pages: number[] = [];
  let used = 0;
  for (const text of texts) {
    pages.push(Math.floor(used / PAGE_LINES) + 1);
    used += Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE_LINE));
  }
  return pages;
}

/** Sets each line's page from `estimatedPages`; returns the page count (0 for no lines). */
export function assignEstimatedPages(lines: Array<{ page: number; text: string }>): number {
  const pages = estimatedPages(lines.map((l) => l.text));
  lines.forEach((l, i) => {
    l.page = pages[i];
  });
  return pages.length ? pages[pages.length - 1] : 0;
}
