import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'node_modules/',
      '.build/',
      'test/browser/fixtures/*.js',
      'server/vendor/',
    ],
  },
  {
    rules: {
      // Underscore-prefixed params are intentionally unused (abstract methods, interface conformance)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Triple-slash needed for navigation-api.d.ts (global type augmentation)
      '@typescript-eslint/triple-slash-reference': 'off',
      'prefer-const': 'error',
      'no-useless-assignment': 'error',
      'eqeqeq': 'error',
      'no-shadow-restricted-names': 'error',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-var': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_|^describe$',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Tests use explicit any for mock data
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
