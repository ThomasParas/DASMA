// Stands in for pdfjs-dist in jsdom tests (see vitest.config.ts); PDF import is covered by Node tests and the browser spike.
export const GlobalWorkerOptions: { workerSrc?: string } = {};
export function getDocument(): never {
  throw new Error('pdf.js is stubbed in jsdom tests');
}
