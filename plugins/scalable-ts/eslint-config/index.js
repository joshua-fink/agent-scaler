// @ts-check
/**
 * Shareable ESLint flat-config for scalable TypeScript projects.
 *
 * The DETERMINISTIC half of "best practices for scale" — the rules a machine can
 * decide without judgement:
 *  - module boundaries & dependency hygiene
 *  - type hygiene
 *  - build / compile-time perf at scale
 *  - async & error handling
 *
 * The judgement-call half lives in the `scalable-ts` Claude Code plugin's skills
 * (`module-boundaries`, `type-hygiene`, `build-perf`, `async-errors`,
 * `coverage-100`, `commit-modularity`). The review harness runs *this* config
 * first (cheap, free signal) and only then spends reasoning on what's left.
 *
 * Usage in a consuming project's eslint.config.js:
 *
 *   import scale from "@scalable-ts/eslint-config";
 *   export default [
 *     ...scale.recommended({
 *       project: ["./tsconfig.json"],
 *       layers: [
 *         { from: ["src/app/**"],    allow: ["src/domain/**", "src/shared/**"] },
 *         { from: ["src/domain/**"], allow: ["src/shared/**"] },
 *         { from: ["src/shared/**"], allow: [] },
 *       ],
 *     }),
 *     // ...project overrides
 *   ];
 *
 * Peer deps: eslint>=9, typescript>=5, typescript-eslint>=8,
 * eslint-plugin-import>=2.31, eslint-import-resolver-typescript>=3.6.
 */

import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

/**
 * @typedef {object} ScaleOptions
 * @property {string[]} [project] tsconfig path(s) for type-aware linting. Default: ["./tsconfig.json"].
 * @property {Array<{ from: string[], allow: string[] }>} [layers]
 *   Layering rules: each entry's `from` globs may import only its own
 *   subtree plus the `allow` globs; anything else is an error.
 * @property {string[]} [files] Globs to apply to. Default: TS/TSX/MTS/CTS.
 */

const DEFAULT_FILES = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];

/** @returns {import("eslint").Linter.RulesRecord} */
function typeHygieneRules() {
  return {
    // `any` silently disables the checker for everything downstream — the single
    // biggest scalability hazard. Force `unknown` + narrowing.
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-unsafe-argument": "error",

    // Public surface must be explicitly typed: an "internal" refactor can't
    // silently change an exported signature.
    "@typescript-eslint/explicit-module-boundary-types": "error",

    // Casts hide real mismatches; `as const` / `satisfies` are fine.
    "@typescript-eslint/consistent-type-assertions": [
      "error",
      { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
    ],
    "@typescript-eslint/no-non-null-assertion": "error",

    // Adding a union member must break every switch over it.
    "@typescript-eslint/switch-exhaustiveness-check": [
      "error",
      { considerDefaultExhaustiveForUnions: true },
    ],

    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-unnecessary-condition": "warn",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-redundant-type-constituents": "error",
    "@typescript-eslint/no-duplicate-type-constituents": "error",
  };
}

/** @returns {import("eslint").Linter.RulesRecord} */
function asyncRules() {
  return {
    // The classic production incident: a promise nobody awaits.
    "@typescript-eslint/no-floating-promises": [
      "error",
      { ignoreVoid: true, ignoreIIFE: true },
    ],
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/return-await": ["error", "in-try-catch"],
    "@typescript-eslint/promise-function-async": "error",
    "no-async-promise-executor": "error",
    "no-return-await": "off", // superseded by the TS-aware rule above

    // Swallowed errors.
    "no-empty": ["error", { allowEmptyCatch: false }],
    "@typescript-eslint/only-throw-error": "error",
    "@typescript-eslint/prefer-promise-reject-errors": "error",

    // await-in-loop is sometimes correct; the `async-errors` skill judges it.
    "@typescript-eslint/no-await-in-loop": "off",
  };
}

/** @returns {import("eslint").Linter.RulesRecord} */
function buildPerfRules() {
  return {
    // Type-only imports must be marked so they're erased — keeps the module
    // graph small and acyclic. Pair with `verbatimModuleSyntax` in tsconfig.
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "separate-type-imports" },
    ],
    "@typescript-eslint/consistent-type-exports": [
      "error",
      { fixMixedExportsWithInlineTypeSpecifier: true },
    ],
    "@typescript-eslint/no-import-type-side-effects": "error",

    // Cycles wreck incremental compilation and create init-order bugs.
    "import/no-cycle": ["error", { maxDepth: Infinity, ignoreExternal: true }],
    "import/no-self-import": "error",
    "import/no-useless-path-segments": ["error", { noUselessIndex: true }],

    "import/no-unresolved": "error",
    "import/no-extraneous-dependencies": [
      "error",
      {
        devDependencies: [
          "**/*.test.ts",
          "**/*.spec.ts",
          "**/*.test.tsx",
          "**/*.spec.tsx",
          "**/vitest.config.*",
          "**/jest.config.*",
          "**/eslint.config.*",
        ],
      },
    ],
  };
}

/**
 * @param {NonNullable<ScaleOptions["layers"]>} layers
 * @returns {import("eslint").Linter.RulesRecord}
 */
function moduleBoundaryRules(layers) {
  const zones = layers.flatMap((l) =>
    l.from.map((target) => ({ target, from: ".", except: l.allow })),
  );
  return {
    // No cross-package relative climbing in a monorepo.
    "import/no-relative-packages": "error",
    ...(zones.length > 0
      ? { "import/no-restricted-paths": ["error", { zones }] }
      : {}),
    // Deep-into-internals and ../../-chains are real but context-dependent;
    // the `module-boundaries` skill flags egregious cases. Left off here to
    // avoid false positives in legitimate monorepo layouts.
    "import/no-internal-modules": "off",
    "import/no-relative-parent-imports": "off",
  };
}

/**
 * The recommended config: an array of flat-config blocks.
 * @param {ScaleOptions} [opts]
 * @returns {import("eslint").Linter.Config[]}
 */
export function recommended(opts = {}) {
  const project = opts.project ?? ["./tsconfig.json"];
  const files = opts.files ?? DEFAULT_FILES;
  const layers = opts.layers ?? [];

  return [
    ...tseslint.configs.recommended.map((c) => ({ ...c, files })),
    {
      files,
      plugins: { import: importPlugin },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project, projectService: true },
      },
      settings: {
        "import/resolver": { typescript: { project } },
      },
      rules: {
        ...typeHygieneRules(),
        ...asyncRules(),
        ...buildPerfRules(),
        ...moduleBoundaryRules(layers),
      },
    },
    {
      files: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx", "**/*.spec.tsx"],
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "import/no-extraneous-dependencies": "off",
      },
    },
  ];
}

export default { recommended };
