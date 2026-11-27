/**
 * T-X021 — Concurrent idempotent releases → one dispatch.
 *
 * Distinct from sequential retry-only NO_DUPLICATE_EFFECTS. Concurrent
 * callers sharing one business idempotency key + digest must coalesce to
 * exactly one remote effect. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * Live durable / provider race wiring stays NOT_WIRED. External effects: NONE.
 * ChatGPT Ads stays ACCESS_BLOCKED (soft-skip connect trio). Catalog bound:
 * do not invent past T-X073.
 *
 * Hillclimb R3: refuseLiveVerified honesty; digest-mismatch classifier;
 * true per-key overlap (one key progresses while another is held — not just
 * final create counts, which a global mutex would also satisfy).
 * Hillclimb R4: global-mutex negative control (discriminating); mutex survives
 * throw; Ads soft-skip case IDs; pgRaceNotClaimed honesty stamp.
 * Hillclimb R5: LIVE_WIRING_CLAIM_REFUSED for claimLiveVerified /
 * requestLiveWire (tip #204 pattern); getByOperation / remoteRef edges.
 * Hillclimb R6: blank-key refuse; fixture+WIRED / non-fixture →
 * LIVE_TRANSPORT_NOT_WIRED (tip #208); loser getByOperation absent.
 * Hillclimb R7: blank digest; preferLiveDispatch refuse; appliedAtIso
 * stable; gate-before-apply (tip #211 ordering).
 * Hillclimb R8: padded key/digest whitespace refuse (tip #216 trim
 * mismatch); getByBusinessKey lookup; lastSeenAtIso stable after mismatch.
 * Hillclimb R9: blank operationId; PG-race claim refuse; overlap≠live
 * VERIFIED refuse (tip #219 companion); providerEffectId stable after mismatch.
 * Hillclimb R10: padded operationId whitespace refuse (tip #216 trilogy);
 * FALSE_ONE_DISPATCH_PASS_REFUSED (tip #221 companion — claimed PASS unmet).
 * Hillclimb R11: FALSE_PER_KEY_OVERLAP_PASS_REFUSED (claimed overlap-while-held
 * PASS without keyBCompletedWhileAHeld).
 * Hillclimb R12: CONCURRENT_RETRY_ONLY_CLAIM_REFUSED — retry-only
 * NO_DUPLICATE_EFFECTS does not cover concurrent coalescing (T-X021).
 * Hillclimb R13: EXTERNAL_EFFECTS_CLAIM_REFUSED — fixture path externalEffects
 * remains NONE; refuse provider-dispatch success claims.
 * Hillclimb R14: ADS_LIVE_CONNECT_CLAIM_REFUSED — ChatGPT Ads connect trio soft-skip.
 * Hillclimb R15: FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED — conflating ACCEPTED with VERIFIED.
 * Hillclimb R16: LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED — live provider SUCCESS on fixture path.
 * Hillclimb R17: SANDBOX_VERIFIED_CLAIM_REFUSED — sandbox VERIFIED on fixture-only path.
 * Hillclimb R18: PRODUCTION_VERIFIED_CLAIM_REFUSED — production/canary VERIFIED on fixture path.
 * Hillclimb R19: CANARY_VERIFIED_CLAIM_REFUSED — authorized canary VERIFIED on fixture path.
 * Hillclimb R20: INTEGRATION_VERIFIED_CLAIM_REFUSED — integration-tier VERIFIED on fixture soak.
 * Hillclimb R21: AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED — authorized prod path VERIFIED.
 * Hillclimb R22: PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED — combined prod/canary VERIFIED.
 * Hillclimb R23: SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED — sandbox+production VERIFIED bundle.
 */

export const CONCURRENT_IDEMPOTENT_RELEASE_RELATED_CASE_IDS = [
  "T-X021",
] as const;

/** Soft-skip ChatGPT Ads connect trio — do not build / claim LIVE. */
export const CONCURRENT_RELEASE_ADS_SOFT_SKIP_CASE_IDS = [
  "T-F07",
  "T-US-013",
  "T-US-014",
] as const;

/** Live concurrent durable/provider race wiring — always NOT_WIRED offline. */
export const CONCURRENT_RELEASE_LIVE_WIRING = "NOT_WIRED" as const;

/** Concurrent callers used by the soak barrier proof. */
export const CONCURRENT_RELEASE_CALLER_COUNT = 12 as const;

