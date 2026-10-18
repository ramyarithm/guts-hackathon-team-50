import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-case-declarations': 'off',
    },
  },
  {
    files: ['**/*.test.mjs', '**/*-loader.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
