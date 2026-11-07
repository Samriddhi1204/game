import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// Names that only exist in a browser. Core must be pure TypeScript.
const domGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'HTMLElement',
  'Element',
  'Event',
  'matchMedia',
  'location',
  'performance',
  'screen',
  'alert',
  'Audio',
  'AudioContext',
  'Image',
  'fetch',
  'XMLHttpRequest',
].map((name) => ({ name, message: 'src/core must not touch the DOM.' }));

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['*.js', '*.mjs', '*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['scripts/**/*.mjs', '*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'src/core must not import Phaser.' },
            {
              group: ['**/game/**', '**/game'],
              message: 'src/core must not import from src/game.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...domGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in core/rng.ts.' },
      ],
    },
  },
  prettier,
);