export const ConcurrentReleaseOutcome = {
  /** Negative control: overlap exposed without serializer. */
  OVERLAP_EXPOSED: "OVERLAP_EXPOSED",
  /** Positive: per-key mutex → exactly one create. */
  ONE_DISPATCH: "ONE_DISPATCH",
  /** Two distinct keys under same barrier each get one create. */
  PER_KEY_ISOLATION: "PER_KEY_ISOLATION",
  /**
   * True per-key: key B completed create while key A was still held in
   * its critical section (a global mutex would block B until A released).
   */
  PER_KEY_OVERLAP_WHILE_HELD: "PER_KEY_OVERLAP_WHILE_HELD",
  /** Post-concurrent replay does not create again. */
  REPLAY_NO_CREATE: "REPLAY_NO_CREATE",
  /** Digest mismatch after bind refused (no second effect). */
  DIGEST_MISMATCH_REFUSED: "DIGEST_MISMATCH_REFUSED",
  /**
   * Sync memory applyOnce behind the same barrier cannot expose overlap
   * (created=1) — proves the async race-window store is required.
   */
  SYNC_STORE_NO_OVERLAP: "SYNC_STORE_NO_OVERLAP",
  /** Distinct operationIds / same biz key still coalesce to one dispatch. */
  DISTINCT_OP_SAME_KEY_ONE_DISPATCH: "DISTINCT_OP_SAME_KEY_ONE_DISPATCH",
  /** Mixed-digest concurrent race: one create + mismatches refuse; ledger=1. */
  MIXED_DIGEST_CONCURRENT_REFUSED: "MIXED_DIGEST_CONCURRENT_REFUSED",
  /**
   * Negative control: under a global mutex, key B stays blocked while A is held
   * (proves PER_KEY_OVERLAP_WHILE_HELD is discriminating).
   */
  GLOBAL_MUTEX_BLOCKS_CROSS_KEY: "GLOBAL_MUTEX_BLOCKS_CROSS_KEY",
  /** After mismatch throws, mutex unlocks; same-digest replay still works. */
  MUTEX_SURVIVES_THROW: "MUTEX_SURVIVES_THROW",
  /** Live VERIFIED / live-wire claims refused — fixture ACCEPTED only. */
  LIVE_WIRING_CLAIM_REFUSED: "LIVE_WIRING_CLAIM_REFUSED",
  /** Post-coalesce getByOperation(winner) returns the shared effect. */
  WINNER_OPERATION_LOOKUP: "WINNER_OPERATION_LOOKUP",
  /** remoteRef unchanged after digest-mismatch refuse. */
  REMOTE_REF_STABLE_AFTER_MISMATCH: "REMOTE_REF_STABLE_AFTER_MISMATCH",
  /** Blank / whitespace business key refused. */
  BLANK_KEY_REFUSED: "BLANK_KEY_REFUSED",
  /**
   * Non-fixture path or claimed liveWiring=WIRED — refuse (tip #208 pattern).
   * Live transport stays NOT_WIRED; no invented live success.
   */
  LIVE_TRANSPORT_NOT_WIRED: "LIVE_TRANSPORT_NOT_WIRED",
  /** Distinct-op loser operationId is absent from getByOperation. */
  LOSER_OPERATION_LOOKUP_ABSENT: "LOSER_OPERATION_LOOKUP_ABSENT",
  /** Blank / whitespace payload digest refused. */
  BLANK_DIGEST_REFUSED: "BLANK_DIGEST_REFUSED",
  /** appliedAtIso unchanged after digest-mismatch refuse. */
  APPLIED_AT_STABLE_AFTER_MISMATCH: "APPLIED_AT_STABLE_AFTER_MISMATCH",
  /**
   * Live-claim gate fires with zero store mutations (tip #211 gate-before-apply).
   */
  GATE_BEFORE_APPLY: "GATE_BEFORE_APPLY",
  /** Leading/trailing whitespace on biz key refused (tip #216 trim mismatch). */
  KEY_WHITESPACE_REFUSED: "KEY_WHITESPACE_REFUSED",
  /** Leading/trailing whitespace on digest refused (tip #216 trim mismatch). */
  DIGEST_WHITESPACE_REFUSED: "DIGEST_WHITESPACE_REFUSED",
  /** Post-coalesce getByBusinessKey returns the shared effect. */
  BUSINESS_KEY_LOOKUP: "BUSINESS_KEY_LOOKUP",
  /** lastSeenAtIso unchanged after digest-mismatch refuse. */
  LAST_SEEN_STABLE_AFTER_MISMATCH: "LAST_SEEN_STABLE_AFTER_MISMATCH",
  /** Blank / whitespace operationId refused. */
  BLANK_OPERATION_REFUSED: "BLANK_OPERATION_REFUSED",
  /** Leading/trailing whitespace on operationId refused (tip #216 trilogy). */
  OPERATION_WHITESPACE_REFUSED: "OPERATION_WHITESPACE_REFUSED",
  /** Claiming this proof covers PG ON CONFLICT race — refused. */
  PG_RACE_CLAIM_REFUSED: "PG_RACE_CLAIM_REFUSED",
  /**
   * Treating fixture overlap exposure as live VERIFIED — refused
   * (tip #219 companion: unavailable/false must not become measured success).
   */
  OVERLAP_AS_VERIFIED_REFUSED: "OVERLAP_AS_VERIFIED_REFUSED",
  /** providerEffectId unchanged after digest-mismatch refuse. */
  PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH:
    "PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH",
  /**
   * Claimed ONE_DISPATCH PASS while measured createCount ≠ 1 — refused
   * (tip #221 companion: false grounded/PASS while unmet).
   */
  FALSE_ONE_DISPATCH_PASS_REFUSED: "FALSE_ONE_DISPATCH_PASS_REFUSED",
  /**
   * Claimed PER_KEY_OVERLAP_WHILE_HELD PASS without measured overlap — refused
   * (companion to OVERLAP_AS_VERIFIED_REFUSED / FALSE_ONE_DISPATCH).
   */
  FALSE_PER_KEY_OVERLAP_PASS_REFUSED: "FALSE_PER_KEY_OVERLAP_PASS_REFUSED",
  /** Claiming retry-only NO_DUPLICATE_EFFECTS covers concurrent release — refused. */
  CONCURRENT_RETRY_ONLY_CLAIM_REFUSED: "CONCURRENT_RETRY_ONLY_CLAIM_REFUSED",
  /** Claiming live/provider external effects on fixture soak — refused. */
  EXTERNAL_EFFECTS_CLAIM_REFUSED: "EXTERNAL_EFFECTS_CLAIM_REFUSED",
  /** Claiming live ChatGPT Ads connect covers concurrent release — refused. */
  ADS_LIVE_CONNECT_CLAIM_REFUSED: "ADS_LIVE_CONNECT_CLAIM_REFUSED",
  /** Claiming fixture ACCEPTED equals sandbox/prod VERIFIED — refused. */
  FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED: "FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED",
  /** Claiming live provider SUCCESS on fixture concurrent-release soak — refused. */
  LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED: "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED",
  /** Claiming sandbox VERIFIED for concurrent-release fixture soak — refused. */
  SANDBOX_VERIFIED_CLAIM_REFUSED: "SANDBOX_VERIFIED_CLAIM_REFUSED",
  /** Claiming production/canary VERIFIED for concurrent-release fixture soak — refused. */
  PRODUCTION_VERIFIED_CLAIM_REFUSED: "PRODUCTION_VERIFIED_CLAIM_REFUSED",
  /** Claiming authorized production-canary VERIFIED on fixture soak — refused. */
  CANARY_VERIFIED_CLAIM_REFUSED: "CANARY_VERIFIED_CLAIM_REFUSED",
  /** Claiming integration-environment VERIFIED on fixture soak — refused. */
  INTEGRATION_VERIFIED_CLAIM_REFUSED: "INTEGRATION_VERIFIED_CLAIM_REFUSED",
  /** Claiming authorized-production VERIFIED on fixture soak — refused. */
  AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED:
    "AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED",
  /** Claiming production-canary VERIFIED combined on fixture soak — refused. */
  PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED:
    "PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED",
  /** Claiming sandbox+production VERIFIED bundle on fixture soak — refused. */
  SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED:
    "SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED",
} as const;

