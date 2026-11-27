import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofApprovedPayloadEditInvalidated } from "./approved-payload-edit-proof.js";

describe("proofApprovedPayloadEditInvalidated (T-X019)", () => {
  it("passes R25 triple-field mismatch repeat gate", () => {
    const proof = proofApprovedPayloadEditInvalidated(
      "2026-11-21T19:14:00.000Z",
    );
    expect(proof.kind).toBe(SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(
      proof.details.some((d) =>
        d.includes(
          "T-X019 R25: triple revision+checksum+evidence mismatch repeat gate idempotent",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("T-X019: payload checksum edit invalidated binding"),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("liveProviderWiring=NOT_WIRED"))).toBe(
      true,
    );
  });
});