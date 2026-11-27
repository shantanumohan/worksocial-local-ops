/**
 * Mission workflow lease fence — T-X024 hillclimb unit coverage.
 * Fixture / memory store only. ACCEPTED ≠ VERIFIED. Temporal NOT_WIRED.
 */

import { describe, expect, it } from "vitest";
import {
  classifyMissionLeaseFence,
  createMemoryMissionWorkflowStore,
  evaluateFixtureTemporalWiring,
  evaluateOldFenceAcceptanceLabel,
  evaluateOldFenceCatalogCaseId,
  evaluateOldFenceChatgptAdsAccess,
  evaluateOldFenceExternalEffects,
  evaluateOldFenceLiveProviderSuccess,
  evaluateOldFenceAcceptedNotVerified,
  evaluateOldFenceAssignedCaseId,
  evaluateOldFenceCohort2MergeHold,
  evaluateOldFenceRelatedCaseIds,
  evaluateOldFenceLiveTemporalNotWired,
  evaluateOldFenceSoftSkipAdsCase,
  formatOldFenceHonestyDetail,
  isMissionLeaseActive,
  missionLeaseFenceFailedMessage,
  parseMissionLeaseFenceCause,
  OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
  OLD_FENCE_CATALOG_CEILING,
  OLD_FENCE_HONESTY,
  type MissionWorkflowRecord,
} from "./mission-workflow-store.js";

function baseRecord(
  overrides: Partial<MissionWorkflowRecord> = {},
): MissionWorkflowRecord {
  return {
    workflowId: "wf-test",
    jobId: "job-test",
    operationId: null,
    phase: "leased",
    retryCategory: null,
    attemptCount: 1,
    leaseHolder: "worker-a",
    leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
    reviewRequired: false,
    reviewToken: null,
    lastError: null,
    temporalWiring: "FIXTURE",
    temporalRunId: null,
    envelopeJson: {},
    createdAtIso: "2026-11-21T18:00:00.000Z",
    updatedAtIso: "2026-11-21T18:00:00.000Z",
    ...overrides,
  };
}

