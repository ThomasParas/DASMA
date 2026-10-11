import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'harness/models/**', 'harness/out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/align/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@dasma/*', 'node:*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'process'],
    },
  },
  {
    files: ['packages/script/src/**/*.ts'],
    ignores: ['packages/script/src/extract/pdf.ts', 'packages/script/src/extract/docx.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'packages/script stays free of Node APIs.' },
            { group: ['pdfjs-dist', 'pdfjs-dist/*', 'fflate'], message: 'Only extract/pdf.ts and extract/docx.ts read files.' },
            { group: ['@dasma/*', '!@dasma/align'], message: '@dasma/align is the only workspace import.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'process', 'Buffer'],
    },
  },
  {
    files: ['packages/script/src/extract/pdf.ts', 'packages/script/src/extract/docx.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['node:*', '@dasma/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'process', 'Buffer'],
    },
  },
);
