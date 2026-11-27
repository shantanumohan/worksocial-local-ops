import { describe, expect, it } from "vitest";
import {
  APPROVAL_WAIT_MANIFEST_SCHEMA,
  ApprovalWaitManifestIntegrity,
  ApprovalWaitPhase,
  ApprovalWaitSlotLease,
  evaluateApprovalWaitAcrossRestarts,
  evaluateApprovalWaitCorruptManifest,
  evaluateApprovalWaitJobContinuity,
  evaluateApprovalWaitSurvivesRestart,
  inspectApprovalWaitDurableManifest,
} from "./approval-wait-survives-restart.js";

const baseSnapshot = {
  operationId: "op-approval-1",
  jobId: "job-approval-1",
  phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
  phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
  holdsWorkerSlot: false,
  slotLease: ApprovalWaitSlotLease.RELEASED,
  applyAttemptCountBeforeRestart: 1,
  applyAttemptCountAfterRestart: 1,
  restartCount: 1,
  waitIdentityKeyBeforeRestart: "biz-wait-1",
  waitIdentityKeyAfterRestart: "biz-wait-1",
  manifestIntegrity: ApprovalWaitManifestIntegrity.OK,
  fixtureOnly: true as const,
};

const okManifestRaw = JSON.stringify({
  schema: APPROVAL_WAIT_MANIFEST_SCHEMA,
  operationId: "op-approval-1",
  jobId: "job-approval-1",
  phase: ApprovalWaitPhase.WAITING_APPROVAL,
  waitIdentityKey: "biz-wait-1",
  applyAttemptCount: 1,
  slotLease: ApprovalWaitSlotLease.RELEASED,
  checksum: "abc123",
});

