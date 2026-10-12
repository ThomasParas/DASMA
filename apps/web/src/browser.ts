/** D20: Chrome and Edge are supported; anything else gets a best-effort notice (never blocked). */
export function isSupportedBrowser(userAgent: string): boolean {
  return /\b(Chrome|Chromium|Edg)\//.test(userAgent) && !/\bFirefox\//.test(userAgent);
}