describe("classifyMissionLeaseFence / isMissionLeaseActive (T-X024)", () => {
  it("maps related case to T-X024 only", () => {
    expect([...OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS]).toEqual([
      "T-X024",
    ]);
  });

  it("is active before expiry for matching holder", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-a", "2026-11-21T18:00:00.500Z"),
    ).toBe("active");
    expect(
      isMissionLeaseActive(rec, "worker-a", "2026-11-21T18:00:00.500Z"),
    ).toBe(true);
  });

  it("is expired at exact expiry boundary", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-a", "2026-11-21T18:00:01.000Z"),
    ).toBe("expired");
    expect(
      isMissionLeaseActive(rec, "worker-a", "2026-11-21T18:00:01.000Z"),
    ).toBe(false);
  });

  it("is wrong_holder for mismatched holder (distinct from expired)", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-b", "2026-11-21T18:00:00.500Z"),
    ).toBe("wrong_holder");
    expect(
      classifyMissionLeaseFence(rec, "worker-b", "2026-11-21T18:00:01.000Z"),
    ).toBe("wrong_holder");
  });

  it("is no_holder when lease never claimed", () => {
    expect(
      classifyMissionLeaseFence(
        baseRecord({ leaseHolder: null, leaseExpiresAtIso: null, phase: "enqueued" }),
        "worker-a",
        "2026-11-21T18:00:00.000Z",
      ),
    ).toBe("no_holder");
  });

  it("formats fenceCause on deny messages and parses round-trip", () => {
    expect(missionLeaseFenceFailedMessage("wf-x", "expired")).toBe(
      "Lease fence failed for wf-x (fenceCause=expired)",
    );
    expect(missionLeaseFenceFailedMessage("wf-x", "wrong_holder")).toBe(
      "Lease fence failed for wf-x (fenceCause=wrong_holder)",
    );
    expect(
      parseMissionLeaseFenceCause(
        missionLeaseFenceFailedMessage("wf-x", "expired"),
      ),
    ).toBe("expired");
    expect(
      parseMissionLeaseFenceCause(
        missionLeaseFenceFailedMessage("wf-y", "wrong_holder"),
      ),
    ).toBe("wrong_holder");
    expect(
      parseMissionLeaseFenceCause(
        missionLeaseFenceFailedMessage("wf-z", "no_holder"),
      ),
    ).toBe("no_holder");
    expect(parseMissionLeaseFenceCause("Lease fence failed for wf-x")).toBeNull();
    expect(
      parseMissionLeaseFenceCause("Lease fence failed (fenceCause=bogus)"),
    ).toBeNull();
  });

  it("is active 1ms before exact expiry", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-a", "2026-11-21T18:00:00.999Z"),
    ).toBe("active");
    expect(
      isMissionLeaseActive(rec, "worker-a", "2026-11-21T18:00:00.999Z"),
    ).toBe(true);
  });

  it("keeps null expiry active and prefers wrong_holder over expired", () => {
    const openEnded = baseRecord({ leaseExpiresAtIso: null });
    expect(
      classifyMissionLeaseFence(openEnded, "worker-a", "2099-01-01T00:00:00.000Z"),
    ).toBe("active");
    expect(
      classifyMissionLeaseFence(
        baseRecord(),
        "worker-b",
        "2026-11-21T18:00:01.000Z",
      ),
    ).toBe("wrong_holder");
    expect(OLD_FENCE_HONESTY.liveTemporalWiring).toBe("NOT_WIRED");
    expect(OLD_FENCE_HONESTY.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(OLD_FENCE_HONESTY.acceptedNotVerified).toBe(true);
    expect(OLD_FENCE_HONESTY.externalEffects).toBe("NONE");
    expect([...OLD_FENCE_HONESTY.softSkipAdsCases]).toEqual([
      "T-F07",
      "T-US-013",
      "T-US-014",
    ]);
  });

  it("refuses live Temporal claims; FIXTURE_OK only", () => {
    expect(evaluateFixtureTemporalWiring("FIXTURE").code).toBe("FIXTURE_OK");
    expect(evaluateFixtureTemporalWiring("TEMPORAL").code).toBe(
      "LIVE_TEMPORAL_CLAIM_REFUSED",
    );
    expect(evaluateFixtureTemporalWiring("LOCAL_DURABLE").code).toBe(
      "LIVE_TEMPORAL_CLAIM_REFUSED",
    );
    expect(evaluateFixtureTemporalWiring("NOT_WIRED").code).toBe(
      "LIVE_TEMPORAL_CLAIM_REFUSED",
    );
    expect(formatOldFenceHonestyDetail()).toContain("acceptedNotVerified=true");
  });

  it("refuses VERIFIED acceptance label; ACCEPTED_OK only", () => {
    expect(evaluateOldFenceAcceptanceLabel("ACCEPTED").code).toBe("ACCEPTED_OK");
    expect(evaluateOldFenceAcceptanceLabel("ACCEPTED").allowed).toBe(true);
    expect(evaluateOldFenceAcceptanceLabel("VERIFIED").code).toBe(
      "VERIFIED_CLAIM_REFUSED",
    );
    expect(evaluateOldFenceAcceptanceLabel("VERIFIED").allowed).toBe(false);
    expect(evaluateOldFenceAcceptanceLabel("sandbox-verified").code).toBe(
      "VERIFIED_CLAIM_REFUSED",
    );
  });

  it("refuses non-NONE externalEffects and live provider success claims", () => {
    expect(evaluateOldFenceExternalEffects("NONE").code).toBe(
      "EXTERNAL_EFFECTS_NONE_OK",
    );
    expect(evaluateOldFenceExternalEffects("LIVE_APPLY").code).toBe(
      "EXTERNAL_EFFECTS_CLAIM_REFUSED",
    );
    expect(evaluateOldFenceLiveProviderSuccess(false).code).toBe(
      "LIVE_PROVIDER_SUCCESS_NONE_OK",
    );
    expect(evaluateOldFenceLiveProviderSuccess(true).code).toBe(
      "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED",
    );
  });

  it("keeps ChatGPT Ads ACCESS_BLOCKED and soft-skips Ads trio only", () => {
    expect(evaluateOldFenceChatgptAdsAccess("ACCESS_BLOCKED").code).toBe(
      "CHATGPT_ADS_ACCESS_BLOCKED_OK",
    );
    expect(evaluateOldFenceChatgptAdsAccess("LIVE").code).toBe(
      "CHATGPT_ADS_ACCESS_CLAIM_REFUSED",
    );
    expect(evaluateOldFenceSoftSkipAdsCase("T-F07").code).toBe("SOFT_SKIP_ADS_OK");
    expect(evaluateOldFenceSoftSkipAdsCase("T-US-013").softSkip).toBe(true);
    expect(evaluateOldFenceSoftSkipAdsCase("T-US-014").softSkip).toBe(true);
    expect(evaluateOldFenceSoftSkipAdsCase("T-X024").code).toBe(
      "NOT_SOFT_SKIP_ADS_CASE",
    );
  });

  it("allows only T-X024 related cases and refuses invent past T-X073", () => {
    expect(OLD_FENCE_CATALOG_CEILING).toBe(73);
    expect(
      evaluateOldFenceRelatedCaseIds(["T-X024"]).code,
    ).toBe("RELATED_CASES_OK");
    expect(
      evaluateOldFenceRelatedCaseIds(["T-X024", "T-X025"]).code,
    ).toBe("RELATED_CASES_CLAIM_REFUSED");
    expect(evaluateOldFenceCatalogCaseId("T-X024").code).toBe("CATALOG_CASE_OK");
    expect(evaluateOldFenceCatalogCaseId("T-X074").code).toBe(
      "CATALOG_CEILING_REFUSED",
    );
    expect(evaluateOldFenceCatalogCaseId("T-X073").code).toBe(
      "CATALOG_CASE_REFUSED",
    );
  });

  it("allows only T-X024 as assigned case id for slot O", () => {
    expect(evaluateOldFenceAssignedCaseId("T-X024").code).toBe("ASSIGNED_CASE_OK");
    expect(evaluateOldFenceAssignedCaseId("T-X025").code).toBe(
      "ASSIGNED_CASE_REFUSED",
    );
    expect(evaluateOldFenceAssignedCaseId("T-X074").code).toBe(
      "ASSIGNED_CASE_REFUSED",
    );
  });

  it("keeps Cohort-2 merge on HOLD until sequencer go-ahead", () => {
    expect(evaluateOldFenceCohort2MergeHold(false).code).toBe(
      "COHORT2_MERGE_HOLD_OK",
    );
    expect(evaluateOldFenceCohort2MergeHold(false).allowed).toBe(true);
    expect(evaluateOldFenceCohort2MergeHold(true).code).toBe(
      "COHORT2_MERGE_AUTHORIZED_REFUSED",
    );
    expect(evaluateOldFenceCohort2MergeHold(true).cohort).toBe("2");
  });

  it("locks acceptedNotVerified=true and live Temporal NOT_WIRED claim", () => {
    expect(evaluateOldFenceAcceptedNotVerified(true).code).toBe(
      "ACCEPTED_NOT_VERIFIED_OK",
    );
    expect(evaluateOldFenceAcceptedNotVerified(false).code).toBe(
      "ACCEPTED_EQUALS_VERIFIED_CLAIM_REFUSED",
    );
    expect(evaluateOldFenceLiveTemporalNotWired("NOT_WIRED").code).toBe(
      "LIVE_TEMPORAL_NOT_WIRED_OK",
    );
    expect(evaluateOldFenceLiveTemporalNotWired("TEMPORAL").code).toBe(
      "LIVE_TEMPORAL_WIRED_CLAIM_REFUSED",
    );
    expect(evaluateOldFenceLiveTemporalNotWired("FIXTURE").code).toBe(
      "LIVE_TEMPORAL_WIRED_CLAIM_REFUSED",
    );
  });
});