describe("approval wait survives restart (T-X014)", () => {
  it("allows resume wait with released slot lease, stable apply count, and wait identity", () => {
    const d = evaluateApprovalWaitSurvivesRestart({ snapshot: baseSnapshot });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("RESUME_WAIT_NO_SLOT");
    expect(d.resumeWait).toBe(true);
    expect(d.holdsWorkerSlot).toBe(false);
    expect(d.slotLease).toBe("released");
    expect(d.restartCount).toBe(1);
    expect(d.temporalWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");
    expect(d.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("survives multiple restarts with continuous wait identity", () => {
    const d = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-multi",
      jobId: "job-multi",
      waitIdentityKey: "biz-multi",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
      ],
      applyAttemptCounts: [1, 1, 1],
      slotLeaseAfterEachRestart: [
        ApprovalWaitSlotLease.RELEASED,
        ApprovalWaitSlotLease.RELEASED,
      ],
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("RESUME_WAIT_NO_SLOT");
    expect(d.restartCount).toBe(2);
    expect(d.slotLease).toBe("released");
  });

  it("refuses wait identity mismatch and expire-on-restart-alone", () => {
    const mismatch = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        waitIdentityKeyAfterRestart: "biz-other",
      },
    });
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.code).toBe("WAIT_IDENTITY_MISMATCH");

    const expire = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      expireWaitOnRestartAlone: true,
    });
    expect(expire.allowed).toBe(false);
    expect(expire.code).toBe("EXPIRE_WAIT_ON_RESTART_REFUSED");
  });

  it("refuses non-integer apply counts and applyAttemptCount growth", () => {
    const nonInt = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        applyAttemptCountBeforeRestart: 1.5,
        applyAttemptCountAfterRestart: 1.5,
      },
    });
    expect(nonInt.allowed).toBe(false);
    expect(nonInt.code).toBe("INVALID_SNAPSHOT");

    const grew = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        applyAttemptCountBeforeRestart: 1,
        applyAttemptCountAfterRestart: 2,
      },
    });
    expect(grew.allowed).toBe(false);
    expect(grew.code).toBe("APPLY_COUNT_GREW_ON_RESTART");
  });

  it("refuses slot hold / lease reacquire while waiting", () => {
    const d = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        holdsWorkerSlot: true,
        slotLease: ApprovalWaitSlotLease.HELD,
      },
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("SLOT_HOLD_WHILE_WAITING_REFUSED");

    const reacquire = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      reacquireSlotLeaseWhileWaiting: true,
    });
    expect(reacquire.allowed).toBe(false);
    expect(reacquire.code).toBe("SLOT_LEASE_REACQUIRE_REFUSED");
  });

  it("refuses auto-verify and promote-without-independent-verify", () => {
    const d = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        phaseAfterRestart: ApprovalWaitPhase.AUTO_VERIFIED,
      },
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("AUTO_VERIFY_ON_RESTART_REFUSED");

    const promote = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      promoteWithoutIndependentVerify: true,
    });
    expect(promote.allowed).toBe(false);
    expect(promote.code).toBe("PROMOTE_WITHOUT_INDEPENDENT_VERIFY_REFUSED");
  });

  it("requires same jobId, wait identity, and WAITING_APPROVAL before/after", () => {
    const ok = evaluateApprovalWaitJobContinuity({
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1",
      jobCreatedAfterRestart: false,
      phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      holdsWorkerSlot: false,
      slotLease: ApprovalWaitSlotLease.RELEASED,
      waitIdentityKeyBeforeRestart: "biz-1",
      waitIdentityKeyAfterRestart: "biz-1",
    });
    expect(ok.allowed).toBe(true);
    expect(ok.code).toBe("RESUME_WAIT_NO_SLOT");

    const inventedWait = evaluateApprovalWaitJobContinuity({
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1",
      jobCreatedAfterRestart: false,
      phaseBeforeRestart: ApprovalWaitPhase.APPROVED,
      phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      holdsWorkerSlot: false,
      waitIdentityKeyBeforeRestart: "biz-1",
      waitIdentityKeyAfterRestart: "biz-1",
    });
    expect(inventedWait.allowed).toBe(false);
    expect(inventedWait.code).toBe("PHASE_NOT_WAITING");
  });

  it("inspects durable wait-manifest integrity (OK / truncated / corrupt JSON / checksum)", () => {
    const ok = inspectApprovalWaitDurableManifest({
      raw: okManifestRaw,
      expectedChecksum: "abc123",
    });
    expect(ok.integrity).toBe(ApprovalWaitManifestIntegrity.OK);
    expect(ok.parsed?.operationId).toBe("op-approval-1");

    const truncated = inspectApprovalWaitDurableManifest({
      raw: '{"schema":"approval-wait-v1","operationId":"op-',
    });
    expect(truncated.integrity).toBe(ApprovalWaitManifestIntegrity.TRUNCATED);

    const badJson = inspectApprovalWaitDurableManifest({
      raw: '{"schema":"approval-wait-v1","operationId":1,}',
    });
    expect(badJson.integrity).toBe(ApprovalWaitManifestIntegrity.CORRUPT_JSON);

    const checksum = inspectApprovalWaitDurableManifest({
      raw: okManifestRaw,
      expectedChecksum: "other",
    });
    expect(checksum.integrity).toBe(
      ApprovalWaitManifestIntegrity.CHECKSUM_MISMATCH,
    );

    const wrongSchema = inspectApprovalWaitDurableManifest({
      raw: JSON.stringify({
        schema: "approval-wait-v0",
        operationId: "op-1",
        jobId: "job-1",
        phase: ApprovalWaitPhase.WAITING_APPROVAL,
        waitIdentityKey: "biz",
        applyAttemptCount: 1,
        slotLease: ApprovalWaitSlotLease.RELEASED,
      }),
    });
    expect(wrongSchema.integrity).toBe(
      ApprovalWaitManifestIntegrity.WRONG_SCHEMA,
    );
  });

  it("refuses resume / invent from corrupt wait-manifest", () => {
    const corruptSnap = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        manifestIntegrity: ApprovalWaitManifestIntegrity.CORRUPT_JSON,
      },
    });
    expect(corruptSnap.allowed).toBe(false);
    expect(corruptSnap.code).toBe("CORRUPT_WAIT_MANIFEST");
    expect(corruptSnap.resumeWait).toBe(false);

    const invent = evaluateApprovalWaitCorruptManifest({
      rawManifest: '{"schema":"approval-wait-v1","operationId":"op-',
      inventWaitingApprovalFromCorrupt: true,
      inventApplyCountFromCorrupt: 1,
      forceSlotHoldFromCorrupt: true,
      autoVerifyFromCorrupt: true,
    });
    expect(invent.allowed).toBe(false);
    expect(invent.code).toBe("CORRUPT_WAIT_MANIFEST");
    expect(invent.resumeWait).toBe(false);

    const okPath = evaluateApprovalWaitCorruptManifest({
      rawManifest: okManifestRaw,
      expectedChecksum: "abc123",
    });
    expect(okPath.allowed).toBe(true);
    expect(okPath.code).toBe("RESUME_WAIT_NO_SLOT");
  });

  it("refuses missing wait-manifest, apply-count decrease, wall-clock expire, invent-approved (T-X014)", () => {
    const missing = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        manifestIntegrity: ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS,
      },
    });
    expect(missing.allowed).toBe(false);
    expect(missing.code).toBe("MISSING_WAIT_MANIFEST");

    const missingRaw = evaluateApprovalWaitCorruptManifest({
      rawManifest: null,
      inventWaitingApprovalFromCorrupt: true,
    });
    expect(missingRaw.allowed).toBe(false);
    expect(missingRaw.code).toBe("MISSING_WAIT_MANIFEST");

    const decreased = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        applyAttemptCountBeforeRestart: 2,
        applyAttemptCountAfterRestart: 1,
      },
    });
    expect(decreased.allowed).toBe(false);
    expect(decreased.code).toBe("APPLY_COUNT_DECREASED_ON_RESTART");

    const wall = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      wallClockAdvanceAlone: true,
    });
    expect(wall.allowed).toBe(false);
    expect(wall.code).toBe("WALL_CLOCK_EXPIRE_REFUSED");

    const inventApproved = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      inventApprovedOnRestart: true,
    });
    expect(inventApproved.allowed).toBe(false);
    expect(inventApproved.code).toBe("INVENT_APPROVED_ON_RESTART_REFUSED");

    const whitespaceWait = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        waitIdentityKeyBeforeRestart: "   ",
        waitIdentityKeyAfterRestart: "   ",
      },
    });
    expect(whitespaceWait.allowed).toBe(false);
    expect(whitespaceWait.code).toBe("INVALID_SNAPSHOT");
  });

  it("refuses invent-rejected / cancel-on-restart / non-integer restartCount (T-X014 J14)", () => {
    const inventRejected = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      inventRejectedOnRestart: true,
    });
    expect(inventRejected.allowed).toBe(false);
    expect(inventRejected.code).toBe("INVENT_REJECTED_ON_RESTART_REFUSED");

    const rejectedPhase = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        phaseAfterRestart: ApprovalWaitPhase.REJECTED,
      },
    });
    expect(rejectedPhase.allowed).toBe(false);
    expect(rejectedPhase.code).toBe("INVENT_REJECTED_ON_RESTART_REFUSED");

    const cancelAlone = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      cancelWaitOnRestartAlone: true,
    });
    expect(cancelAlone.allowed).toBe(false);
    expect(cancelAlone.code).toBe("CANCEL_WAIT_ON_RESTART_REFUSED");

    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, -1.2]) {
      const badRestart = evaluateApprovalWaitSurvivesRestart({
        snapshot: { ...baseSnapshot, restartCount: bad },
      });
      expect(badRestart.allowed).toBe(false);
      expect(badRestart.code).toBe("INVALID_SNAPSHOT");
    }
  });

  it("refuses UTF-8 BOM manifest, duplicate job invent, and zero restartCount (T-X014 J20)", () => {
    const bomRaw = `\uFEFF${okManifestRaw}`;
    const bom = inspectApprovalWaitDurableManifest({ raw: bomRaw });
    expect(bom.integrity).toBe(ApprovalWaitManifestIntegrity.CORRUPT_JSON);
    expect(bom.reasons.some((r) => r.includes("BOM"))).toBe(true);

    const bomInvent = evaluateApprovalWaitCorruptManifest({
      rawManifest: bomRaw,
      inventWaitingApprovalFromCorrupt: true,
    });
    expect(bomInvent.allowed).toBe(false);
    expect(bomInvent.code).toBe("CORRUPT_WAIT_MANIFEST");

    const dupJob = evaluateApprovalWaitJobContinuity({
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1-clone",
      jobCreatedAfterRestart: true,
      phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      holdsWorkerSlot: false,
      waitIdentityKeyBeforeRestart: "biz-1",
      waitIdentityKeyAfterRestart: "biz-1",
    });
    expect(dupJob.allowed).toBe(false);
    expect(dupJob.code).toBe("JOB_CONTINUITY_MISMATCH");

    const zeroRestart = evaluateApprovalWaitSurvivesRestart({
      snapshot: { ...baseSnapshot, restartCount: 0 },
    });
    expect(zeroRestart.allowed).toBe(false);
    expect(zeroRestart.code).toBe("INVALID_SNAPSHOT");
  });

  it("refuses invisible-only wait identity keys (T-X014 J24)", () => {
    const zwsp = "\u200b\u200b";
    const invisibleSnap = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        waitIdentityKeyBeforeRestart: zwsp,
        waitIdentityKeyAfterRestart: zwsp,
      },
    });
    expect(invisibleSnap.allowed).toBe(false);
    expect(invisibleSnap.code).toBe("INVALID_SNAPSHOT");

    const manifestRaw = JSON.stringify({
      schema: APPROVAL_WAIT_MANIFEST_SCHEMA,
      operationId: "op-1",
      jobId: "job-1",
      phase: ApprovalWaitPhase.WAITING_APPROVAL,
      waitIdentityKey: "\u00ad",
      applyAttemptCount: 1,
      slotLease: ApprovalWaitSlotLease.RELEASED,
    });
    const inspected = inspectApprovalWaitDurableManifest({ raw: manifestRaw });
    expect(inspected.integrity).toBe(
      ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS,
    );

    const jobInvisible = evaluateApprovalWaitJobContinuity({
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1",
      jobCreatedAfterRestart: false,
      phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      holdsWorkerSlot: false,
      waitIdentityKeyBeforeRestart: zwsp,
      waitIdentityKeyAfterRestart: zwsp,
    });
    expect(jobInvisible.code).toBe("INVALID_SNAPSHOT");
  });

  it("refuses WRONG_SCHEMA snapshot, job REJECTED continuity, chain length mismatch (T-X014 J37)", () => {
    const wrongSchemaSnap = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        manifestIntegrity: ApprovalWaitManifestIntegrity.WRONG_SCHEMA,
      },
    });
    expect(wrongSchemaSnap.allowed).toBe(false);
    expect(wrongSchemaSnap.code).toBe("CORRUPT_WAIT_MANIFEST");

    const jobRejected = evaluateApprovalWaitJobContinuity({
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1",
      jobCreatedAfterRestart: false,
      phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      phaseAfterRestart: ApprovalWaitPhase.REJECTED,
      holdsWorkerSlot: false,
      waitIdentityKeyBeforeRestart: "biz-1",
      waitIdentityKeyAfterRestart: "biz-1",
    });
    expect(jobRejected.code).toBe("PHASE_NOT_WAITING");

    const lengthMismatch = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-mm",
      jobId: "job-mm",
      waitIdentityKey: "biz-mm",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
      ],
      applyAttemptCounts: [1],
      slotLeaseAfterEachRestart: [ApprovalWaitSlotLease.RELEASED],
    });
    expect(lengthMismatch.allowed).toBe(false);
    expect(lengthMismatch.code).toBe("INVALID_SNAPSHOT");
  });

  it("refuses truncated manifest snapshot and invalid multi-restart chain (T-X014 J34)", () => {
    const truncated = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        manifestIntegrity: ApprovalWaitManifestIntegrity.TRUNCATED,
      },
    });
    expect(truncated.allowed).toBe(false);
    expect(truncated.code).toBe("CORRUPT_WAIT_MANIFEST");

    const badChain = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-bad",
      jobId: "job-bad",
      waitIdentityKey: "biz-bad",
      phases: [ApprovalWaitPhase.WAITING_APPROVAL],
      applyAttemptCounts: [1],
      slotLeaseAfterEachRestart: [],
    });
    expect(badChain.allowed).toBe(false);
    expect(badChain.code).toBe("INVALID_SNAPSHOT");

    const jobBadPhase = evaluateApprovalWaitJobContinuity({
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1",
      jobCreatedAfterRestart: false,
      phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      phaseAfterRestart: ApprovalWaitPhase.APPROVED,
      holdsWorkerSlot: false,
      waitIdentityKeyBeforeRestart: "biz-1",
      waitIdentityKeyAfterRestart: "biz-1",
    });
    expect(jobBadPhase.code).toBe("PHASE_NOT_WAITING");
  });

  it("refuses multi-restart REJECTED hop and WRONG_SCHEMA manifest invent (T-X014 J33)", () => {
    const rejectedHop = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-rej",
      jobId: "job-rej",
      waitIdentityKey: "biz-rej",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.REJECTED,
      ],
      applyAttemptCounts: [1, 1, 1],
      slotLeaseAfterEachRestart: [
        ApprovalWaitSlotLease.RELEASED,
        ApprovalWaitSlotLease.RELEASED,
      ],
    });
    expect(rejectedHop.allowed).toBe(false);
    expect(rejectedHop.code).toBe("INVENT_REJECTED_ON_RESTART_REFUSED");

    const wrongSchema = evaluateApprovalWaitCorruptManifest({
      rawManifest: JSON.stringify({
        schema: "approval-wait-v0",
        operationId: "op-1",
        jobId: "job-1",
        phase: ApprovalWaitPhase.WAITING_APPROVAL,
        waitIdentityKey: "biz-1",
        applyAttemptCount: 1,
        slotLease: ApprovalWaitSlotLease.RELEASED,
      }),
      inventWaitingApprovalFromCorrupt: true,
    });
    expect(wrongSchema.allowed).toBe(false);
    expect(wrongSchema.code).toBe("CORRUPT_WAIT_MANIFEST");
  });

  it("refuses multi-restart non-waiting phase and checksum mismatch snapshot (T-X014 J32)", () => {
    const approvedHop = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-phase",
      jobId: "job-phase",
      waitIdentityKey: "biz-phase",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.APPROVED,
      ],
      applyAttemptCounts: [1, 1, 1],
      slotLeaseAfterEachRestart: [
        ApprovalWaitSlotLease.RELEASED,
        ApprovalWaitSlotLease.RELEASED,
      ],
    });
    expect(approvedHop.allowed).toBe(false);
    expect(approvedHop.code).toBe("AUTO_VERIFY_ON_RESTART_REFUSED");

    const checksumSnap = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        manifestIntegrity: ApprovalWaitManifestIntegrity.CHECKSUM_MISMATCH,
      },
    });
    expect(checksumSnap.allowed).toBe(false);
    expect(checksumSnap.code).toBe("CORRUPT_WAIT_MANIFEST");
  });

  it("refuses multi-restart apply-count decrease across hops (T-X014 J31)", () => {
    const decreased = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-dec",
      jobId: "job-dec",
      waitIdentityKey: "biz-dec",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
      ],
      applyAttemptCounts: [2, 1, 1],
      slotLeaseAfterEachRestart: [
        ApprovalWaitSlotLease.RELEASED,
        ApprovalWaitSlotLease.RELEASED,
      ],
    });
    expect(decreased.allowed).toBe(false);
    expect(decreased.code).toBe("APPLY_COUNT_DECREASED_ON_RESTART");
  });

  it("refuses multi-restart apply-count growth across hops (T-X014 J30)", () => {
    const grew = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-grow",
      jobId: "job-grow",
      waitIdentityKey: "biz-grow",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
      ],
      applyAttemptCounts: [1, 2, 2],
      slotLeaseAfterEachRestart: [
        ApprovalWaitSlotLease.RELEASED,
        ApprovalWaitSlotLease.RELEASED,
      ],
    });
    expect(grew.allowed).toBe(false);
    expect(grew.code).toBe("APPLY_COUNT_GREW_ON_RESTART");
  });

  it("refuses multi-restart chain with held slot lease (T-X014 J29)", () => {
    const multi = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-multi-slot",
      jobId: "job-multi-slot",
      waitIdentityKey: "biz-slot",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
      ],
      applyAttemptCounts: [1, 1, 1],
      slotLeaseAfterEachRestart: [
        ApprovalWaitSlotLease.HELD,
        ApprovalWaitSlotLease.RELEASED,
      ],
    });
    expect(multi.allowed).toBe(false);
    expect(multi.code).toBe("SLOT_HOLD_WHILE_WAITING_REFUSED");

    const liveMulti = evaluateApprovalWaitAcrossRestarts({
      operationId: "op-live-multi",
      jobId: "job-live-multi",
      waitIdentityKey: "biz-live",
      phases: [
        ApprovalWaitPhase.WAITING_APPROVAL,
        ApprovalWaitPhase.WAITING_APPROVAL,
      ],
      applyAttemptCounts: [1, 1],
      slotLeaseAfterEachRestart: [ApprovalWaitSlotLease.RELEASED],
      claimLiveVerified: true,
    });
    expect(liveMulti.allowed).toBe(false);
    expect(liveMulti.code).toBe("LIVE_TEMPORAL_CLAIM_REFUSED");
  });

  it("refuses requestTemporalWire and job-continuity slot/live claims (T-X014 J28)", () => {
    const temporal = evaluateApprovalWaitSurvivesRestart({
      snapshot: baseSnapshot,
      requestTemporalWire: true,
    });
    expect(temporal.allowed).toBe(false);
    expect(temporal.code).toBe("LIVE_TEMPORAL_CLAIM_REFUSED");

    const jobBase = {
      operationId: "op-1",
      jobIdBeforeRestart: "job-1",
      jobIdAfterRestart: "job-1",
      jobCreatedAfterRestart: false,
      phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
      waitIdentityKeyBeforeRestart: "biz-1",
      waitIdentityKeyAfterRestart: "biz-1",
    };
    const slotHold = evaluateApprovalWaitJobContinuity({
      ...jobBase,
      holdsWorkerSlot: true,
      slotLease: ApprovalWaitSlotLease.HELD,
    });
    expect(slotHold.code).toBe("SLOT_HOLD_WHILE_WAITING_REFUSED");

    const liveJob = evaluateApprovalWaitJobContinuity({
      ...jobBase,
      holdsWorkerSlot: false,
      slotLease: ApprovalWaitSlotLease.RELEASED,
      claimLiveVerified: true,
    });
    expect(liveJob.code).toBe("LIVE_TEMPORAL_CLAIM_REFUSED");
  });

  it("refuses invent flags on intact waiting manifest (T-X014 J27)", () => {
    const inventCount = evaluateApprovalWaitCorruptManifest({
      rawManifest: okManifestRaw,
      expectedChecksum: "abc123",
      inventApplyCountFromCorrupt: 99,
    });
    expect(inventCount.allowed).toBe(false);
    expect(inventCount.code).toBe("CORRUPT_WAIT_MANIFEST");

    const forceSlot = evaluateApprovalWaitCorruptManifest({
      rawManifest: okManifestRaw,
      expectedChecksum: "abc123",
      forceSlotHoldFromCorrupt: true,
    });
    expect(forceSlot.allowed).toBe(false);
    expect(forceSlot.code).toBe("CORRUPT_WAIT_MANIFEST");
    expect(forceSlot.holdsWorkerSlot).toBe(true);
  });

  it("refuses invent wait from non-waiting durable manifest phase (T-X014 J26)", () => {
    const approvedManifest = JSON.stringify({
      schema: APPROVAL_WAIT_MANIFEST_SCHEMA,
      operationId: "op-1",
      jobId: "job-1",
      phase: ApprovalWaitPhase.APPROVED,
      waitIdentityKey: "biz-1",
      applyAttemptCount: 1,
      slotLease: ApprovalWaitSlotLease.RELEASED,
    });
    const invent = evaluateApprovalWaitCorruptManifest({
      rawManifest: approvedManifest,
      inventWaitingApprovalFromCorrupt: true,
    });
    expect(invent.allowed).toBe(false);
    expect(invent.code).toBe("CORRUPT_WAIT_MANIFEST");
    expect(invent.resumeWait).toBe(false);

    const live = evaluateApprovalWaitCorruptManifest({
      rawManifest: approvedManifest,
      claimLiveVerified: true,
    });
    expect(live.code).toBe("LIVE_TEMPORAL_CLAIM_REFUSED");
  });

  it("refuses invisible-only operationId/jobId on restart snapshot (T-X014 J25)", () => {
    const d = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        ...baseSnapshot,
        operationId: "\u200b",
        jobId: "\u00ad",
      },
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("INVALID_SNAPSHOT");
    expect(d.reasons.join(" ")).toMatch(/visible characters/);
  });
});
