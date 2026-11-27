import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.contract.test.ts"],
    // Several contracts run the full soak harness with OS spawn/kill; avoid
    // parallel harness contention on shared CI runners (T-X012/T-X061 flakes).
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
