import { describe, expect, it } from "vitest";
import {
  CONCURRENT_RELEASE_LIVE_WIRING,
  SoakProofKind,
} from "@worksocial/domain";
import { proofConcurrentIdempotentRelease } from "./concurrent-idempotent-release-proof.js";

describe("proofConcurrentIdempotentRelease (T-X021)", () => {
  it("passes with R9 controls including PG-race claim refuse and effect-id stable", async () => {
    const proof = await proofConcurrentIdempotentRelease(
      "2026-11-21T18:00:00.000Z",
    );
    expect(proof.kind).toBe(SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(proof.details.some((d) => d.includes("SYNC_STORE_NO_OVERLAP"))).toBe(
      true,
    );
    expect(proof.details.some((d) => d.includes("overlap proven"))).toBe(true);
    expect(proof.details.some((d) => d.includes("one dispatch"))).toBe(true);
    expect(
      proof.details.some((d) => d.includes("Shared winner operationId")),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("REPLAY_NO_CREATE"))).toBe(
      true,
    );
    expect(
      proof.details.some((d) => d.includes("DIGEST_MISMATCH_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("PER_KEY_OVERLAP_WHILE_HELD")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("DISTINCT_OP_SAME_KEY_ONE_DISPATCH"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("MIXED_DIGEST_CONCURRENT_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("GLOBAL_MUTEX_BLOCKS_CROSS_KEY")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("MUTEX_SURVIVES_THROW")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("WINNER_OPERATION_LOOKUP")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("REMOTE_REF_STABLE_AFTER_MISMATCH")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("LIVE_WIRING_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("BLANK_KEY_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("LIVE_TRANSPORT_NOT_WIRED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("LOSER_OPERATION_LOOKUP_ABSENT")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("BLANK_DIGEST_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("APPLIED_AT_STABLE_AFTER_MISMATCH")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("GATE_BEFORE_APPLY")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("KEY_WHITESPACE_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("DIGEST_WHITESPACE_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("BUSINESS_KEY_LOOKUP")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("LAST_SEEN_STABLE_AFTER_MISMATCH")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("BLANK_OPERATION_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("OPERATION_WHITESPACE_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("PG_RACE_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("CONCURRENT_RETRY_ONLY_CLAIM_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("EXTERNAL_EFFECTS_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("ADS_LIVE_CONNECT_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("SANDBOX_VERIFIED_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("PRODUCTION_VERIFIED_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("CANARY_VERIFIED_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("INTEGRATION_VERIFIED_CLAIM_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("OVERLAP_AS_VERIFIED_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("FALSE_ONE_DISPATCH_PASS_REFUSED")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("FALSE_PER_KEY_OVERLAP_PASS_REFUSED"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("pgRaceNotClaimed=true")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("adsSoftSkip=[T-F07,T-US-013,T-US-014]")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(`concurrentReleaseLiveWiring=${CONCURRENT_RELEASE_LIVE_WIRING}`),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("chatgptAdsAccess=ACCESS_BLOCKED")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("refuseLiveVerified=true")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("externalEffects=NONE")),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("NO_DUPLICATE_EFFECTS")),
    ).toBe(true);
  });
});
