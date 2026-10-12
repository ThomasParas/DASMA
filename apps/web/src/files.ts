/** "hamlet.final.pdf" → "hamlet.final". */
export const stem = (name: string): string => name.replace(/\.[^./\\]+$/, '');

/** A title made safe to use as a download name. */
export const safeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'script';
