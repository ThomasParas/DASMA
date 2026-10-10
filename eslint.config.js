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
);
