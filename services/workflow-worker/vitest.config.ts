import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Temporal local test server suite is run via pnpm test:workflow only.
    exclude: ["src/temporal-mission.test.ts"],
    testTimeout: 30_000,
  },
});
