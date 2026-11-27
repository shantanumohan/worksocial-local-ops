import { describe, expect, it } from "vitest";
import {
  EffectState,
  canTransition,
  isPostApplyPhase,
} from "./effect-state-machine.js";
import {
  applyQueuedCancelResults,
  cancelEligibleQueuedWork,
  type CredentialQueuedWorkItem,
} from "./credential-rotation.js";
import { SimulatedEffectLedger } from "./simulated-effect-ledger.js";
import {
  STOP_AFTER_DISPATCH_RELATED_CASE_IDS,
  classifyStopAfterDispatchDisposition,
  evaluateStopAfterDispatchAttackSuite,
  fenceStopAfterDispatchLedgerAttempt,
} from "./stop-after-dispatch.js";

const NOW = "2026-11-21T18:00:00.000Z";

describe("stop after dispatch (T-X017)", () => {
  it("maps only T-X017", () => {
    expect([...STOP_AFTER_DISPATCH_RELATED_CASE_IDS]).toEqual(["T-X017"]);
  });

  it("retains post-apply states and cancels pre-dispatch QUEUED", () => {
    for (const state of [
      EffectState.APPLYING,
      EffectState.VERIFYING,
      EffectState.UNKNOWN_REMOTE_OUTCOME,
      EffectState.COMPLETE,
    ] as const) {
      const d = classifyStopAfterDispatchDisposition(state);
      expect(d.disposition).toBe("RETAIN_FOR_RECONCILE");
      expect(d.cancelled).toBe(false);
      expect(d.retainedForReconcile).toBe(true);
      expect(d.liveProviderWiring).toBe("NOT_WIRED");
      expect(d.externalEffects).toBe("NONE");
      expect(isPostApplyPhase(state)).toBe(true);
    }

    const queued = classifyStopAfterDispatchDisposition(EffectState.QUEUED);
    expect(queued.disposition).toBe("CANCEL");
    expect(queued.cancelled).toBe(true);
    expect(queued.toState).toBe(EffectState.CANCELLED);
    expect(queued.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("forbids APPLYING/VERIFYING → CANCELLED; allows APPLYING → URO", () => {
    expect(canTransition(EffectState.APPLYING, EffectState.CANCELLED)).toBe(
      false,
    );
    expect(canTransition(EffectState.VERIFYING, EffectState.CANCELLED)).toBe(
      false,
    );
    expect(
      canTransition(
        EffectState.APPLYING,
        EffectState.UNKNOWN_REMOTE_OUTCOME,
      ),
    ).toBe(true);
  });

  it("refuses forged cancel results against APPLYING", () => {
    const items: CredentialQueuedWorkItem[] = [
      {
        workId: "qw-applying",
        connectionId: "conn-1",
        capabilityId: "cms_publish",
        operationId: "op-1",
        effectState: EffectState.APPLYING,
        queuedAtIso: NOW,
        summary: "dispatch started",
      },
    ];
    const forged = [
      {
        workId: "qw-applying",
        fromState: EffectState.APPLYING,
        toState: EffectState.CANCELLED,
        cancelled: true,
        retainedForReconcile: false,
        reason: "forged",
        liveProviderWiring: "NOT_WIRED" as const,
        externalEffects: "NONE" as const,
      },
    ];
    const updated = applyQueuedCancelResults(items, forged);
    expect(updated[0]?.effectState).toBe(EffectState.APPLYING);

    const honest = cancelEligibleQueuedWork(items);
    expect(honest[0]?.cancelled).toBe(false);
    expect(honest[0]?.retainedForReconcile).toBe(true);
    expect(honest[0]?.liveProviderWiring).toBe("NOT_WIRED");
    expect(honest[0]?.externalEffects).toBe("NONE");
  });

  it("attack suite passes with NOT_WIRED/NONE honesty", () => {
    const suite = evaluateStopAfterDispatchAttackSuite();
    expect(suite.passed).toBe(true);
    expect(suite.details.join(" ")).toMatch(/NOT_WIRED/);
    expect(suite.details.join(" ")).toMatch(/Forged APPLYING/);
    expect(suite.details.join(" ")).toMatch(/Attempt ledger fence/);
    expect(suite.details.join(" ")).toMatch(/post-UNKNOWN second apply/);
    expect(suite.details.join(" ")).toMatch(/empty secondApplyDigest/);
    expect(suite.details.join(" ")).toMatch(/VERIFYING second apply/);
    expect(suite.details.join(" ")).toMatch(/H14 whitespace secondApplyDigest/);
    expect(suite.details.join(" ")).toMatch(/H14 double UNKNOWN settle/);
    expect(suite.details.join(" ")).toMatch(/H14 retain-flag on QUEUED/);
    expect(suite.details.join(" ")).toMatch(/H15 same-digest replay after UNKNOWN/);
    expect(suite.details.join(" ")).toMatch(/H15 cross-op isolation/);
    expect(suite.details.join(" ")).toMatch(/H15 COMPLETE settle UNKNOWN/);
    expect(suite.details.join(" ")).toMatch(/H17 multi distinct second digests/);
    expect(suite.details.join(" ")).toMatch(/H17 VERIFYING settle UNKNOWN/);
    expect(suite.details.join(" ")).toMatch(/H17 retain-flag on AUTHORIZED/);
    expect(suite.details.join(" ")).toMatch(/H18 omitted secondApplyDigest/);
    expect(suite.details.join(" ")).toMatch(/H18 post-refuse same-digest/);
    expect(suite.details.join(" ")).toMatch(/H18 retain-flag on LEASED/);
    expect(suite.details.join(" ")).toMatch(/H19 retain-flag on RUNNING/);
    expect(suite.details.join(" ")).toMatch(/H19 after same-digest OK/);
    expect(suite.details.join(" ")).toMatch(/H19 forge_verified outside stop-retain/);
    expect(suite.details.join(" ")).toMatch(/H20 retain-flag on WAITING_DEPENDENCY/);
    expect(suite.details.join(" ")).toMatch(/H20 retain-flag on WAITING_HUMAN/);
    expect(suite.details.join(" ")).toMatch(/H20 retain-flag on WAITING_AUTHENTICATION/);
    expect(suite.details.join(" ")).toMatch(/H20 settle_unknown outside stop-retain/);
    expect(suite.details.join(" ")).toMatch(/H21 retain-flag on FAILED_RETRYABLE/);
    expect(suite.details.join(" ")).toMatch(/H21 settle_unknown outside stop-retain on QUEUED/);
    expect(suite.details.join(" ")).toMatch(/H22 retain-flag on QUARANTINED/);
    expect(suite.details.join(" ")).toMatch(/H22 settle_unknown outside stop-retain on VERIFYING/);
    expect(suite.details.join(" ")).toMatch(/H23 retain-flag on CANCELLED/);
    expect(suite.details.join(" ")).toMatch(/H23 settle_unknown outside stop-retain on AUTHORIZED/);
    expect(suite.details.join(" ")).toMatch(/H24 settle_unknown outside stop-retain on QUARANTINED/);
    expect(suite.details.join(" ")).toMatch(/H24 settle_unknown outside stop-retain on CANCELLED/);
    expect(suite.details.join(" ")).toMatch(/H25 settle_unknown outside stop-retain on FAILED_RETRYABLE/);
    expect(suite.details.join(" ")).toMatch(/H25 settle_unknown outside stop-retain on RUNNING/);
    expect(suite.details.join(" ")).toMatch(/H26 settle_unknown outside stop-retain on LEASED/);
    expect(suite.details.join(" ")).toMatch(/H26 settle_unknown outside stop-retain on WAITING_HUMAN/);
    expect(suite.details.join(" ")).toMatch(/H27 settle_unknown outside stop-retain on WAITING_DEPENDENCY/);
    expect(suite.details.join(" ")).toMatch(/H27 settle_unknown outside stop-retain on WAITING_AUTHENTICATION/);
    expect(suite.details.join(" ")).toMatch(/H28 settle_unknown outside stop-retain on UNKNOWN_REMOTE_OUTCOME/);
    expect(suite.details.join(" ")).toMatch(/H28 settle_unknown outside stop-retain on COMPLETE/);
    expect(suite.details.join(" ")).toMatch(/H29 forge_verified outside stop-retain on QUEUED/);
    expect(suite.details.join(" ")).toMatch(/H29 settle_unknown outside stop-retain on APPLYING/);
    expect(suite.details.join(" ")).toMatch(/H30 settle_unknown outside stop-retain on VALIDATING/);
    expect(suite.details.join(" ")).toMatch(/H30 forge_verified outside stop-retain on VERIFYING/);
    expect(suite.details.join(" ")).toMatch(/H31 forge_verified outside stop-retain on LEASED/);
    expect(suite.details.join(" ")).toMatch(/H31 forge_verified outside stop-retain on AUTHORIZED/);
    expect(suite.details.join(" ")).toMatch(/H32 forge_verified outside stop-retain on RUNNING/);
    expect(suite.details.join(" ")).toMatch(/H32 forge_verified outside stop-retain on FAILED_RETRYABLE/);
    expect(suite.details.join(" ")).toMatch(/H33 forge_verified outside stop-retain on CANCELLED/);
    expect(suite.details.join(" ")).toMatch(/H33 forge_verified outside stop-retain on QUARANTINED/);
    expect(suite.details.join(" ")).toMatch(/H34 forge_verified outside stop-retain on UNKNOWN_REMOTE_OUTCOME/);
    expect(suite.details.join(" ")).toMatch(/H34 forge_verified outside stop-retain on WAITING_HUMAN/);
    expect(suite.dispositions.length).toBe(
      Object.keys(EffectState).length,
    );
  });

  it("fences second apply after stop retain; UNKNOWN only; never VERIFIED", () => {
    const ledger = new SimulatedEffectLedger();
    ledger.recordIntent("op-fence", "digest-a", NOW);
    ledger.settle("op-fence", "ACCEPTED_PENDING");

    const second = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-fence",
      payloadDigest: "digest-a",
      secondApplyDigest: "digest-b",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger,
    });
    expect(second.allowed).toBe(false);
    expect(second.code).toBe("SECOND_APPLY_REFUSED");
    expect(second.applyAttemptCount).toBe(1);
    expect(second.hasVerified).toBe(false);
    expect(second.liveProviderWiring).toBe("NOT_WIRED");
    expect(second.externalEffects).toBe("NONE");
    expect(second.fixtureOnly).toBe(true);

    const unknown = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-fence",
      payloadDigest: "digest-a",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger,
    });
    expect(unknown.allowed).toBe(true);
    expect(unknown.code).toBe("UNKNOWN_SETTLE_OK");
    expect(unknown.ledgerOutcome).toBe("UNKNOWN_REMOTE_OUTCOME");
    expect(unknown.hasVerified).toBe(false);

    const forged = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-fence",
      payloadDigest: "digest-a",
      recordedAtIso: NOW,
      attempt: "forge_verified",
      ledger,
    });
    expect(forged.allowed).toBe(false);
    expect(forged.code).toBe("VERIFIED_FORGE_REFUSED");
    expect(ledger.hasVerified("op-fence")).toBe(false);

    // H13: post-UNKNOWN second apply still refused.
    const afterUnknown = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-fence",
      payloadDigest: "digest-a",
      secondApplyDigest: "digest-after-unknown",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger,
    });
    expect(afterUnknown.allowed).toBe(false);
    expect(afterUnknown.code).toBe("SECOND_APPLY_REFUSED");
    expect(afterUnknown.applyAttemptCount).toBe(1);

    for (const state of [
      EffectState.VERIFYING,
      EffectState.COMPLETE,
    ] as const) {
      const r = fenceStopAfterDispatchLedgerAttempt({
        stopRetainedForReconcile: true,
        effectState: state,
        operationId: `op-${state}`,
        payloadDigest: `d-${state}`,
        secondApplyDigest: `d-${state}-2`,
        recordedAtIso: NOW,
        attempt: "record_second_apply",
      });
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("SECOND_APPLY_REFUSED");
    }

    const empty = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-empty",
      payloadDigest: "digest-base",
      secondApplyDigest: "",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(empty.allowed).toBe(false);
    expect(empty.code).toBe("SECOND_APPLY_REFUSED");

    // H14: whitespace digest refused.
    const ws = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-ws",
      payloadDigest: "digest-ws",
      secondApplyDigest: "  \t\n ",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(ws.allowed).toBe(false);
    expect(ws.code).toBe("SECOND_APPLY_REFUSED");

    // H14: double UNKNOWN + forge after UNKNOWN.
    const ledger2 = new SimulatedEffectLedger();
    const u1 = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-dbl",
      payloadDigest: "d-dbl",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: ledger2,
    });
    const u2 = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-dbl",
      payloadDigest: "d-dbl",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: ledger2,
    });
    expect(u1.allowed).toBe(true);
    expect(u2.allowed).toBe(true);
    expect(u2.ledgerOutcome).toBe("UNKNOWN_REMOTE_OUTCOME");
    expect(ledger2.hasVerified("op-dbl")).toBe(false);
    const forge2 = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-dbl",
      payloadDigest: "d-dbl",
      recordedAtIso: NOW,
      attempt: "forge_verified",
      ledger: ledger2,
    });
    expect(forge2.allowed).toBe(false);
    expect(forge2.code).toBe("VERIFIED_FORGE_REFUSED");

    // H14: retain flag on QUEUED does not engage fence.
    const pre = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.QUEUED,
      operationId: "op-pre",
      payloadDigest: "d-pre",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(pre.allowed).toBe(true);
    expect(pre.code).toBe("PRE_STOP_APPLY_OK");

    // H15: same-digest after UNKNOWN.
    const sameL = new SimulatedEffectLedger();
    fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-same",
      payloadDigest: "d-same",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: sameL,
    });
    const same = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-same",
      payloadDigest: "d-same",
      secondApplyDigest: "d-same",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger: sameL,
    });
    expect(same.allowed).toBe(true);
    expect(same.code).toBe("PRE_STOP_APPLY_OK");

    // H15: COMPLETE settle UNKNOWN; forge refused.
    const cu = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.COMPLETE,
      operationId: "op-cu",
      payloadDigest: "d-cu",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
    });
    expect(cu.allowed).toBe(true);
    expect(cu.code).toBe("UNKNOWN_SETTLE_OK");
    const cf = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.COMPLETE,
      operationId: "op-cf",
      payloadDigest: "d-cf",
      recordedAtIso: NOW,
      attempt: "forge_verified",
    });
    expect(cf.allowed).toBe(false);
    expect(cf.code).toBe("VERIFIED_FORGE_REFUSED");

    // H17: multi distinct digests refused.
    const ml = new SimulatedEffectLedger();
    fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-multi",
      payloadDigest: "d-multi",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: ml,
    });
    for (const s of ["-1", "-2", "-3"]) {
      const r = fenceStopAfterDispatchLedgerAttempt({
        stopRetainedForReconcile: true,
        effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
        operationId: "op-multi",
        payloadDigest: "d-multi",
        secondApplyDigest: `d-multi${s}`,
        recordedAtIso: NOW,
        attempt: "record_second_apply",
        ledger: ml,
      });
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("SECOND_APPLY_REFUSED");
      expect(r.applyAttemptCount).toBe(1);
    }

    // H17: VERIFYING settle + forge.
    const vl = new SimulatedEffectLedger();
    const vu = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.VERIFYING,
      operationId: "op-vu",
      payloadDigest: "d-vu",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: vl,
    });
    expect(vu.allowed).toBe(true);
    expect(vu.code).toBe("UNKNOWN_SETTLE_OK");
    const vf = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.VERIFYING,
      operationId: "op-vu",
      payloadDigest: "d-vu",
      recordedAtIso: NOW,
      attempt: "forge_verified",
      ledger: vl,
    });
    expect(vf.allowed).toBe(false);
    expect(vf.code).toBe("VERIFIED_FORGE_REFUSED");

    // H17: AUTHORIZED + retain-flag.
    const ap = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.AUTHORIZED,
      operationId: "op-auth",
      payloadDigest: "d-auth",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(ap.allowed).toBe(true);
    expect(ap.code).toBe("PRE_STOP_APPLY_OK");

    // H18: omitted secondApplyDigest defaults refuse; then same-digest OK.
    const dl = new SimulatedEffectLedger();
    fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-def",
      payloadDigest: "d-def",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: dl,
    });
    const def = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-def",
      payloadDigest: "d-def",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger: dl,
    });
    expect(def.allowed).toBe(false);
    expect(def.code).toBe("SECOND_APPLY_REFUSED");
    const sameAfterRefuse = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-def",
      payloadDigest: "d-def",
      secondApplyDigest: "d-def",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger: dl,
    });
    expect(sameAfterRefuse.allowed).toBe(true);
    expect(sameAfterRefuse.code).toBe("PRE_STOP_APPLY_OK");

    // H18: LEASED + retain-flag.
    const lp = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.LEASED,
      operationId: "op-leased",
      payloadDigest: "d-leased",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(lp.allowed).toBe(true);
    expect(lp.code).toBe("PRE_STOP_APPLY_OK");

    // H19: RUNNING + retain-flag.
    const rp = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.RUNNING,
      operationId: "op-running",
      payloadDigest: "d-running",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(rp.allowed).toBe(true);
    expect(rp.code).toBe("PRE_STOP_APPLY_OK");

    // H19: after same-digest, distinct still refused.
    const sl = new SimulatedEffectLedger();
    fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.APPLYING,
      operationId: "op-seq",
      payloadDigest: "d-seq",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
      ledger: sl,
    });
    const seqSame = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-seq",
      payloadDigest: "d-seq",
      secondApplyDigest: "d-seq",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger: sl,
    });
    expect(seqSame.allowed).toBe(true);
    const seqDistinct = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-seq",
      payloadDigest: "d-seq",
      secondApplyDigest: "d-seq-x",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
      ledger: sl,
    });
    expect(seqDistinct.allowed).toBe(false);
    expect(seqDistinct.code).toBe("SECOND_APPLY_REFUSED");

    // H19: forge outside retain.
    const fo = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: false,
      effectState: EffectState.APPLYING,
      operationId: "op-fo",
      payloadDigest: "d-fo",
      recordedAtIso: NOW,
      attempt: "forge_verified",
    });
    expect(fo.allowed).toBe(false);
    expect(fo.code).toBe("VERIFIED_FORGE_REFUSED");

    // H20: WAITING_* + retain-flag.
    for (const state of [
      EffectState.WAITING_DEPENDENCY,
      EffectState.WAITING_HUMAN,
      EffectState.WAITING_AUTHENTICATION,
    ] as const) {
      const wp = fenceStopAfterDispatchLedgerAttempt({
        stopRetainedForReconcile: true,
        effectState: state,
        operationId: `op-${state}`,
        payloadDigest: `d-${state}`,
        recordedAtIso: NOW,
        attempt: "record_second_apply",
      });
      expect(wp.allowed).toBe(true);
      expect(wp.code).toBe("PRE_STOP_APPLY_OK");
    }

    // H20: settle_unknown outside stop-retain.
    const so = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: false,
      effectState: EffectState.APPLYING,
      operationId: "op-so",
      payloadDigest: "d-so",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
    });
    expect(so.allowed).toBe(true);
    expect(so.code).toBe("UNKNOWN_SETTLE_OK");
    expect(so.hasVerified).toBe(false);
    expect(so.liveProviderWiring).toBe("NOT_WIRED");

    // H21: FAILED_RETRYABLE retain.
    const fr = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.FAILED_RETRYABLE,
      operationId: "op-fr",
      payloadDigest: "d-fr",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(fr.code).toBe("PRE_STOP_APPLY_OK");

    // H21: QUEUED settle outside.
    const qs = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: false,
      effectState: EffectState.QUEUED,
      operationId: "op-qs",
      payloadDigest: "d-qs",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
    });
    expect(qs.code).toBe("UNKNOWN_SETTLE_OK");
    expect(qs.hasVerified).toBe(false);

    const qp = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.QUARANTINED,
      operationId: "op-qp",
      payloadDigest: "d-qp",
      recordedAtIso: NOW,
      attempt: "record_second_apply",
    });
    expect(qp.code).toBe("PRE_STOP_APPLY_OK");

    const vs = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: false,
      effectState: EffectState.VERIFYING,
      operationId: "op-vs",
      payloadDigest: "d-vs",
      recordedAtIso: NOW,
      attempt: "settle_unknown",
    });
    expect(vs.code).toBe("UNKNOWN_SETTLE_OK");
    expect(vs.hasVerified).toBe(false);
    expect(fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true, effectState: EffectState.CANCELLED,
      operationId: "c", payloadDigest: "d", recordedAtIso: NOW, attempt: "record_second_apply",
    }).code).toBe("PRE_STOP_APPLY_OK");
    expect(fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: false, effectState: EffectState.AUTHORIZED,
      operationId: "a", payloadDigest: "d", recordedAtIso: NOW, attempt: "settle_unknown",
    }).code).toBe("UNKNOWN_SETTLE_OK");
  });
});
