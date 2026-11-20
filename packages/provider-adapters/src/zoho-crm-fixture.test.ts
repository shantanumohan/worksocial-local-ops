import { describe, expect, it } from "vitest";
import {
  createZohoCrmFixtureAdapter,
  liveZohoCrmStub,
} from "./zoho-crm-fixture.js";

const now = "2026-11-20T15:10:00.000Z";
const corr = "corr-fixture-1";

describe("zoho-crm-fixture adapter", () => {
  it("writes, verifies fields, and cleans up synthetic leads", () => {
    const crm = createZohoCrmFixtureAdapter();
    const fields = {
      Email: `canary+${corr}@worksocial.test.local`,
      Last_Name: `Canary ${corr}`,
      ws_synthetic: "true",
      ws_correlation_id: corr,
    };
    const receipt = crm.writeSyntheticLead({
      correlationId: corr,
      fieldSnapshot: fields,
      nowIso: now,
    });
    expect(receipt?.synthetic).toBe(true);
    expect(receipt?.recordId).toBeTruthy();

    const verified = crm.verifyFields({
      correlationId: corr,
      expected: fields,
    });
    expect(verified.passed).toBe(true);

    const cleaned = crm.cleanup({ correlationId: corr, nowIso: now });
    expect(cleaned.ok).toBe(true);
    expect(cleaned.code).toBe("CLEANED");
    expect(crm.listActive()).toHaveLength(0);

    const again = crm.verifyFields({ correlationId: corr, expected: fields });
    expect(again.passed).toBe(false);
  });

  it("supports skipWrite delivery failure and refuses live stub", () => {
    const crm = createZohoCrmFixtureAdapter();
    const receipt = crm.writeSyntheticLead({
      correlationId: corr,
      fieldSnapshot: {
        Email: `canary+${corr}@worksocial.test.local`,
        Last_Name: "x",
        ws_synthetic: "true",
        ws_correlation_id: corr,
      },
      nowIso: now,
      skipWrite: true,
    });
    expect(receipt).toBeNull();

    const live = liveZohoCrmStub();
    expect(live.wiring).toBe("NOT_WIRED");
    expect(() => live.write()).toThrow(/NOT_WIRED/);
  });
});
