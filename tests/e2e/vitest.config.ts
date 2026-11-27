import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.e2e-lite.test.ts"],
    pool: "forks",
    // Each file runs a full fixture soak harness; parallel runs flake on CI (T-X045).
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