describe("memory mission workflow store lease fence", () => {
  it("allows self-renew, refuses steal, fences old holder after reassignment", async () => {
    const store = createMemoryMissionWorkflowStore();
    const workflowId = "wf-fence-unit";
    await store.enqueue({
      workflowId,
      jobId: "job-fence-unit",
      temporalWiring: "FIXTURE",
      nowIso: "2026-11-21T18:00:00.000Z",
    });

    const leasedA = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(leasedA?.leaseHolder).toBe("worker-a");
    expect(leasedA?.attemptCount).toBe(1);

    const steal = await store.claimLease({
      workflowId,
      holder: "worker-b",
      leaseExpiresAtIso: "2026-11-21T18:00:10.000Z",
      nowIso: "2026-11-21T18:00:00.100Z",
    });
    expect(steal).toBeNull();

    const renewed = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
      nowIso: "2026-11-21T18:00:00.500Z",
    });
    expect(renewed?.attemptCount).toBe(2);
    expect(
      classifyMissionLeaseFence(
        renewed!,
        "worker-a",
        "2026-11-21T18:00:00.500Z",
      ),
    ).toBe("active");

    await expect(
      store.bindOperationWhileLeased({
        workflowId,
        operationId: "op-expired",
        holder: "worker-a",
        nowIso: "2026-11-21T18:00:01.000Z",
        payloadDigest: "d",
        businessIdempotencyKey: "k",
      }),
    ).rejects.toThrow(/Lease fence failed.*fenceCause=expired/);

    const leasedB = await store.claimLease({
      workflowId,
      holder: "worker-b",
      leaseExpiresAtIso: "2026-11-21T18:00:10.000Z",
      nowIso: "2026-11-21T18:00:01.000Z",
    });
    expect(leasedB?.leaseHolder).toBe("worker-b");
    expect(leasedB?.attemptCount).toBe(3);
    expect(
      classifyMissionLeaseFence(
        leasedB!,
        "worker-a",
        "2026-11-21T18:00:02.000Z",
      ),
    ).toBe("wrong_holder");

    const reclaimA = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:20.000Z",
      nowIso: "2026-11-21T18:00:02.000Z",
    });
    expect(reclaimA).toBeNull();

    await expect(
      store.bindOperationWhileLeased({
        workflowId,
        operationId: "op-stale",
        holder: "worker-a",
        nowIso: "2026-11-21T18:00:02.000Z",
        payloadDigest: "d-stale",
        businessIdempotencyKey: "k-stale",
      }),
    ).rejects.toThrow(/Lease fence failed.*fenceCause=wrong_holder/);

    const bound = await store.bindOperationWhileLeased({
      workflowId,
      operationId: "op-b",
      holder: "worker-b",
      nowIso: "2026-11-21T18:00:02.000Z",
      payloadDigest: "d-b",
      businessIdempotencyKey: "k-b",
    });
    expect(bound.operationId).toBe("op-b");

    const pending = await store.markEffectPending({
      workflowId,
      operationId: "op-b",
      holder: "worker-b",
      nowIso: "2026-11-21T18:00:02.000Z",
    });
    expect(pending.phase).toBe("effect_pending");
  });

  it("allows original holder reclaim after own expiry before foreign reassignment", async () => {
    const store = createMemoryMissionWorkflowStore();
    const workflowId = "wf-reclaim-self";
    await store.enqueue({
      workflowId,
      jobId: "job-reclaim-self",
      temporalWiring: "FIXTURE",
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    const reclaimed = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:10.000Z",
      nowIso: "2026-11-21T18:00:01.000Z",
    });
    expect(reclaimed?.leaseHolder).toBe("worker-a");
    expect(reclaimed?.attemptCount).toBe(2);
    expect(
      classifyMissionLeaseFence(
        reclaimed!,
        "worker-a",
        "2026-11-21T18:00:02.000Z",
      ),
    ).toBe("active");
  });

  it("clears lease on fail → no_holder and refuses claimLease", async () => {
    const store = createMemoryMissionWorkflowStore();
    const workflowId = "wf-fail-clear";
    await store.enqueue({
      workflowId,
      jobId: "job-fail-clear",
      temporalWiring: "FIXTURE",
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    const failed = await store.fail({
      workflowId,
      retryCategory: "none",
      lastError: "fixture-fail",
      nowIso: "2026-11-21T18:00:02.000Z",
    });
    expect(failed.phase).toBe("failed");
    expect(failed.leaseHolder).toBeNull();
    expect(
      classifyMissionLeaseFence(
        failed,
        "worker-a",
        "2026-11-21T18:00:02.000Z",
      ),
    ).toBe("no_holder");
    expect(
      await store.claimLease({
        workflowId,
        holder: "worker-b",
        leaseExpiresAtIso: "2026-11-21T18:00:30.000Z",
        nowIso: "2026-11-21T18:00:02.000Z",
      }),
    ).toBeNull();
  });
});
