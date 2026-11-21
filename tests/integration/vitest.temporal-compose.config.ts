import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["temporal-compose.e2e.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    pool: "forks",
  },
});
