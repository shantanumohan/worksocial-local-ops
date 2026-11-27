import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Harness proofs spawn child processes; threads pool races leak state on CI.
    pool: "forks",
    // Full harness (140+ proofs incl. OS spawn/kill) must not contend with sibling files.
    fileParallelism: false,
    // Keep headroom above the default 5s so CI hosts do not flake on wall time.
    testTimeout: 20_000,
  },
});
