import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  // Flag eslint-disable directives that are no longer suppressing anything —
  // the TS analog of mypy's warn_unused_ignores, so stale disables can't linger.
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  ...nextVitals,
  ...nextTs,
  // Disable ESLint rules that conflict with Prettier; must come last among rule sets.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