export type ConcurrentReleaseOutcomeValue =
  (typeof ConcurrentReleaseOutcome)[keyof typeof ConcurrentReleaseOutcome];

export type ConcurrentReleaseHonesty = {
  relatedCaseIds: typeof CONCURRENT_IDEMPOTENT_RELEASE_RELATED_CASE_IDS;
  liveWiring: typeof CONCURRENT_RELEASE_LIVE_WIRING;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  adsSoftSkipCaseIds: typeof CONCURRENT_RELEASE_ADS_SOFT_SKIP_CASE_IDS;
  externalEffects: "NONE";
  fixtureAcceptedNotVerified: true;
  refuseLiveVerified: true;
  distinctFromRetryOnlyNoDup: true;
  /** PG ON CONFLICT race is covered separately — not claimed by this proof. */
  pgRaceNotClaimed: true;
};

/** Static honesty envelope for T-X021 fixture soak. */
export function concurrentReleaseHonesty(): ConcurrentReleaseHonesty {
  return {
    relatedCaseIds: CONCURRENT_IDEMPOTENT_RELEASE_RELATED_CASE_IDS,
    liveWiring: CONCURRENT_RELEASE_LIVE_WIRING,
    chatgptAdsAccess: "ACCESS_BLOCKED",
    adsSoftSkipCaseIds: CONCURRENT_RELEASE_ADS_SOFT_SKIP_CASE_IDS,
    externalEffects: "NONE",
    fixtureAcceptedNotVerified: true,
    refuseLiveVerified: true,
    distinctFromRetryOnlyNoDup: true,
    pgRaceNotClaimed: true,
  };
}

