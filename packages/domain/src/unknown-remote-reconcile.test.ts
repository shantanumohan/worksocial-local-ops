import { describe, expect, it } from "vitest";
import { EffectState } from "./effect-state-machine.js";
import {
  UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING,
  UNKNOWN_REMOTE_RECONCILE_RELATED_CASE_IDS,
  evaluateUnknownRemoteReconcile,
  isUnknownRemoteCompatibleEffectState,
  isUnknownRemoteResumeAuthorized,
  recordTimeoutAfterProviderAcceptance,
  unknownRemoteBlocksBlindResend,
  unknownRemoteDistinctFromUncertainPost,
  unknownRemoteHonestyPins,
  type UnknownRemoteReconcileInput,
} from "./unknown-remote-reconcile.js";

function baseInput(
  overrides: Partial<UnknownRemoteReconcileInput> = {},
): UnknownRemoteReconcileInput {
  return {
    operationId: "op-x020-1",
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-abc",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("unknown-remote-reconcile (T-X020 / T-US-048)", () => {
  it("pins related cases and NOT_WIRED wiring", () => {
    expect([...UNKNOWN_REMOTE_RECONCILE_RELATED_CASE_IDS]).toEqual([
      "T-X020",
      "T-US-048",
    ]);
    expect(UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING).toBe("NOT_WIRED");
  });

  it("authorizes reconcile + independent verify without resend", () => {
    const d = evaluateUnknownRemoteReconcile(baseInput());
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.code).toBe("RECONCILED_VERIFIED_NO_RESEND");
    expect(d.applyAttemptCount).toBe(1);
    expect(d.blindResendRefused).toBe(true);
    expect(d.liveProviderWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");
    expect(d.fixtureOnly).toBe(true);
    expect(d.evidence.remoteRef).toBe("remote-abc");
  });

  it("refuses blind resend while unknown", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({
        requestBlindResend: true,
        reconciledRemoteRef: null,
        independentVerifyMatched: false,
      }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("BLIND_RESEND_REFUSED");
    expect(d.blindResendRefused).toBe(true);
    expect(d.evidence?.blockingDecision).toBe("BLIND_RESEND_WHILE_UNKNOWN");
  });

  it("requires non-blank remoteRef before resume (S5)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({
        reconciledRemoteRef: "   ",
        independentVerifyMatched: true,
      }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("REMOTE_REF_REQUIRED");
    expect(d.evidence?.blockingDecision).toBe("MISSING_RECONCILED_REMOTE_REF");
  });

  it("requires independent verify match when remoteRef present (S5)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({
        reconciledRemoteRef: "remote-abc",
        independentVerifyMatched: false,
      }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("INDEPENDENT_VERIFY_REQUIRED");
    expect(d.evidence?.blockingDecision).toBe("INDEPENDENT_VERIFY_MISMATCH");
  });

  it("distinguishes applyCount=0 from over-apply (S5)", () => {
    const never = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: 0 }),
    );
    expect(never.allowed).toBe(false);
    if (never.allowed) return;
    expect(never.code).toBe("APPLY_NEVER_HAPPENED");

    const over = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: 2 }),
    );
    expect(over.allowed).toBe(false);
    if (over.allowed) return;
    expect(over.code).toBe("APPLY_COUNT_MUST_STAY_ONE");
  });

  it("trims remoteRef on allow evidence (S5)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ reconciledRemoteRef: "  remote-pad  " }),
    );
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.evidence.remoteRef).toBe("remote-pad");
  });

  it("refuses negative applyAttemptCount distinctly (S6)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: -1 }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("APPLY_COUNT_NEGATIVE");
  });

  it("refuses incoherent blind resend with reconcile signals (S6)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({
        requestBlindResend: true,
        reconciledRemoteRef: "remote-abc",
        independentVerifyMatched: true,
      }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("INCOHERENT_BLIND_WITH_RECONCILE");
    expect(d.evidence?.blockingDecision).toBe("BLIND_AND_RECONCILE_TOGETHER");
  });

  it("exports honesty pins without claiming VERIFIED (S6)", () => {
    const pins = unknownRemoteHonestyPins();
    expect([...pins.relatedCaseIds]).toEqual(["T-X020", "T-US-048"]);
    expect(pins.liveProviderWiring).toBe("NOT_WIRED");
    expect(pins.externalEffects).toBe("NONE");
    expect(pins.fixtureOnly).toBe(true);
    expect(pins.acceptedEqualsVerified).toBe(false);
  });

  it("refuses non-finite applyAttemptCount (S7)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: Number.NaN }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("APPLY_COUNT_NON_FINITE");
  });

  it("refuses already-terminal effectState COMPLETE (S7)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ effectState: EffectState.COMPLETE }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("EFFECT_STATE_ALREADY_TERMINAL");
    expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_TERMINAL");
  });

  it("authorizes resume helper only for certified allow (S7)", () => {
    const ok = evaluateUnknownRemoteReconcile(baseInput());
    expect(isUnknownRemoteResumeAuthorized(ok)).toBe(true);
    const bad = evaluateUnknownRemoteReconcile(
      baseInput({ requestBlindResend: true, reconciledRemoteRef: null }),
    );
    expect(isUnknownRemoteResumeAuthorized(bad)).toBe(false);
  });

  it("refuses FAILED_RETRYABLE as not the URO timeout path (S8)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ effectState: EffectState.FAILED_RETRYABLE }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("EFFECT_STATE_RETRYABLE_NOT_URO");
    expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_RETRYABLE_PATH");
  });

  it("pins distinct-from T-US-030 uncertain-post (S8)", () => {
    const d = unknownRemoteDistinctFromUncertainPost();
    expect(d.thisRecoveryPath).toBe("UNKNOWN_REMOTE_RECONCILE");
    expect(d.distinctFromCaseIds).toContain("T-US-030");
    expect(d.distinctFromProof).toBe("UNCERTAIN_POST_RECONCILE_BEFORE_RETRY");
    expect(d.fixtureOnly).toBe(true);
    expect(d.acceptedEqualsVerified).toBe(false);
  });

  it("pins distinct-from sibling proofs through T-X030 (S9/S14–S30)", () => {
    const d = unknownRemoteDistinctFromUncertainPost();
    expect([...d.distinctFromCaseIds]).toEqual([
      "T-US-030",
      "T-US-060",
      "T-X005",
      "T-X006",
      "T-X007",
      "T-X016",
      "T-X017",
      "T-X018",
      "T-X021",
      "T-X022",
      "T-X023",
      "T-X024",
      "T-X025",
      "T-X026",
      "T-X027",
      "T-X028",
      "T-X029",
      "T-X030",
      "T-X066",
    ]);
    expect([...d.distinctFromProofs]).toEqual([
      "UNCERTAIN_POST_RECONCILE_BEFORE_RETRY",
      "EMERGENCY_STOP_AT_COMMIT",
      "FORGED_BROWSER_ROLE_IGNORED",
      "CROSS_WORKSPACE_REFERENCE_DENIED",
      "WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP",
      "STOP_BEFORE_DISPATCH_NO_MUTATION",
      "STOP_AFTER_DISPATCH_RECONCILE",
      "SELF_APPROVAL_REJECTED",
      "CONCURRENT_IDEMPOTENT_RELEASE",
      "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
      "EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND",
      "OLD_FENCE_AFTER_REASSIGNMENT",
      "EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED",
      "ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE",
      "CONCURRENT_FINAL_BUDGET_RESERVATION_CAP",
      "UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL",
      "EXPLICIT_ACCOUNT_REBIND",
      "RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE",
      "BACKUP_OMIT_RECEIPT",
    ]);
  });

  it("refuses CANCELLED and QUARANTINED as already-terminal (S9)", () => {
    for (const effectState of [
      EffectState.CANCELLED,
      EffectState.QUARANTINED,
    ] as const) {
      const d = evaluateUnknownRemoteReconcile(baseInput({ effectState }));
      expect(d.allowed).toBe(false);
      if (d.allowed) return;
      expect(d.code).toBe("EFFECT_STATE_ALREADY_TERMINAL");
      expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_TERMINAL");
    }
  });

  it("refuses negative Infinity applyAttemptCount as non-finite (S9)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: Number.NEGATIVE_INFINITY }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("APPLY_COUNT_NON_FINITE");
  });

  it("refuses fractional applyAttemptCount as non-integer (S10)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: 1.5 }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("APPLY_COUNT_NON_INTEGER");
    expect(d.evidence?.blockingDecision).toBe("APPLY_COUNT_FRACTIONAL");
  });

  it("refuses APPLYING as in-flight not URO timeout path (S12)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ effectState: EffectState.APPLYING }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("EFFECT_STATE_IN_FLIGHT_NOT_URO");
    expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_IN_FLIGHT_APPLY");
  });

  it("refuses RUNNING/LEASED/AUTHORIZED as pre-apply not URO (S11)", () => {
    for (const effectState of [
      EffectState.RUNNING,
      EffectState.LEASED,
      EffectState.AUTHORIZED,
    ] as const) {
      const d = evaluateUnknownRemoteReconcile(baseInput({ effectState }));
      expect(d.allowed).toBe(false);
      if (d.allowed) return;
      expect(d.code).toBe("EFFECT_STATE_PRE_APPLY_NOT_URO");
      expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_PRE_APPLY_PATH");
    }
  });

  it("refuses WAITING_* effectStates as not the URO timeout path (S10)", () => {
    for (const effectState of [
      EffectState.WAITING_HUMAN,
      EffectState.WAITING_AUTHENTICATION,
      EffectState.WAITING_DEPENDENCY,
    ] as const) {
      const d = evaluateUnknownRemoteReconcile(baseInput({ effectState }));
      expect(d.allowed).toBe(false);
      if (d.allowed) return;
      expect(d.code).toBe("EFFECT_STATE_WAITING_NOT_URO");
      expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_WAITING_PATH");
    }
  });

  it("refuses false provider-success claim", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ claimProviderSuccessDespiteUnknown: true }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("FALSE_SUCCESS_CLAIM_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    expect(d.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("rejects applyAttemptCount ≠ 1", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: 2 }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("APPLY_COUNT_MUST_STAY_ONE");
  });

  it("blocks blind resend for post-apply / URO effect states", () => {
    expect(unknownRemoteBlocksBlindResend(EffectState.APPLYING)).toBe(true);
    expect(unknownRemoteBlocksBlindResend(EffectState.VERIFYING)).toBe(true);
    expect(
      unknownRemoteBlocksBlindResend(EffectState.UNKNOWN_REMOTE_OUTCOME),
    ).toBe(true);
    expect(unknownRemoteBlocksBlindResend(EffectState.QUEUED)).toBe(false);
    expect(unknownRemoteBlocksBlindResend(EffectState.COMPLETE)).toBe(false);
  });

  it("rejects incompatible effectState even when reconcile flags are set", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ effectState: EffectState.QUEUED }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("EFFECT_STATE_INCOMPATIBLE");
    expect(d.evidence?.blockingDecision).toBe(
      "EFFECT_STATE_NOT_POST_APPLY_UNKNOWN",
    );
  });

  it("requires effectState before allowing resume", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ effectState: undefined }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("EFFECT_STATE_REQUIRED");
    expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_OMITTED");
  });

  it("refuses VERIFYING as post-apply verify not URO timeout path (S13)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ effectState: EffectState.VERIFYING }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("EFFECT_STATE_VERIFYING_NOT_URO");
    expect(d.evidence?.blockingDecision).toBe("EFFECT_STATE_VERIFYING_PATH");
  });

  it("exposes timeout settle targets without claiming live wiring", () => {
    const t = recordTimeoutAfterProviderAcceptance();
    expect(t.outcome).toBe("UNKNOWN_REMOTE_OUTCOME");
    expect(t.effectState).toBe(EffectState.UNKNOWN_REMOTE_OUTCOME);
    expect(t.liveProviderWiring).toBe("NOT_WIRED");
    expect(t.externalEffects).toBe("NONE");
  });

  it("refuses ACCEPTED_PENDING phase as provider-ack only (S16)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ phase: "ACCEPTED_PENDING" }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("PHASE_ACCEPTED_PENDING_NOT_URO");
    expect(d.evidence?.blockingDecision).toBe("PHASE_PROVIDER_ACK_ONLY");
  });

  it("refuses sandbox/prod VERIFIED promotion claim (ACCEPTED ≠ VERIFIED)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ claimSandboxOrProdVerified: true }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("SANDBOX_VERIFIED_CLAIM_REFUSED");
    expect(d.fixtureOnly).toBe(true);
    expect(d.externalEffects).toBe("NONE");
  });

  it("refuses blank operationId as INPUT_INCOMPLETE (Q33/S17)", () => {
    for (const operationId of ["", "   ", "\t"]) {
      const d = evaluateUnknownRemoteReconcile(
        baseInput({ operationId }),
      );
      expect(d.allowed).toBe(false);
      if (d.allowed) return;
      expect(d.code).toBe("INPUT_INCOMPLETE");
      expect(d.blindResendRefused).toBe(true);
      expect(d.externalEffects).toBe("NONE");
    }
  });

  it("refuses positive Infinity applyAttemptCount as non-finite (Q33/S18)", () => {
    const d = evaluateUnknownRemoteReconcile(
      baseInput({ applyAttemptCount: Number.POSITIVE_INFINITY }),
    );
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("APPLY_COUNT_NON_FINITE");
    expect(d.evidence?.blockingDecision).toBe("APPLY_COUNT_NON_FINITE");
  });

  it("isUnknownRemoteCompatibleEffectState distinguishes URO path from QUEUED (Q33/S19)", () => {
    expect(
      isUnknownRemoteCompatibleEffectState(EffectState.UNKNOWN_REMOTE_OUTCOME),
    ).toBe(true);
    expect(isUnknownRemoteCompatibleEffectState(EffectState.APPLYING)).toBe(
      true,
    );
    expect(isUnknownRemoteCompatibleEffectState(EffectState.VERIFYING)).toBe(
      true,
    );
    expect(isUnknownRemoteCompatibleEffectState(EffectState.QUEUED)).toBe(
      false,
    );
  });

  it("allow path pins recoveryPath and applyCount=1 on success reasons (Q33/S20)", () => {
    const d = evaluateUnknownRemoteReconcile(baseInput());
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.evidence.recoveryPath).toBe("UNKNOWN_REMOTE_RECONCILE");
    expect(d.applyAttemptCount).toBe(1);
    expect(d.reasons.join(" ")).toContain("applyCount=1");
    expect(d.reasons.join(" ")).toContain("T-X020");
  });
});
