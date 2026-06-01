import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `@/…` mirrors the tsconfig path alias so test imports match app imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "evals/**/*.test.ts"],
    globals: false,
  },
});
