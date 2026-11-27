import { describe, expect, it } from "vitest";
import { evaluatePolicy, type PolicyInput } from "./policy-evaluation.js";

const base: PolicyInput = {
  outboundStopped: false,
  sourceStale: false,
  grantPresent: true,
  grantExpired: false,
  ownershipProven: true,
  readEvidencePresent: true,
  prerequisiteMissing: false,
  prerequisiteConflict: false,
  revisionMatches: true,
  rateLimitExceeded: false,
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
    // T-X016 F15: outbound stop preferred even when rate-limit also tripped.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        rateLimitExceeded: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F16: outbound stop preferred even when source is stale.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        sourceStale: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F17: outbound stop preferred even when grant is expired.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        grantExpired: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F18: outbound stop preferred even when revision mismatches.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        revisionMatches: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F18: outbound stop preferred even when a prerequisite is missing.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        prerequisiteMissing: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F19: outbound stop preferred even when prerequisites conflict.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        prerequisiteConflict: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F20: outbound stop preferred over read-evidence and ownership gaps.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        readEvidencePresent: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        ownershipProven: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F21: outbound stop preferred over missing grant.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        grantPresent: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F22: compound rate-limit + source-stale still OUTBOUND_STOPPED first.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        sourceStale: true,
        rateLimitExceeded: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F23: outbound stop preferred over revision mismatch.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        revisionMatches: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F24: outbound stop preferred over expired grant.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        grantExpired: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F25: compound grant-expired + source-stale still OUTBOUND_STOPPED.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        grantExpired: true,
        sourceStale: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F26: compound grant-expired + revision mismatch still OUTBOUND_STOPPED.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        grantExpired: true,
        revisionMatches: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
    // T-X016 F27: compound source-stale + revision mismatch still OUTBOUND_STOPPED.
    expect(
      evaluatePolicy({
        ...base,
        outboundStopped: true,
        sourceStale: true,
        revisionMatches: false,
      }),
    ).toMatchObject({ allowed: false, code: "OUTBOUND_STOPPED" });
  });

  it("denies missing grant", () => {
    expect(evaluatePolicy({ ...base, grantPresent: false })).toMatchObject({
      allowed: false,
      code: "GRANT_MISSING",
    });
  });

  it("denies when rate limit is exceeded", () => {
    expect(evaluatePolicy({ ...base, rateLimitExceeded: true })).toMatchObject({
      allowed: false,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("denies missing read evidence before grant check", () => {
    expect(
      evaluatePolicy({ ...base, readEvidencePresent: false, grantPresent: false }),
    ).toMatchObject({
      allowed: false,
      code: "READ_EVIDENCE_MISSING",
    });
  });

  it("denies unproven ownership before read-evidence check", () => {
    expect(
      evaluatePolicy({
        ...base,
        ownershipProven: false,
        readEvidencePresent: false,
      }),
    ).toMatchObject({
      allowed: false,
      code: "OWNERSHIP_UNPROVEN",
    });
  });
});
