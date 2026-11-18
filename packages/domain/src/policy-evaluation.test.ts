import { describe, expect, it } from "vitest";
import { evaluatePolicy, type PolicyInput } from "./policy-evaluation.js";

const base: PolicyInput = {
  outboundStopped: false,
  sourceStale: false,
  grantPresent: true,
  grantExpired: false,
  ownershipProven: true,
  prerequisiteMissing: false,
  prerequisiteConflict: false,
  revisionMatches: true,
};

describe("evaluatePolicy", () => {
  it("allows when all prerequisites pass", () => {
    expect(evaluatePolicy(base)).toEqual({ allowed: true });
  });

  it("denies SOURCE_STALE before other soft failures when ownership and grant ok", () => {
    expect(evaluatePolicy({ ...base, sourceStale: true })).toEqual({
      allowed: false,
      code: "SOURCE_STALE",
      reason: "Bound source revision is stale",
    });
  });

  it("denies OUTBOUND_STOPPED first", () => {
    expect(
      evaluatePolicy({ ...base, outboundStopped: true, sourceStale: true }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
  });

  it("denies missing grant", () => {
    expect(evaluatePolicy({ ...base, grantPresent: false })).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
    });
  });
});
