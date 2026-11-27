import { describe, expect, it } from "vitest";
import {
  CONCURRENT_IDEMPOTENT_RELEASE_RELATED_CASE_IDS,
  CONCURRENT_RELEASE_ADS_SOFT_SKIP_CASE_IDS,
  CONCURRENT_RELEASE_CALLER_COUNT,
  CONCURRENT_RELEASE_LIVE_WIRING,
  ConcurrentReleaseOutcome,
  classifyConcurrentCreateCount,
  classifyDigestMismatchRefused,
  classifyDistinctOpSameKeyOneDispatch,
  classifyGlobalMutexBlocksCrossKey,
  classifyMixedDigestConcurrentRefused,
  classifyMutexSurvivesThrow,
  classifyPerKeyIsolation,
  classifyPerKeyOverlapWhileHeld,
  classifyAppliedAtStableAfterMismatch,
  classifyBusinessKeyLookup,
  classifyGateBeforeApply,
  classifyLastSeenStableAfterMismatch,
  classifyLoserOperationLookupAbsent,
  classifyProviderEffectIdStableAfterMismatch,
  classifyRemoteRefStableAfterMismatch,
  classifyReplayNoCreate,
  classifySyncStoreNoOverlap,
  classifyWinnerOperationLookup,
  concurrentReleaseHonesty,
  evaluateConcurrentReleaseLiveClaim,
  proofDetailsHonest,
} from "./concurrent-idempotent-release.js";
import {
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  SoakProofKind,
} from "./soak-acceptance.js";