export type ConcurrentReleaseLiveClaimDecision = {
  allowed: false;
  code:
    | typeof ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED
    | typeof ConcurrentReleaseOutcome.BLANK_KEY_REFUSED
    | typeof ConcurrentReleaseOutcome.BLANK_DIGEST_REFUSED
    | typeof ConcurrentReleaseOutcome.KEY_WHITESPACE_REFUSED
    | typeof ConcurrentReleaseOutcome.DIGEST_WHITESPACE_REFUSED
    | typeof ConcurrentReleaseOutcome.BLANK_OPERATION_REFUSED
    | typeof ConcurrentReleaseOutcome.OPERATION_WHITESPACE_REFUSED
    | typeof ConcurrentReleaseOutcome.PG_RACE_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.OVERLAP_AS_VERIFIED_REFUSED
    | typeof ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED
    | typeof ConcurrentReleaseOutcome.FALSE_PER_KEY_OVERLAP_PASS_REFUSED
    | typeof ConcurrentReleaseOutcome.CONCURRENT_RETRY_ONLY_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.EXTERNAL_EFFECTS_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.ADS_LIVE_CONNECT_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED
    | typeof ConcurrentReleaseOutcome.LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.SANDBOX_VERIFIED_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.PRODUCTION_VERIFIED_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.CANARY_VERIFIED_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.INTEGRATION_VERIFIED_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED
    | typeof ConcurrentReleaseOutcome.SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED;
  reasons: string[];
  liveWiring: typeof CONCURRENT_RELEASE_LIVE_WIRING;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
  liveProviderSuccessClaimed: false;
  fixtureAcceptedNotVerified: true;
  pgRaceNotClaimed: true;
};

function liveClaimRefuse(
  code: ConcurrentReleaseLiveClaimDecision["code"],
  reasons: string[],
): ConcurrentReleaseLiveClaimDecision {
  const honesty = concurrentReleaseHonesty();
  return {
    allowed: false,
    code,
    reasons,
    liveWiring: honesty.liveWiring,
    chatgptAdsAccess: honesty.chatgptAdsAccess,
    externalEffects: honesty.externalEffects,
    liveProviderSuccessClaimed: false,
    fixtureAcceptedNotVerified: true,
    pgRaceNotClaimed: true,
  };
}

/**
 * Refuse live-VERIFIED / live-wire / non-fixture / claimed-WIRED / blank key
 * for T-X021 fixture path. Tip #204 + #208 honesty patterns; stamp honesty
 * on every refuse.
 */
