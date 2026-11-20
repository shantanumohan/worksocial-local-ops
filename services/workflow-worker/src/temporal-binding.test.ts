import { describe, expect, it } from "vitest";
import { probeTemporalBinding, runtimeTemporalLabel } from "./temporal-binding.js";

describe("temporal binding probe", () => {
  it("reports NOT_WIRED when TEMPORAL_ADDRESS is unset", () => {
    const report = probeTemporalBinding({});
    expect(report.status).toBe("NOT_WIRED");
    expect(report.sdkDependency).toBe("NOT_PRESENT");
    expect(report.productionActivated).toBe(false);
    expect(report.blockers.length).toBeGreaterThan(0);
    expect(runtimeTemporalLabel(report)).toBe("NOT_WIRED");
  });

  it("reports READY_TO_BIND but runtime label stays NOT_WIRED until SDK ships", () => {
    const report = probeTemporalBinding({
      TEMPORAL_ADDRESS: "127.0.0.1:7233",
      TEMPORAL_NAMESPACE: "worksocial",
    });
    expect(report.status).toBe("READY_TO_BIND");
    expect(report.address).toBe("127.0.0.1:7233");
    expect(runtimeTemporalLabel(report)).toBe("NOT_WIRED");
  });
});
