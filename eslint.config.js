// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // docs/ is the GitHub Pages landing page, authored and maintained
    // separately from this package (see .prettierignore), so it is not
    // linted as shipped code.
    ignores: [
      'dist/**',
      'dist-firefox/**',
      'web-ext-artifacts/**',
      'node_modules/**',
      'coverage/**',
      'SDD/**',
      'agent/**',
      '.openclaw/**',
      'docs/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
);