export function evaluateConcurrentReleaseLiveClaim(input: {
  claimLiveVerified?: boolean;
  requestLiveWire?: boolean;
  /** When false, path is outside fixture — refuse. */
  fixtureOnly?: boolean;
  /** Claimed wiring; only NOT_WIRED is allowed on fixture path. */
  liveWiring?: "NOT_WIRED" | "WIRED";
  businessIdempotencyKey?: string;
  payloadDigest?: string;
  operationId?: string;
  /**
   * Prefer live durable/provider dispatch — refused while transport NOT_WIRED
   * (tip #211 gate-before-adapter companion).
   */
  preferLiveDispatch?: boolean;
  /** Forbidden — this fixture proof does not cover PG ON CONFLICT race. */
  claimPgRaceCovered?: boolean;
  /**
   * Forbidden — fixture overlap exposure is not live VERIFIED
   * (tip #219 companion: do not treat false/unavailable as measured success).
   */
  treatOverlapAsLiveVerified?: boolean;
  /**
   * Claimed ONE_DISPATCH PASS — only allowed when measured createCount === 1
   * (tip #221 companion: refuse false PASS while unmet).
   */
  claimedOneDispatchPass?: boolean;
  /** Measured concurrent create count for claimedOneDispatchPass gate. */
  createCount?: number;
  /** Claimed PER_KEY_OVERLAP_WHILE_HELD PASS — requires measured overlap. */
  claimedPerKeyOverlapPass?: boolean;
  /** Measured: key B completed create while key A still held. */
  keyBCompletedWhileAHeld?: boolean;
  /** Forbidden — concurrent coalescing is not retry-only NO_DUPLICATE_EFFECTS. */
  claimRetryOnlyCoversConcurrent?: boolean;
  /** Forbidden — fixture soak has externalEffects=NONE (no live dispatch). */
  claimExternalEffectsOccurred?: boolean;
  /** Forbidden — Ads connect trio remains soft-skip ACCESS_BLOCKED. */
  claimChatgptAdsLiveConnect?: boolean;
  /** Forbidden — fixture ACCEPTED must not be equated to live VERIFIED. */
  claimFixtureAcceptedIsVerified?: boolean;
  /** Forbidden — fixture soak must not claim live provider SUCCESS. */
  claimLiveProviderSuccess?: boolean;
  /** Forbidden — fixture soak must not claim sandbox VERIFIED. */
  claimSandboxVerified?: boolean;
  /** Forbidden — fixture soak must not claim production/canary VERIFIED. */
  claimProductionVerified?: boolean;
  /** Forbidden — fixture soak must not claim authorized canary VERIFIED. */
  claimCanaryVerified?: boolean;
  /** Forbidden — fixture soak must not claim integration-tier VERIFIED. */
  claimIntegrationVerified?: boolean;
  /** Forbidden — fixture soak must not claim authorized-production VERIFIED. */
  claimAuthorizedProductionVerified?: boolean;
  /** Forbidden — fixture soak must not claim production-canary VERIFIED combined. */
  claimProductionCanaryVerified?: boolean;
  /** Forbidden — fixture soak must not claim sandbox+production VERIFIED bundle. */
  claimSandboxProductionVerified?: boolean;
}): ConcurrentReleaseLiveClaimDecision | null {
  const honesty = concurrentReleaseHonesty();
  // Tip #211: live claims refuse first — before key/digest inspect / apply.
  if (input.claimFixtureAcceptedIsVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED,
      [
        "FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED — fixture ACCEPTED must not be equated to sandbox/prod VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimLiveProviderSuccess === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED,
      [
        "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED — fixture concurrent-release soak must not claim live provider SUCCESS (T-X021)",
        `liveWiring=${honesty.liveWiring} externalEffects=${honesty.externalEffects} liveProviderSuccessClaimed=false`,
      ],
    );
  }
  if (input.claimSandboxVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.SANDBOX_VERIFIED_CLAIM_REFUSED,
      [
        "SANDBOX_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not sandbox VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimProductionVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.PRODUCTION_VERIFIED_CLAIM_REFUSED,
      [
        "PRODUCTION_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not production/canary VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimCanaryVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.CANARY_VERIFIED_CLAIM_REFUSED,
      [
        "CANARY_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not authorized canary VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimIntegrationVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.INTEGRATION_VERIFIED_CLAIM_REFUSED,
      [
        "INTEGRATION_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not integration-tier VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} liveWiring=${honesty.liveWiring}`,
      ],
    );
  }
  if (input.claimAuthorizedProductionVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED,
      [
        "AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not authorized-production VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimProductionCanaryVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED,
      [
        "PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not production-canary VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimSandboxProductionVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED,
      [
        "SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED — fixture concurrent-release soak is ACCEPTED only, not sandbox+production VERIFIED (T-X021)",
        `fixtureAcceptedNotVerified=${honesty.fixtureAcceptedNotVerified} refuseLiveVerified=${honesty.refuseLiveVerified}`,
      ],
    );
  }
  if (input.claimLiveVerified === true) {
    return liveClaimRefuse(ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED, [
      "Live VERIFIED concurrent-release claims are forbidden — fixture ACCEPTED only (T-X021)",
      `liveWiring=${honesty.liveWiring} ACCEPTED≠VERIFIED`,
    ]);
  }
  if (input.requestLiveWire === true) {
    return liveClaimRefuse(ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED, [
      "Live concurrent durable/provider race wiring remains NOT_WIRED — refuse live wire (T-X021)",
      `chatgptAdsAccess=${honesty.chatgptAdsAccess} adsSoftSkip=[${honesty.adsSoftSkipCaseIds.join(",")}] externalEffects=NONE`,
    ]);
  }
  if (input.claimExternalEffectsOccurred === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.EXTERNAL_EFFECTS_CLAIM_REFUSED,
      [
        "EXTERNAL_EFFECTS_CLAIM_REFUSED — fixture concurrent-release soak has externalEffects=NONE (T-X021)",
        `liveWiring=${honesty.liveWiring} liveProviderSuccessClaimed=false`,
      ],
    );
  }
  if (input.claimChatgptAdsLiveConnect === true) {
    return liveClaimRefuse(ConcurrentReleaseOutcome.ADS_LIVE_CONNECT_CLAIM_REFUSED, [
      "ADS_LIVE_CONNECT_CLAIM_REFUSED — ChatGPT Ads connect is soft-skip ACCESS_BLOCKED for T-X021 (T-F07/T-US-013/T-US-014)",
      `chatgptAdsAccess=${honesty.chatgptAdsAccess} adsSoftSkip=[${honesty.adsSoftSkipCaseIds.join(",")}]`,
    ]);
  }
  if (input.claimPgRaceCovered === true) {
    return liveClaimRefuse(ConcurrentReleaseOutcome.PG_RACE_CLAIM_REFUSED, [
      "PG ON CONFLICT race coverage is not claimed by T-X021 fixture proof — pgRaceNotClaimed=true",
      `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
    ]);
  }
  if (input.claimRetryOnlyCoversConcurrent === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.CONCURRENT_RETRY_ONLY_CLAIM_REFUSED,
      [
        "CONCURRENT_RETRY_ONLY_CLAIM_REFUSED — retry-only NO_DUPLICATE_EFFECTS does not cover concurrent idempotent release (T-X021)",
        `distinctFromRetryOnlyNoDup=${honesty.distinctFromRetryOnlyNoDup} liveWiring=${honesty.liveWiring}`,
      ],
    );
  }
  if (input.treatOverlapAsLiveVerified === true) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.OVERLAP_AS_VERIFIED_REFUSED,
      [
        "Fixture overlap exposure must not be treated as live VERIFIED — ACCEPTED≠VERIFIED (T-X021)",
        `liveWiring=${honesty.liveWiring} refuseLiveVerified=true`,
      ],
    );
  }
  if (input.claimedOneDispatchPass === true && input.createCount !== 1) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED,
      [
        "FALSE_ONE_DISPATCH_PASS_REFUSED — claimed ONE_DISPATCH PASS while measured createCount ≠ 1 (T-X021)",
        `createCount=${input.createCount ?? "unmeasured"} liveWiring=${honesty.liveWiring} ACCEPTED≠VERIFIED`,
      ],
    );
  }
  if (
    input.claimedPerKeyOverlapPass === true &&
    input.keyBCompletedWhileAHeld !== true
  ) {
    return liveClaimRefuse(
      ConcurrentReleaseOutcome.FALSE_PER_KEY_OVERLAP_PASS_REFUSED,
      [
        "FALSE_PER_KEY_OVERLAP_PASS_REFUSED — claimed PER_KEY_OVERLAP_WHILE_HELD PASS without measured keyBCompletedWhileAHeld (T-X021)",
        `keyBCompletedWhileAHeld=${input.keyBCompletedWhileAHeld ?? "unmeasured"} liveWiring=${honesty.liveWiring} ACCEPTED≠VERIFIED`,
      ],
    );
  }
  if (input.preferLiveDispatch === true) {
    return liveClaimRefuse(ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED, [
      "preferLiveDispatch refused while liveWiring=NOT_WIRED — gate before apply; no invented live success (T-X021)",
      `pgRaceNotClaimed=${honesty.pgRaceNotClaimed} chatgptAdsAccess=${honesty.chatgptAdsAccess}`,
    ]);
  }
  if (input.operationId !== undefined) {
    const trimmedOp = input.operationId.trim();
    if (trimmedOp.length === 0) {
      return liveClaimRefuse(ConcurrentReleaseOutcome.BLANK_OPERATION_REFUSED, [
        "Blank operationId refused — no concurrent coalesce without an operation id (T-X021)",
        `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
      ]);
    }
    // Tip #216 trilogy: trimmed !== original → refuse padded op (no silent normalize).
    if (trimmedOp !== input.operationId) {
      return liveClaimRefuse(
        ConcurrentReleaseOutcome.OPERATION_WHITESPACE_REFUSED,
        [
          "operationId with leading/trailing whitespace refused — no silent trim coalesce (T-X021)",
          `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
        ],
      );
    }
  }
  if (input.businessIdempotencyKey !== undefined) {
    const trimmedKey = input.businessIdempotencyKey.trim();
    if (trimmedKey.length === 0) {
      return liveClaimRefuse(ConcurrentReleaseOutcome.BLANK_KEY_REFUSED, [
        "Blank business idempotency key refused — no concurrent coalesce without a key (T-X021)",
        `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
      ]);
    }
    // Tip #216: trimmed !== original → refuse padded ids (no silent normalize).
    if (trimmedKey !== input.businessIdempotencyKey) {
      return liveClaimRefuse(ConcurrentReleaseOutcome.KEY_WHITESPACE_REFUSED, [
        "Business idempotency key with leading/trailing whitespace refused — no silent trim coalesce (T-X021)",
        `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
      ]);
    }
  }
  if (input.payloadDigest !== undefined) {
    const trimmedDigest = input.payloadDigest.trim();
    if (trimmedDigest.length === 0) {
      return liveClaimRefuse(ConcurrentReleaseOutcome.BLANK_DIGEST_REFUSED, [
        "Blank payload digest refused — no concurrent coalesce without a digest (T-X021)",
        `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
      ]);
    }
    if (trimmedDigest !== input.payloadDigest) {
      return liveClaimRefuse(
        ConcurrentReleaseOutcome.DIGEST_WHITESPACE_REFUSED,
        [
          "Payload digest with leading/trailing whitespace refused — no silent trim coalesce (T-X021)",
          `liveWiring=${honesty.liveWiring} externalEffects=NONE`,
        ],
      );
    }
  }
  // Tip #208: fixture path still refuses claimed WIRED; non-fixture always refuses.
  if (input.fixtureOnly === false || input.liveWiring === "WIRED") {
    return liveClaimRefuse(ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED, [
      input.liveWiring === "WIRED"
        ? "Concurrent release refused while liveWiring=WIRED — live transport NOT_WIRED; no invented live success (T-X021)"
        : "Concurrent release refused outside fixture NOT_WIRED path — no invented live success (T-X021)",
      `pgRaceNotClaimed=${honesty.pgRaceNotClaimed} chatgptAdsAccess=${honesty.chatgptAdsAccess}`,
    ]);
  }
  return null;
}

/**
 * Classify concurrent create counts into an outcome code.
 * Unsafe path must observe >1 creates; safe path must observe exactly 1.
 */
export function classifyConcurrentCreateCount(
  createdCount: number,
  mode: "unsafe" | "serialized",
): ConcurrentReleaseOutcomeValue | null {
  if (mode === "unsafe") {
    return createdCount > 1
      ? ConcurrentReleaseOutcome.OVERLAP_EXPOSED
      : null;
  }
  return createdCount === 1 ? ConcurrentReleaseOutcome.ONE_DISPATCH : null;
}

/**
 * Per-key isolation: each distinct business key under a shared barrier must
 * observe exactly one create (mutex is per-key, not a global choke).
 * Alone this is insufficient vs a global mutex — pair with
 * classifyPerKeyOverlapWhileHeld.
 */
export function classifyPerKeyIsolation(
  createdByKey: ReadonlyArray<number>,
): ConcurrentReleaseOutcomeValue | null {
  if (
    createdByKey.length >= 2 &&
    createdByKey.every((n) => n === 1)
  ) {
    return ConcurrentReleaseOutcome.PER_KEY_ISOLATION;
  }
  return null;
}

/**
 * True per-key proof: key B finished create while key A was still held.
 * Final [1,1] create counts alone do not suffice (global mutex also yields that).
 */
export function classifyPerKeyOverlapWhileHeld(input: {
  keyAEntered: boolean;
  keyBCompletedWhileAHeld: boolean;
  keyACreated: boolean;
  keyBCreated: boolean;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.keyAEntered &&
    input.keyBCompletedWhileAHeld &&
    input.keyACreated &&
    input.keyBCreated
  ) {
    return ConcurrentReleaseOutcome.PER_KEY_OVERLAP_WHILE_HELD;
  }
  return null;
}

/** Replay after concurrent coalesce must not create again. */
export function classifyReplayNoCreate(
  created: boolean,
  applyCount: number,
): ConcurrentReleaseOutcomeValue | null {
  if (created === false && applyCount === 1) {
    return ConcurrentReleaseOutcome.REPLAY_NO_CREATE;
  }
  return null;
}

/**
 * Sync memory store behind a start barrier cannot prove overlap — created
 * stays 1. Distinct from async race-window OVERLAP_EXPOSED.
 */
export function classifySyncStoreNoOverlap(
  createdCount: number,
): ConcurrentReleaseOutcomeValue | null {
  return createdCount === 1
    ? ConcurrentReleaseOutcome.SYNC_STORE_NO_OVERLAP
    : null;
}

/**
 * Distinct operationIds sharing one business key still coalesce to one create
 * with a single shared providerEffectId.
 */
export function classifyDistinctOpSameKeyOneDispatch(input: {
  createdCount: number;
  distinctOperationIdsSubmitted: number;
  sharedProviderEffectIdCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.createdCount === 1 &&
    input.distinctOperationIdsSubmitted >= 2 &&
    input.sharedProviderEffectIdCount === 1
  ) {
    return ConcurrentReleaseOutcome.DISTINCT_OP_SAME_KEY_ONE_DISPATCH;
  }
  return null;
}

/** Digest mismatch after bind refused; ledger applyCount stays 1. */
export function classifyDigestMismatchRefused(input: {
  refused: boolean;
  applyCount: number;
  digestUnchanged: boolean;
}): ConcurrentReleaseOutcomeValue | null {
  if (input.refused && input.applyCount === 1 && input.digestUnchanged) {
    return ConcurrentReleaseOutcome.DIGEST_MISMATCH_REFUSED;
  }
  return null;
}

/**
 * Mixed-digest concurrent race under mutex: exactly one create; all wrong
 * digests refuse; ledger row count 1.
 */
export function classifyMixedDigestConcurrentRefused(input: {
  createdCount: number;
  mismatchRefusals: number;
  ledgerRowsForKey: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.createdCount === 1 &&
    input.mismatchRefusals >= 1 &&
    input.ledgerRowsForKey === 1
  ) {
    return ConcurrentReleaseOutcome.MIXED_DIGEST_CONCURRENT_REFUSED;
  }
  return null;
}

/**
 * Global-mutex negative control: B must stay blocked while A is held.
 * Discriminates against rubber-stamping PER_KEY_OVERLAP_WHILE_HELD.
 */
export function classifyGlobalMutexBlocksCrossKey(input: {
  keyAEntered: boolean;
  keyBBlockedWhileAHeld: boolean;
  bothEventuallyCreated: boolean;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.keyAEntered &&
    input.keyBBlockedWhileAHeld &&
    input.bothEventuallyCreated
  ) {
    return ConcurrentReleaseOutcome.GLOBAL_MUTEX_BLOCKS_CROSS_KEY;
  }
  return null;
}

/** Mutex unlocks after throw; subsequent same-digest apply still works. */
export function classifyMutexSurvivesThrow(input: {
  mismatchRefusals: number;
  postThrowReplayCreated: boolean;
  postThrowApplyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.mismatchRefusals >= 1 &&
    input.postThrowReplayCreated === false &&
    input.postThrowApplyCount === 1
  ) {
    return ConcurrentReleaseOutcome.MUTEX_SURVIVES_THROW;
  }
  return null;
}

/** Winner operation lookup: getByOperation returns the shared effect id. */
export function classifyWinnerOperationLookup(input: {
  lookedUp: boolean;
  matchesSharedProviderEffectId: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.lookedUp &&
    input.matchesSharedProviderEffectId &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.WINNER_OPERATION_LOOKUP;
  }
  return null;
}

/** remoteRef unchanged after digest-mismatch refuse. */
export function classifyRemoteRefStableAfterMismatch(input: {
  refused: boolean;
  remoteRefUnchanged: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.refused &&
    input.remoteRefUnchanged &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.REMOTE_REF_STABLE_AFTER_MISMATCH;
  }
  return null;
}

/** Loser distinct operationId has no getByOperation row (winner-only map). */
export function classifyLoserOperationLookupAbsent(input: {
  winnerLookedUp: boolean;
  loserAbsent: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.winnerLookedUp &&
    input.loserAbsent &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.LOSER_OPERATION_LOOKUP_ABSENT;
  }
  return null;
}

/** appliedAtIso unchanged after digest-mismatch refuse. */
export function classifyAppliedAtStableAfterMismatch(input: {
  refused: boolean;
  appliedAtUnchanged: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.refused &&
    input.appliedAtUnchanged &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.APPLIED_AT_STABLE_AFTER_MISMATCH;
  }
  return null;
}

/** Live-claim gate refused with zero store mutations (gate-before-apply). */
export function classifyGateBeforeApply(input: {
  refused: boolean;
  storeMutations: number;
  ledgerRowsUnchanged: boolean;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.refused &&
    input.storeMutations === 0 &&
    input.ledgerRowsUnchanged
  ) {
    return ConcurrentReleaseOutcome.GATE_BEFORE_APPLY;
  }
  return null;
}

/** Post-coalesce getByBusinessKey returns the shared effect. */
export function classifyBusinessKeyLookup(input: {
  lookedUp: boolean;
  matchesSharedProviderEffectId: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.lookedUp &&
    input.matchesSharedProviderEffectId &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.BUSINESS_KEY_LOOKUP;
  }
  return null;
}

/** lastSeenAtIso unchanged after digest-mismatch refuse. */
export function classifyLastSeenStableAfterMismatch(input: {
  refused: boolean;
  lastSeenUnchanged: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.refused &&
    input.lastSeenUnchanged &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.LAST_SEEN_STABLE_AFTER_MISMATCH;
  }
  return null;
}

/** providerEffectId unchanged after digest-mismatch refuse. */
export function classifyProviderEffectIdStableAfterMismatch(input: {
  refused: boolean;
  providerEffectIdUnchanged: boolean;
  applyCount: number;
}): ConcurrentReleaseOutcomeValue | null {
  if (
    input.refused &&
    input.providerEffectIdUnchanged &&
    input.applyCount === 1
  ) {
    return ConcurrentReleaseOutcome.PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH;
  }
  return null;
}

/** Details must never claim live VERIFIED or provider success. */
export function proofDetailsHonest(details: readonly string[]): boolean {
  const joined = details.join("\n");
  if (joined.includes("liveProviderSuccessClaimed=true")) {
    return false;
  }
  if (/\bVERIFIED\b/.test(joined)) {
    const negated =
      /not (?:live |sandbox\/prod )?VERIFIED/i.test(joined) ||
      /≠\s*(?:sandbox\/prod )?VERIFIED/i.test(joined) ||
      /refuseLiveVerified=true/i.test(joined);
    if (!negated) return false;
  }
  return true;
}
