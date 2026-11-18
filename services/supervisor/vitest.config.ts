import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Tests run TypeScript sources; package exports point at dist for Node runtime.
      "@worksocial/persistence": join(root, "../../packages/persistence/src/index.ts"),
    },
  },
});
