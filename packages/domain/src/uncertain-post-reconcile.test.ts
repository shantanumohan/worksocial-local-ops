import { describe, expect, it } from "vitest";
import { evaluateUncertainPostReconcile } from "./uncertain-post-reconcile.js";

function validAttempt(
  overrides: Partial<Parameters<typeof evaluateUncertainPostReconcile>[0]["attempt"]> = {},
) {
  return {
    postId: "post-acoustic-linkedin",
    destinationId: "dest-linkedin",
    attemptId: "attempt-1",
    correlationId: "corr-post-acoustic-1",
    remoteState: "UNKNOWN_REMOTE" as const,
    ...overrides,
  };
}

function validInput(
  overrides: Partial<Parameters<typeof evaluateUncertainPostReconcile>[0]> = {},
) {
  return {
    attempt: validAttempt(),
    reconcile: {
      reconcileId: "recon-1",
      settlement: "VERIFIED_ABSENT" as const,
      remoteReceiptId: null,
    },
    requestBlindRetry: false,
    requestRetryAfterReconcile: true,
    claimPostSucceededDespiteUncertainty: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("uncertain-post-reconcile (T-US-030)", () => {
  it("authorizes linked retry after reconcile finds post absent", () => {
    const decision = evaluateUncertainPostReconcile(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("RECONCILED_POST_ABSENT_RETRY_AUTHORIZED");
    expect(decision.blindRetryRefused).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.retryAuthorized).toBe(true);
    expect(decision.evidence.settlement).toBe("VERIFIED_ABSENT");
    expect(decision.evidence.recoveryPath).toBe("RECONCILE_BEFORE_RETRY");
  });

  it("records present settlement without authorizing retry", () => {
    const decision = evaluateUncertainPostReconcile(
      validInput({
        reconcile: {
          reconcileId: "recon-present",
          settlement: "VERIFIED_PRESENT",
          remoteReceiptId: "rcpt-remote-1",
        },
        requestRetryAfterReconcile: false,
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("RECONCILED_POST_PRESENT_NO_RETRY");
    expect(decision.evidence.retryAuthorized).toBe(false);
    expect(decision.evidence.remoteReceiptId).toBe("rcpt-remote-1");
  });

  it("refuses blind retry while uncertain", () => {
    const decision = evaluateUncertainPostReconcile(
      validInput({
        reconcile: null,
        requestBlindRetry: true,
        requestRetryAfterReconcile: false,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("BLIND_RETRY_REFUSED");
    expect(decision.evidence?.currentState).toBe("UNCERTAIN");
    expect(decision.evidence?.recoveryPath).toBe("RECONCILE_BEFORE_RETRY");
    expect(decision.evidence?.preservedInputCount).toBeGreaterThan(0);
  });

  it("requires reconcile before any progress", () => {
    const decision = evaluateUncertainPostReconcile(
      validInput({
        reconcile: null,
        requestBlindRetry: false,
        requestRetryAfterReconcile: false,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("RECONCILE_REQUIRED");
    expect(decision.evidence?.blockingDecision).toBe(
      "UNCERTAIN_POST_REQUIRES_RECONCILE",
    );
  });

  it("refuses retry when reconcile finds post present", () => {
    const decision = evaluateUncertainPostReconcile(
      validInput({
        reconcile: {
          reconcileId: "recon-present",
          settlement: "VERIFIED_PRESENT",
          remoteReceiptId: "rcpt-remote-1",
        },
        requestRetryAfterReconcile: true,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("RETRY_REFUSED_POST_PRESENT");
  });

  it("refuses false success and live wiring", () => {
    const falseClaim = evaluateUncertainPostReconcile(
      validInput({ claimPostSucceededDespiteUncertainty: true }),
    );
    expect(falseClaim.allowed).toBe(false);
    if (falseClaim.allowed) throw new Error("expected blocked");
    expect(falseClaim.code).toBe("FALSE_SUCCESS_CLAIM_REFUSED");

    const live = evaluateUncertainPostReconcile(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(live.allowed).toBe(false);
    if (live.allowed) throw new Error("expected blocked");
    expect(live.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("blocks when reconcile stays uncertain or fails", () => {
    const still = evaluateUncertainPostReconcile(
      validInput({
        reconcile: {
          reconcileId: "recon-u",
          settlement: "STILL_UNCERTAIN",
          remoteReceiptId: null,
        },
        requestRetryAfterReconcile: false,
      }),
    );
    expect(still.allowed).toBe(false);
    if (still.allowed) throw new Error("expected blocked");
    expect(still.code).toBe("RECONCILE_STILL_UNCERTAIN");

    const failed = evaluateUncertainPostReconcile(
      validInput({
        reconcile: {
          reconcileId: "recon-f",
          settlement: "FAILED",
          remoteReceiptId: null,
        },
        requestRetryAfterReconcile: false,
      }),
    );
    expect(failed.allowed).toBe(false);
    if (failed.allowed) throw new Error("expected blocked");
    expect(failed.code).toBe("RECONCILE_FAILED");
  });
});
