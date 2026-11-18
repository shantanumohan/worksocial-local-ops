import { describe, expect, it } from "vitest";
import { verifyProcessOwnership } from "./process-ownership.js";

describe("process-ownership", () => {
  it("accepts a pid whose cmdline/environ advertise service + generation", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {
        readCommandLine: () =>
          "tsx heartbeat-slot.ts --service api --generation gen-abc",
        readEnviron: () => "WORKSOCIAL_SERVICE_ID=api\0WORKSOCIAL_GENERATION=gen-abc\0",
      },
    );
    expect(ok).toBe(true);
  });

  it("rejects PID reuse when generation is missing", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {
        readCommandLine: () => "nginx: worker process",
        readEnviron: () => "USER=www\0",
      },
    );
    expect(ok).toBe(false);
  });

  it("denies kill when no ownership probe data is available", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {},
    );
    expect(ok).toBe(false);
  });
});
