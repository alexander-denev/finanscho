import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import jsdoc from 'eslint-plugin-jsdoc';
import { importX, createNodeResolver } from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';
import prettier from 'eslint-config-prettier';

// ---------------------------------------------------------------------------
// Layer dependency rule (see docs/ARCHITECTURE.md). Relative imports are matched
// by folder name; packages are matched by name.
// ---------------------------------------------------------------------------

/**
 * Builds a regex that matches a relative import into one of the given src folders.
 * @param {string[]} folders e.g. ['infrastructure', 'core/services']
 * @returns {string}
 */
const relativeInto = (folders) => `^\\.{1,2}/(?:.*/)?(?:${folders.join('|')})(?:/|$)`;

/**
 * Packages banned everywhere. Finanscho is a PWA only (docs/DECISIONS.md, D35), so native-shell
 * packages must not creep back in.
 */
const GLOBALLY_BANNED = [
  {
    regex: '^@capacitor/',
    message:
      'Finanscho is a PWA only; Capacitor packages are not allowed (docs/DECISIONS.md, D35).',
  },
];

/**
 * @param {string} layer human-readable layer name for the message
 * @param {string[]} folders forbidden src folders
 * @param {string[]} packages forbidden package regexes
 * @returns {import('eslint').Linter.RuleEntry}
 */
function layerRule(layer, folders, packages) {
  return [
    'error',
    {
      patterns: [
        {
          regex: relativeInto(folders),
          message: `${layer} may not import from: ${folders.join(', ')} (see docs/ARCHITECTURE.md).`,
        },
        ...packages.map((pkg) => ({
          regex: pkg,
          message: `${layer} may not depend on this package (see docs/ARCHITECTURE.md).`,
        })),
        // A later config's rule entry replaces an earlier one, so every layer repeats the ban.
        ...GLOBALLY_BANNED,
      ],
    },
  ];
}

const PREACT = '^preact(?:/|$)';
const SIGNALS_PREACT = '^@preact/signals$';
const SIGNALS_CORE = '^@preact/signals-core$';
const IDB = '^idb$';

export default [
  {
    ignores: ['dist/**', 'dev-dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createNodeResolver({ extensions: ['.js', '.jsx', '.json'] })],
      'import-x/extensions': ['.js', '.jsx'],
    },
    rules: {
      'import-x/no-unresolved': ['error', { caseSensitiveStrict: true, ignore: ['^virtual:'] }],
      'import-x/no-cycle': 'error',
      'import-x/named': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/extensions': ['error', 'ignorePackages'],
      'no-console': 'error',
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-restricted-imports': ['error', { patterns: GLOBALLY_BANNED }],
    },
  },
  // Config files and scripts run in Node.
  {
    files: ['*.config.js', 'scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  // Application source and tests.
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { unicorn, jsdoc, react, 'react-hooks': reactHooks },
    settings: {
      react: { version: '18.3' },
      jsdoc: { mode: 'typescript' },
    },
    rules: {
      ...jsdoc.configs['flat/recommended-typescript-flavor-error'].rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'unicorn/filename-case': ['error', { cases: { camelCase: true, pascalCase: true } }],
      'import-x/no-default-export': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            MethodDefinition: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          checkConstructors: false,
        },
      ],
      'jsdoc/require-param': ['error', { checkDestructured: false }],
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-property-description': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },
  {
    files: ['src/**/*.jsx', 'tests/**/*.jsx'],
    ...jsxA11y.flatConfigs.recommended,
    plugins: { 'jsx-a11y': jsxA11y },
  },
  // Tests need less ceremony: no JSDoc requirement on every helper, and `any` casts are allowed
  // so tests can feed deliberately malformed data to validators.
  {
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/reject-any-type': 'off',
    },
  },
  // --- Layer boundaries -----------------------------------------------------
  {
    files: ['src/core/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': layerRule(
        'core',
        ['infrastructure', 'state', 'ui', 'app'],
        [PREACT, SIGNALS_PREACT, SIGNALS_CORE, IDB],
      ),
    },
  },
  {
    files: ['src/infrastructure/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': layerRule(
        'infrastructure',
        ['state', 'ui', 'app'],
        [PREACT, SIGNALS_PREACT],
      ),
    },
  },
  {
    files: ['src/state/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': layerRule(
        'state',
        ['infrastructure', 'ui', 'app'],
        [PREACT, SIGNALS_PREACT, IDB],
      ),
    },
  },
  {
    files: ['src/ui/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': layerRule(
        'ui',
        ['infrastructure', 'core/services', 'app'],
        [IDB, SIGNALS_CORE],
      ),
    },
  },
  {
    files: ['src/shared/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': layerRule(
        'shared',
        ['core', 'infrastructure', 'state', 'ui', 'app'],
        [PREACT, SIGNALS_PREACT, SIGNALS_CORE, IDB],
      ),
    },
  },
  prettier,
];
