/**
 * T-X043 soak proof — optimization breaks CTA journey regression.
 * Fixture only. ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED.
 */

import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofOptimizationBreaksCtaJourneyFails } from "./optimization-breaks-cta-proof.js";

describe("proofOptimizationBreaksCtaJourneyFails (T-X043)", () => {
  it("passes with journey regression and honesty markers", () => {
    const proof = proofOptimizationBreaksCtaJourneyFails(
      "2026-11-21T18:00:00.000Z",
    );

    expect(proof.kind).toBe(
      SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    );
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);

    const joined = proof.details.join(" | ");
    expect(joined).toMatch(/JOURNEY_REGRESSION_FAILED/);
    expect(joined).toMatch(/JOURNEY_STEPS_REQUIRED/);
    expect(joined).toMatch(/Href-only CTA break/);
    expect(joined).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(joined).toMatch(/externalEffects=NONE/);
    expect(joined).toMatch(/liveProviderSuccessClaimed=false/);
    expect(joined).not.toMatch(/\bVERIFIED\b/);
    expect(joined).not.toMatch(/validated_payload/i);
    expect(joined).not.toMatch(/crash_restart|job_continuity/i);
    expect(joined).not.toMatch(/UNKNOWN_REMOTE|overrun_visible/i);
    expect(joined).not.toMatch(/external_human_edit|EXTERNAL_HUMAN_EDIT/i);
    expect(joined).not.toMatch(/concurrent_final_budget|BUDGET_RESERVATION/i);
    expect(joined).not.toMatch(/T-F07|T-US-013|T-US-014/);
    expect(joined).not.toMatch(/unknown_usage_cancel|USAGE_CANCEL_HOLDS/i);
    expect(joined).not.toMatch(/ga4_debug_not_delivered/i);
    expect(joined).not.toMatch(/eval_only_operational/i);
    expect(joined).toMatch(/Decoy footer/);
    expect(proof.operationId).toMatch(/^op-tx043-/);
    expect(proof.proofId).toMatch(/^proof-opt-breaks-cta-/);
    expect(proof.createdAtIso).toBe("2026-11-21T18:00:00.000Z");
  });
});