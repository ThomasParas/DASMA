import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pdfjsStub = fileURLToPath(new URL('./apps/web/test/pdfjs-stub.ts', import.meta.url));

export default defineConfig({
  test: {
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'harness/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        // jsdom tests never read PDFs; the stub lets @dasma/script load without pdf.js's browser canvas APIs.
        resolve: { alias: { 'pdfjs-dist/legacy/build/pdf.mjs': pdfjsStub } },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/test/**/*.test.tsx'],
          setupFiles: ['apps/web/test/setup.ts'],
        },
      },
    ],
  },
});
