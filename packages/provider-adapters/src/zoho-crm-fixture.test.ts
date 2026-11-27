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
    expect(crm.writeAttemptCount()).toBe(1);

    const live = liveZohoCrmStub();
    expect(live.wiring).toBe("NOT_WIRED");
    expect(() => live.write()).toThrow(/NOT_WIRED/);
  });

  it("lags getByCorrelation reads while keeping the write on the ledger (T-X023)", () => {
    const crm = createZohoCrmFixtureAdapter();
    const receipt = crm.writeSyntheticLead({
      correlationId: corr,
      fieldSnapshot: {
        Email: `canary+${corr}@worksocial.test.local`,
        Last_Name: `Canary ${corr}`,
        ws_synthetic: "true",
        ws_correlation_id: corr,
      },
      nowIso: now,
      visibilityLagReads: 2,
    });
    expect(receipt?.recordId).toBeTruthy();
    expect(crm.listAll()).toHaveLength(1);
    expect(crm.visibilityLagRemaining(corr)).toBe(2);
    expect(crm.getByCorrelation(corr)).toBeNull();
    expect(crm.visibilityLagRemaining(corr)).toBe(1);
    expect(crm.getByCorrelation(corr)).toBeNull();
    expect(crm.visibilityLagRemaining(corr)).toBe(0);
    const visible = crm.getByCorrelation(corr);
    expect(visible?.receipt.recordId).toBe(receipt?.recordId);
    expect(crm.visibilityLagRemaining(corr)).toBe(0);
    expect(crm.writeAttemptCount()).toBe(1);
  });
});
