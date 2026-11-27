import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Full soak harness runs 140+ proofs including real OS spawn/kill (T-X012);
    // keep headroom above the default 5s so CI hosts do not flake on wall time.
    testTimeout: 20_000,
  },
});
