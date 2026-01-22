const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ZXing: 'readonly',
        google: 'readonly',
        BarcodeDetector: 'readonly'
      }
    }
  },
  {
    files: ['web/assets/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        ...globals.worker,
        importScripts: 'readonly',
        self: 'readonly'
      }
    }
  },
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    ignores: [
      'web/dist/**',
      'web/assets/vendor/**',
      'web/assets/wasm/**',
      'web/assets/scan-tests/**'
    ]
  }
];
