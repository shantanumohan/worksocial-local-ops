/**
 * T-X070 validated payload — soak proof assertions.
 * Fixture only. ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED.
 */

import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofValidatedPayloadNotCollectedSeparateStates } from "./validated-payload-not-collected-proof.js";

describe("proofValidatedPayloadNotCollectedSeparateStates (T-X070)", () => {
  it("passes with separate failure states and honesty markers", () => {
    const proof = proofValidatedPayloadNotCollectedSeparateStates(
      "2026-11-21T18:00:00.000Z",
    );

    expect(proof.kind).toBe(
      SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    );
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);

    const joined = proof.details.join(" | ");
    expect(joined).toMatch(/COLLECTED/);
    expect(joined).toMatch(/VALIDATION_FAILED/);
    expect(joined).toMatch(/COLLECTION_FAILED/);
    expect(joined).toMatch(/Separate failure states/);
    expect(joined).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(joined).toMatch(/externalEffects=NONE/);
    expect(joined).toMatch(/liveProviderSuccessClaimed=false/);
    expect(joined).not.toMatch(/\bVERIFIED\b/);
    expect(joined).not.toMatch(/HOST_OFFLINE/i);
    expect(joined).not.toMatch(/OUTPUT_BOMB|output_bomb|quarantined/i);
    expect(joined).not.toMatch(/EVAL_ONLY|eval_no_grounding/i);
    expect(joined).not.toMatch(/incomparable_trend|schema_differs|cta_journey/i);
    expect(joined).not.toMatch(/STOP_BEFORE_DISPATCH|OUTBOUND_STOPPED/i);
    expect(joined).not.toMatch(/REPLY_SENT_CRM|no_resend|DELIVERED/i);
    expect(joined).not.toMatch(/GSC_OMITTED|gsc_omitted/i);
    expect(joined).not.toMatch(/low_sample_trend|insufficient_evidence/i);
    expect(joined).not.toMatch(/ORPHAN_WORKER|orphan_worker/i);
    expect(proof.operationId).toMatch(/^op-tx070-/);
    expect(proof.proofId).toMatch(/^proof-validated-payload-/);
    expect(proof.createdAtIso).toBe("2026-11-21T18:00:00.000Z");
  });
});