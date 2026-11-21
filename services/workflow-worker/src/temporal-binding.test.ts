import { describe, expect, it } from "vitest";
import {
  probeTemporalBinding,
  runtimeTemporalLabel,
  temporalSdkPresent,
} from "./temporal-binding.js";

describe("temporal binding probe", () => {
  it("reports NOT_WIRED when TEMPORAL_ADDRESS is unset", () => {
    const report = probeTemporalBinding({});
    expect(report.status).toBe("NOT_WIRED");
    expect(report.sdkDependency).toBe("PRESENT");
    expect(temporalSdkPresent()).toBe(true);
    expect(report.productionActivated).toBe(false);
    expect(report.blockers.length).toBeGreaterThan(0);
    expect(runtimeTemporalLabel(report)).toBe("NOT_WIRED");
  });

  it("reports READY_TO_BIND when address set; runtime label stays NOT_WIRED until connection", () => {
    const report = probeTemporalBinding({
      TEMPORAL_ADDRESS: "127.0.0.1:7233",
      TEMPORAL_NAMESPACE: "worksocial",
    });
    expect(report.status).toBe("READY_TO_BIND");
    expect(report.address).toBe("127.0.0.1:7233");
    expect(report.sdkDependency).toBe("PRESENT");
    expect(runtimeTemporalLabel(report)).toBe("NOT_WIRED");
  });

  it("maps TEMPORAL status to TEMPORAL runtime label", () => {
    expect(
      runtimeTemporalLabel({
        status: "TEMPORAL",
        address: "127.0.0.1:7233",
        namespace: "default",
        detail: "ok",
        blockers: [],
        sdkDependency: "PRESENT",
        productionActivated: false,
      }),
    ).toBe("TEMPORAL");
  });
});
