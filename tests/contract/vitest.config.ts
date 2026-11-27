import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.contract.test.ts"],
    // Soak contracts spawn child processes; threads pool races leak state (T-X063/T-X061 flakes on CI).
    pool: "forks",
    // Several contracts run the full soak harness with OS spawn/kill; avoid
    // parallel harness contention on shared CI runners (T-X012/T-X061 flakes).
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