describe("concurrent idempotent release honesty (T-X021)", () => {
  it("pins related case, NOT_WIRED, Ads blocked, refuse live VERIFIED", () => {
    const honesty = concurrentReleaseHonesty();
    expect(honesty.relatedCaseIds).toEqual(["T-X021"]);
    expect(honesty.relatedCaseIds).toBe(
      CONCURRENT_IDEMPOTENT_RELEASE_RELATED_CASE_IDS,
    );
    expect(honesty.liveWiring).toBe(CONCURRENT_RELEASE_LIVE_WIRING);
    expect(honesty.liveWiring).toBe("NOT_WIRED");
    expect(honesty.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(honesty.adsSoftSkipCaseIds).toEqual(
      CONCURRENT_RELEASE_ADS_SOFT_SKIP_CASE_IDS,
    );
    expect(honesty.adsSoftSkipCaseIds).toEqual([
      "T-F07",
      "T-US-013",
      "T-US-014",
    ]);
    expect(honesty.externalEffects).toBe("NONE");
    expect(honesty.fixtureAcceptedNotVerified).toBe(true);
    expect(honesty.refuseLiveVerified).toBe(true);
    expect(honesty.distinctFromRetryOnlyNoDup).toBe(true);
    expect(honesty.pgRaceNotClaimed).toBe(true);
    expect(CONCURRENT_RELEASE_CALLER_COUNT).toBe(12);
  });

  it("does not map NO_DUPLICATE_EFFECTS to T-X021", () => {
    expect(mapProofToFixtureCases(SoakProofKind.NO_DUPLICATE_EFFECTS)).toEqual(
      [],
    );
    expect(expectedProofsForFixtureCase("T-X021")).toEqual([
      SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE,
    ]);
    expect(
      expectedProofsForFixtureCase("T-X021"),
    ).not.toContain(SoakProofKind.NO_DUPLICATE_EFFECTS);
  });

  it("classifies unsafe overlap and serialized one-dispatch", () => {
    expect(classifyConcurrentCreateCount(12, "unsafe")).toBe(
      ConcurrentReleaseOutcome.OVERLAP_EXPOSED,
    );
    expect(classifyConcurrentCreateCount(1, "unsafe")).toBeNull();
    expect(classifyConcurrentCreateCount(1, "serialized")).toBe(
      ConcurrentReleaseOutcome.ONE_DISPATCH,
    );
    expect(classifyConcurrentCreateCount(2, "serialized")).toBeNull();
  });

  it("classifies per-key isolation and true overlap-while-held", () => {
    expect(classifyPerKeyIsolation([1, 1])).toBe(
      ConcurrentReleaseOutcome.PER_KEY_ISOLATION,
    );
    expect(classifyPerKeyIsolation([1])).toBeNull();
    expect(
      classifyPerKeyOverlapWhileHeld({
        keyAEntered: true,
        keyBCompletedWhileAHeld: true,
        keyACreated: true,
        keyBCreated: true,
      }),
    ).toBe(ConcurrentReleaseOutcome.PER_KEY_OVERLAP_WHILE_HELD);
    expect(
      classifyPerKeyOverlapWhileHeld({
        keyAEntered: true,
        keyBCompletedWhileAHeld: false,
        keyACreated: true,
        keyBCreated: true,
      }),
    ).toBeNull();
  });

  it("classifies replay, sync-store, distinct-op, digest, mixed-digest", () => {
    expect(classifyReplayNoCreate(false, 1)).toBe(
      ConcurrentReleaseOutcome.REPLAY_NO_CREATE,
    );
    expect(classifySyncStoreNoOverlap(1)).toBe(
      ConcurrentReleaseOutcome.SYNC_STORE_NO_OVERLAP,
    );
    expect(
      classifyDistinctOpSameKeyOneDispatch({
        createdCount: 1,
        distinctOperationIdsSubmitted: 12,
        sharedProviderEffectIdCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.DISTINCT_OP_SAME_KEY_ONE_DISPATCH);
    expect(
      classifyDigestMismatchRefused({
        refused: true,
        applyCount: 1,
        digestUnchanged: true,
      }),
    ).toBe(ConcurrentReleaseOutcome.DIGEST_MISMATCH_REFUSED);
    expect(
      classifyMixedDigestConcurrentRefused({
        createdCount: 1,
        mismatchRefusals: 5,
        ledgerRowsForKey: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.MIXED_DIGEST_CONCURRENT_REFUSED);
    expect(
      classifyMixedDigestConcurrentRefused({
        createdCount: 2,
        mismatchRefusals: 5,
        ledgerRowsForKey: 1,
      }),
    ).toBeNull();
  });

  it("classifies global-mutex negative control and mutex-survives-throw", () => {
    expect(
      classifyGlobalMutexBlocksCrossKey({
        keyAEntered: true,
        keyBBlockedWhileAHeld: true,
        bothEventuallyCreated: true,
      }),
    ).toBe(ConcurrentReleaseOutcome.GLOBAL_MUTEX_BLOCKS_CROSS_KEY);
    expect(
      classifyGlobalMutexBlocksCrossKey({
        keyAEntered: true,
        keyBBlockedWhileAHeld: false,
        bothEventuallyCreated: true,
      }),
    ).toBeNull();
    expect(
      classifyMutexSurvivesThrow({
        mismatchRefusals: 3,
        postThrowReplayCreated: false,
        postThrowApplyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.MUTEX_SURVIVES_THROW);
    expect(
      proofDetailsHonest([
        "refuseLiveVerified=true",
        "liveProviderSuccessClaimed=false",
        "not sandbox/prod VERIFIED",
      ]),
    ).toBe(true);
    expect(
      proofDetailsHonest(["liveProviderSuccessClaimed=true"]),
    ).toBe(false);
  });

  it("refuses live VERIFIED / live-wire / blank / WIRED / non-fixture (R5+R6)", () => {
    const verified = evaluateConcurrentReleaseLiveClaim({
      claimLiveVerified: true,
    });
    expect(verified).not.toBeNull();
    expect(verified?.allowed).toBe(false);
    expect(verified?.code).toBe(
      ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED,
    );
    expect(verified?.liveWiring).toBe("NOT_WIRED");
    expect(verified?.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(verified?.externalEffects).toBe("NONE");
    expect(verified?.liveProviderSuccessClaimed).toBe(false);
    expect(verified?.fixtureAcceptedNotVerified).toBe(true);
    expect(verified?.pgRaceNotClaimed).toBe(true);

    const wire = evaluateConcurrentReleaseLiveClaim({ requestLiveWire: true });
    expect(wire?.code).toBe(
      ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED,
    );
    expect(
      evaluateConcurrentReleaseLiveClaim({ businessIdempotencyKey: "  " })
        ?.code,
    ).toBe(ConcurrentReleaseOutcome.BLANK_KEY_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({ payloadDigest: "\t" })?.code,
    ).toBe(ConcurrentReleaseOutcome.BLANK_DIGEST_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        businessIdempotencyKey: "  padded-key  ",
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.KEY_WHITESPACE_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        payloadDigest: "  padded-digest  ",
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.DIGEST_WHITESPACE_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({ preferLiveDispatch: true })?.code,
    ).toBe(ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED);
    expect(
      evaluateConcurrentReleaseLiveClaim({ operationId: "  " })?.code,
    ).toBe(ConcurrentReleaseOutcome.BLANK_OPERATION_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        operationId: "  padded-op  ",
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.OPERATION_WHITESPACE_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({ claimPgRaceCovered: true })?.code,
    ).toBe(ConcurrentReleaseOutcome.PG_RACE_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        treatOverlapAsLiveVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.OVERLAP_AS_VERIFIED_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimedOneDispatchPass: true,
        createCount: 12,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimedOneDispatchPass: true,
        createCount: 1,
      }),
    ).toBeNull();
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimedOneDispatchPass: true,
        createCount: 0,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimedOneDispatchPass: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimedPerKeyOverlapPass: true,
        keyBCompletedWhileAHeld: false,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.FALSE_PER_KEY_OVERLAP_PASS_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimedPerKeyOverlapPass: true,
        keyBCompletedWhileAHeld: true,
      }),
    ).toBeNull();
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimRetryOnlyCoversConcurrent: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.CONCURRENT_RETRY_ONLY_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimExternalEffectsOccurred: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.EXTERNAL_EFFECTS_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimChatgptAdsLiveConnect: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.ADS_LIVE_CONNECT_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimFixtureAcceptedIsVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimLiveProviderSuccess: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimSandboxVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.SANDBOX_VERIFIED_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimProductionVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.PRODUCTION_VERIFIED_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimCanaryVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.CANARY_VERIFIED_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimIntegrationVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.INTEGRATION_VERIFIED_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimAuthorizedProductionVerified: true,
      })?.code,
    ).toBe(
      ConcurrentReleaseOutcome.AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED,
    );
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimProductionCanaryVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimSandboxProductionVerified: true,
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({ liveWiring: "WIRED" })?.code,
    ).toBe(ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED);
    expect(
      evaluateConcurrentReleaseLiveClaim({ fixtureOnly: false })?.code,
    ).toBe(ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED);
    // Live claim refuses before blank-key inspect (tip #211 ordering).
    expect(
      evaluateConcurrentReleaseLiveClaim({
        claimLiveVerified: true,
        businessIdempotencyKey: "  ",
      })?.code,
    ).toBe(ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED);
    expect(
      evaluateConcurrentReleaseLiveClaim({
        fixtureOnly: true,
        liveWiring: "NOT_WIRED",
      }),
    ).toBeNull();
    expect(evaluateConcurrentReleaseLiveClaim({})).toBeNull();
  });

  it("classifies winner/loser lookup and remoteRef stable after mismatch", () => {
    expect(
      classifyWinnerOperationLookup({
        lookedUp: true,
        matchesSharedProviderEffectId: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.WINNER_OPERATION_LOOKUP);
    expect(
      classifyWinnerOperationLookup({
        lookedUp: true,
        matchesSharedProviderEffectId: false,
        applyCount: 1,
      }),
    ).toBeNull();
    expect(
      classifyRemoteRefStableAfterMismatch({
        refused: true,
        remoteRefUnchanged: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.REMOTE_REF_STABLE_AFTER_MISMATCH);
    expect(
      classifyRemoteRefStableAfterMismatch({
        refused: true,
        remoteRefUnchanged: false,
        applyCount: 1,
      }),
    ).toBeNull();
    expect(
      classifyLoserOperationLookupAbsent({
        winnerLookedUp: true,
        loserAbsent: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.LOSER_OPERATION_LOOKUP_ABSENT);
    expect(
      classifyLoserOperationLookupAbsent({
        winnerLookedUp: true,
        loserAbsent: false,
        applyCount: 1,
      }),
    ).toBeNull();
    expect(
      classifyAppliedAtStableAfterMismatch({
        refused: true,
        appliedAtUnchanged: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.APPLIED_AT_STABLE_AFTER_MISMATCH);
    expect(
      classifyGateBeforeApply({
        refused: true,
        storeMutations: 0,
        ledgerRowsUnchanged: true,
      }),
    ).toBe(ConcurrentReleaseOutcome.GATE_BEFORE_APPLY);
    expect(
      classifyGateBeforeApply({
        refused: true,
        storeMutations: 1,
        ledgerRowsUnchanged: true,
      }),
    ).toBeNull();
    expect(
      classifyBusinessKeyLookup({
        lookedUp: true,
        matchesSharedProviderEffectId: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.BUSINESS_KEY_LOOKUP);
    expect(
      classifyLastSeenStableAfterMismatch({
        refused: true,
        lastSeenUnchanged: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.LAST_SEEN_STABLE_AFTER_MISMATCH);
    expect(
      classifyProviderEffectIdStableAfterMismatch({
        refused: true,
        providerEffectIdUnchanged: true,
        applyCount: 1,
      }),
    ).toBe(ConcurrentReleaseOutcome.PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH);
  });
});
