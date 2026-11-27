import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.e2e-lite.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        // One child process for the whole e2e-lite suite (shared harness timing races).
        singleFork: true,
      },
    },
    maxWorkers: 1,
    // Each file runs a full fixture soak harness; parallel runs flake on CI (T-X045/T-X061).
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
