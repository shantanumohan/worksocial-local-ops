import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofStopBeforeDispatchClaim } from "./stop-before-dispatch-proof.js";

describe("proofStopBeforeDispatchClaim (T-X016)", () => {
  it("passes R24–R38 compound OUTBOUND_STOPPED fences", async () => {
    const proof = await proofStopBeforeDispatchClaim(
      "2026-11-21T18:00:00.000Z",
    );
    expect(proof.kind).toBe(SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(0);
    expect(
      proof.details.some((d) =>
        d.includes(
          "triple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH (applyAttemptCount=0)",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("SOURCE_STALE+REVISION_MISMATCH (applyAttemptCount=0)"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "quadruple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH+GRANT_EXPIRED",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "quintuple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH+GRANT_EXPIRED+PREREQUISITE_MISSING",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "sextuple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH+GRANT_EXPIRED+PREREQUISITE_MISSING+PREREQUISITE_CONFLICT",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "septuple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH+GRANT_EXPIRED+PREREQUISITE_MISSING+PREREQUISITE_CONFLICT+READ_EVIDENCE_MISSING",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "octuple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH+GRANT_EXPIRED+PREREQUISITE_MISSING+PREREQUISITE_CONFLICT+READ_EVIDENCE_MISSING+OWNERSHIP_UNPROVEN",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "nonuple RATE_LIMIT+SOURCE_STALE+REVISION_MISMATCH+GRANT_EXPIRED+PREREQUISITE_MISSING+PREREQUISITE_CONFLICT+READ_EVIDENCE_MISSING+OWNERSHIP_UNPROVEN+GRANT_MISSING",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("nonuple repeat gate idempotent (nine passes"),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("liveProviderWiring=NOT_WIRED"))).toBe(
      true,
    );
  });
});