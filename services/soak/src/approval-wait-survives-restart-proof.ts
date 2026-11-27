/**
 * Domain honesty helpers for T-X014 — approval wait survives restart
 * (resume wait; no slot hold). Evaluates observed before/after restart state
 * from the durable harness — not hard-coded expected fixtures.
 * Supports multi-restart survival, slot lease release, wait-identity continuity,
 * and corrupt durable wait-manifest refusal.
 * External effects: NONE. Temporal NOT_WIRED.
 */

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
  type ApprovalWaitManifestIntegrityValue,
  type ApprovalWaitPhaseValue,
  type ApprovalWaitSlotLeaseValue,
} from "@worksocial/domain";

export type ApprovalWaitDomainProofResult = {
  passed: boolean;
  details: string[];
};

export type ObservedApprovalWaitRestart = {
  operationId: string;
  jobId: string;
  phaseBeforeRestart: ApprovalWaitPhaseValue;
  phaseAfterRestart: ApprovalWaitPhaseValue;
  holdsWorkerSlot: boolean;
  slotLease: ApprovalWaitSlotLeaseValue;
  applyAttemptCountBeforeRestart: number;
  applyAttemptCountAfterRestart: number;
  restartCount: number;
  waitIdentityKeyBeforeRestart: string;
  waitIdentityKeyAfterRestart: string;
  /** Observed durable wait-manifest integrity after restart (default OK). */
  manifestIntegrity?: ApprovalWaitManifestIntegrityValue;
  /** Optional second-hop observation for multi-restart deepen. */
  phaseAfterSecondRestart?: ApprovalWaitPhaseValue;
  applyAttemptCountAfterSecondRestart?: number;
  slotLeaseAfterSecondRestart?: ApprovalWaitSlotLeaseValue;
};

export type ObservedApprovalWaitJobContinuity = {
  operationId: string;
  jobIdBeforeRestart: string;
  jobIdAfterRestart: string;
  jobCreatedAfterRestart: boolean;
  phaseBeforeRestart: ApprovalWaitPhaseValue;
  phaseAfterRestart: ApprovalWaitPhaseValue;
  holdsWorkerSlot: boolean;
  slotLease: ApprovalWaitSlotLeaseValue;
  waitIdentityKeyBeforeRestart: string;
  waitIdentityKeyAfterRestart: string;
};

/**
 * Evaluate the actual rehydrated crash-restart observation (+ optional 2nd hop).
 */
export function proofApprovalWaitFromObservedRestart(
  observed: ObservedApprovalWaitRestart,
): ApprovalWaitDomainProofResult {
  const details: string[] = [];
  let passed = true;

  const resume = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  if (
    resume.allowed &&
    resume.code === "RESUME_WAIT_NO_SLOT" &&
    resume.resumeWait &&
    !resume.holdsWorkerSlot &&
    resume.slotLease === ApprovalWaitSlotLease.RELEASED &&
    resume.temporalWiring === "NOT_WIRED" &&
    resume.externalEffects === "NONE"
  ) {
    details.push(
      `Observed restart×${observed.restartCount}: WAITING_APPROVAL rehydrates (applyCount ${observed.applyAttemptCountBeforeRestart}→${observed.applyAttemptCountAfterRestart}; waitIdentity continued) — resume wait; slotLease=released`,
    );
  } else {
    passed = false;
    details.push(`Observed restart unexpectedly ${JSON.stringify(resume)}`);
  }

  if (
    observed.phaseAfterSecondRestart !== undefined &&
    observed.applyAttemptCountAfterSecondRestart !== undefined &&
    observed.slotLeaseAfterSecondRestart !== undefined
  ) {
    const multi = evaluateApprovalWaitAcrossRestarts({
      operationId: observed.operationId,
      jobId: observed.jobId,
      waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
      phases: [
        observed.phaseBeforeRestart,
        observed.phaseAfterRestart,
        observed.phaseAfterSecondRestart,
      ],
      applyAttemptCounts: [
        observed.applyAttemptCountBeforeRestart,
        observed.applyAttemptCountAfterRestart,
        observed.applyAttemptCountAfterSecondRestart,
      ],
      slotLeaseAfterEachRestart: [
        observed.slotLease,
        observed.slotLeaseAfterSecondRestart,
      ],
    });
    if (multi.allowed && multi.restartCount === 2) {
      details.push(
        "Observed multi-restart×2: still WAITING_APPROVAL; slot lease released; wait identity + applyCount stable",
      );
    } else {
      passed = false;
      details.push(`Observed multi-restart unexpectedly ${JSON.stringify(multi)}`);
    }
  }

  const identityRefuse = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      waitIdentityKeyAfterRestart: `${observed.waitIdentityKeyBeforeRestart}-mutated`,
      fixtureOnly: true,
    },
  });
  if (identityRefuse.code === "WAIT_IDENTITY_MISMATCH") {
    details.push("Domain: wait identity mismatch → WAIT_IDENTITY_MISMATCH");
  } else {
    passed = false;
    details.push(`Domain identity refuse unexpectedly ${identityRefuse.code}`);
  }

  const expire = evaluateApprovalWaitSurvivesRestart({
    snapshot: { ...observed, fixtureOnly: true },
    expireWaitOnRestartAlone: true,
  });
  if (expire.code === "EXPIRE_WAIT_ON_RESTART_REFUSED") {
    details.push("Domain: expireWaitOnRestartAlone → EXPIRE_WAIT_ON_RESTART_REFUSED");
  } else {
    passed = false;
    details.push(`Domain expire refuse unexpectedly ${expire.code}`);
  }

  const slotRefuse = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      holdsWorkerSlot: true,
      slotLease: ApprovalWaitSlotLease.HELD,
      fixtureOnly: true,
    },
  });
  if (slotRefuse.code === "SLOT_HOLD_WHILE_WAITING_REFUSED") {
    details.push("Domain: slot hold while waiting → SLOT_HOLD_WHILE_WAITING_REFUSED");
  } else {
    passed = false;
    details.push(`Domain slot refuse unexpectedly ${slotRefuse.code}`);
  }

  const reacquire = evaluateApprovalWaitSurvivesRestart({
    snapshot: { ...observed, fixtureOnly: true },
    reacquireSlotLeaseWhileWaiting: true,
  });
  if (reacquire.code === "SLOT_LEASE_REACQUIRE_REFUSED") {
    details.push("Domain: slot lease reacquire → SLOT_LEASE_REACQUIRE_REFUSED");
  } else {
    passed = false;
    details.push(`Domain reacquire refuse unexpectedly ${reacquire.code}`);
  }

  const grew = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      applyAttemptCountAfterRestart:
        observed.applyAttemptCountBeforeRestart + 1,
      fixtureOnly: true,
    },
  });
  if (grew.code === "APPLY_COUNT_GREW_ON_RESTART") {
    details.push("Domain: apply count growth on restart → APPLY_COUNT_GREW_ON_RESTART");
  } else {
    passed = false;
    details.push(`Domain apply-growth refuse unexpectedly ${grew.code}`);
  }

  const autoVerify = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      phaseAfterRestart: ApprovalWaitPhase.AUTO_VERIFIED,
      fixtureOnly: true,
    },
  });
  if (autoVerify.code === "AUTO_VERIFY_ON_RESTART_REFUSED") {
    details.push("Domain: auto-verify on restart → AUTO_VERIFY_ON_RESTART_REFUSED");
  } else {
    passed = false;
    details.push(`Domain auto-verify unexpectedly ${autoVerify.code}`);
  }

  const promote = evaluateApprovalWaitSurvivesRestart({
    snapshot: { ...observed, fixtureOnly: true },
    promoteWithoutIndependentVerify: true,
  });
  if (promote.code === "PROMOTE_WITHOUT_INDEPENDENT_VERIFY_REFUSED") {
    details.push(
      "Domain: promoteWithoutIndependentVerify → PROMOTE_WITHOUT_INDEPENDENT_VERIFY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Domain promote refuse unexpectedly ${promote.code}`);
  }

  const live = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
    claimLiveVerified: true,
  });
  if (live.code === "LIVE_TEMPORAL_CLAIM_REFUSED") {
    details.push("Domain: claimLiveVerified → LIVE_TEMPORAL_CLAIM_REFUSED");
  } else {
    passed = false;
    details.push(`Domain live refuse unexpectedly ${live.code}`);
  }

  const temporalWire = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
    requestTemporalWire: true,
  });
  if (temporalWire.code === "LIVE_TEMPORAL_CLAIM_REFUSED") {
    details.push("Domain: requestTemporalWire → LIVE_TEMPORAL_CLAIM_REFUSED");
  } else {
    passed = false;
    details.push(`Domain temporal wire unexpectedly ${temporalWire.code}`);
  }

  // Corrupt durable wait-manifest: refuse invent resume / applyCount / slot / auto-verify.
  const approvedPhaseRaw = JSON.stringify({
    schema: APPROVAL_WAIT_MANIFEST_SCHEMA,
    operationId: observed.operationId,
    jobId: observed.jobId,
    phase: ApprovalWaitPhase.APPROVED,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    applyAttemptCount: observed.applyAttemptCountBeforeRestart,
    slotLease: ApprovalWaitSlotLease.RELEASED,
  });
  const inventOnIntact = evaluateApprovalWaitCorruptManifest({
    rawManifest: JSON.stringify({
      schema: APPROVAL_WAIT_MANIFEST_SCHEMA,
      operationId: observed.operationId,
      jobId: observed.jobId,
      phase: ApprovalWaitPhase.WAITING_APPROVAL,
      waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
      applyAttemptCount: observed.applyAttemptCountBeforeRestart,
      slotLease: ApprovalWaitSlotLease.RELEASED,
    }),
    inventApplyCountFromCorrupt: observed.applyAttemptCountBeforeRestart + 1,
  });
  if (inventOnIntact.code === "CORRUPT_WAIT_MANIFEST" && !inventOnIntact.resumeWait) {
    details.push(
      "Domain: invent applyCount on intact WAITING manifest → CORRUPT_WAIT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(`Domain intact invent unexpectedly ${inventOnIntact.code}`);
  }

  const inventFromApproved = evaluateApprovalWaitCorruptManifest({
    rawManifest: approvedPhaseRaw,
    inventWaitingApprovalFromCorrupt: true,
  });
  if (
    inventFromApproved.code === "CORRUPT_WAIT_MANIFEST" &&
    !inventFromApproved.resumeWait
  ) {
    details.push(
      "Domain: invent WAITING from APPROVED durable phase → CORRUPT_WAIT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(
      `Domain approved-phase invent unexpectedly ${inventFromApproved.code}`,
    );
  }

  const corruptRaw = `{"schema":"${APPROVAL_WAIT_MANIFEST_SCHEMA}","operationId":"${observed.operationId}","jobId":"`;
  const corruptInspect = inspectApprovalWaitDurableManifest({ raw: corruptRaw });
  const corruptEval = evaluateApprovalWaitCorruptManifest({
    rawManifest: corruptRaw,
    inventWaitingApprovalFromCorrupt: true,
    inventApplyCountFromCorrupt: observed.applyAttemptCountBeforeRestart,
    forceSlotHoldFromCorrupt: true,
    autoVerifyFromCorrupt: true,
  });
  const corruptSnap = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity: ApprovalWaitManifestIntegrity.CORRUPT_JSON,
      fixtureOnly: true,
    },
  });
  if (
    corruptInspect.integrity === ApprovalWaitManifestIntegrity.TRUNCATED &&
    corruptEval.code === "CORRUPT_WAIT_MANIFEST" &&
    !corruptEval.resumeWait &&
    corruptSnap.code === "CORRUPT_WAIT_MANIFEST"
  ) {
    details.push(
      "Domain: corrupt wait-manifest (truncated/invent) → CORRUPT_WAIT_MANIFEST — no invent WAITING_APPROVAL/applyCount/slot/auto-verify",
    );
  } else {
    passed = false;
    details.push(
      `Domain corrupt-manifest refuse unexpectedly inspect=${corruptInspect.integrity} eval=${corruptEval.code} snap=${corruptSnap.code}`,
    );
  }

  // Missing wait-manifest / apply-count decrease / wall-clock expire / invent-approved.
  const missingEval = evaluateApprovalWaitCorruptManifest({
    rawManifest: null,
    inventWaitingApprovalFromCorrupt: true,
  });
  const missingSnap = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity: ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS,
      fixtureOnly: true,
    },
  });
  const decreased = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      applyAttemptCountBeforeRestart: Math.max(
        2,
        observed.applyAttemptCountBeforeRestart,
      ),
      applyAttemptCountAfterRestart: 1,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  const wall = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
    wallClockAdvanceAlone: true,
  });
  const inventApproved = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
    inventApprovedOnRestart: true,
  });
  if (
    missingEval.code === "MISSING_WAIT_MANIFEST" &&
    missingSnap.code === "MISSING_WAIT_MANIFEST" &&
    decreased.code === "APPLY_COUNT_DECREASED_ON_RESTART" &&
    wall.code === "WALL_CLOCK_EXPIRE_REFUSED" &&
    inventApproved.code === "INVENT_APPROVED_ON_RESTART_REFUSED"
  ) {
    details.push(
      "Domain: missing wait-manifest / apply-count decrease / wall-clock expire / invent-approved → MISSING_WAIT_MANIFEST + APPLY_COUNT_DECREASED_ON_RESTART + WALL_CLOCK_EXPIRE_REFUSED + INVENT_APPROVED_ON_RESTART_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Domain edge refuse unexpectedly missing=${missingEval.code}/${missingSnap.code} dec=${decreased.code} wall=${wall.code} invent=${inventApproved.code}`,
    );
  }

  // J14: invent-rejected / cancel-on-restart / non-integer restartCount.
  const inventRejected = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
    inventRejectedOnRestart: true,
  });
  const rejectedPhase = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      phaseAfterRestart: ApprovalWaitPhase.REJECTED,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  const cancelAlone = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
    cancelWaitOnRestartAlone: true,
  });
  const badRestartCount = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      restartCount: 1.5,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  if (
    inventRejected.code === "INVENT_REJECTED_ON_RESTART_REFUSED" &&
    rejectedPhase.code === "INVENT_REJECTED_ON_RESTART_REFUSED" &&
    cancelAlone.code === "CANCEL_WAIT_ON_RESTART_REFUSED" &&
    badRestartCount.code === "INVALID_SNAPSHOT"
  ) {
    details.push(
      "Domain: invent-rejected / cancel-on-restart / non-integer restartCount → INVENT_REJECTED_ON_RESTART_REFUSED + CANCEL_WAIT_ON_RESTART_REFUSED + INVALID_SNAPSHOT",
    );
  } else {
    passed = false;
    details.push(
      `Domain J14 edge refuse unexpectedly inventRejected=${inventRejected.code} rejectedPhase=${rejectedPhase.code} cancel=${cancelAlone.code} restartCount=${badRestartCount.code}`,
    );
  }

  const zeroRestart = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      restartCount: 0,
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  if (zeroRestart.code === "INVALID_SNAPSHOT") {
    details.push("Domain: zero restartCount → INVALID_SNAPSHOT");
  } else {
    passed = false;
    details.push(`Domain zero restartCount unexpectedly ${zeroRestart.code}`);
  }

  const invisibleWait = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      waitIdentityKeyBeforeRestart: "\u200b",
      waitIdentityKeyAfterRestart: "\u200b",
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  if (invisibleWait.code === "INVALID_SNAPSHOT") {
    details.push(
      "Domain: invisible-only waitIdentityKey (ZWSP) → INVALID_SNAPSHOT",
    );
  } else {
    passed = false;
    details.push(`Domain invisible wait key unexpectedly ${invisibleWait.code}`);
  }

  const truncatedSnap = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity: ApprovalWaitManifestIntegrity.TRUNCATED,
      fixtureOnly: true,
    },
  });
  if (truncatedSnap.code === "CORRUPT_WAIT_MANIFEST") {
    details.push(
      "Domain: manifestIntegrity TRUNCATED → CORRUPT_WAIT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(`Domain truncated manifest unexpectedly ${truncatedSnap.code}`);
  }

  const badMultiChain = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [observed.phaseBeforeRestart],
    applyAttemptCounts: [observed.applyAttemptCountBeforeRestart],
    slotLeaseAfterEachRestart: [],
  });
  if (badMultiChain.code === "INVALID_SNAPSHOT") {
    details.push("Domain: invalid multi-restart chain → INVALID_SNAPSHOT");
  } else {
    passed = false;
    details.push(`Domain bad multi chain unexpectedly ${badMultiChain.code}`);
  }

  const wrongSchemaSnap = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity: ApprovalWaitManifestIntegrity.WRONG_SCHEMA,
      fixtureOnly: true,
    },
  });
  if (wrongSchemaSnap.code === "CORRUPT_WAIT_MANIFEST") {
    details.push(
      "Domain: manifestIntegrity WRONG_SCHEMA → CORRUPT_WAIT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(`Domain wrong schema snap unexpectedly ${wrongSchemaSnap.code}`);
  }

  const lengthMismatch = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [
      observed.phaseBeforeRestart,
      observed.phaseAfterRestart,
    ],
    applyAttemptCounts: [observed.applyAttemptCountBeforeRestart],
    slotLeaseAfterEachRestart: [ApprovalWaitSlotLease.RELEASED],
  });
  if (lengthMismatch.code === "INVALID_SNAPSHOT") {
    details.push(
      "Domain: multi-restart length mismatch (apply/slot) → INVALID_SNAPSHOT",
    );
  } else {
    passed = false;
    details.push(`Domain length mismatch unexpectedly ${lengthMismatch.code}`);
  }

  const multiRejectedHop = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [
      observed.phaseBeforeRestart,
      observed.phaseAfterRestart,
      ApprovalWaitPhase.REJECTED,
    ],
    applyAttemptCounts: [
      observed.applyAttemptCountBeforeRestart,
      observed.applyAttemptCountAfterRestart,
      observed.applyAttemptCountAfterRestart,
    ],
    slotLeaseAfterEachRestart: [
      observed.slotLease,
      ApprovalWaitSlotLease.RELEASED,
    ],
  });
  if (multiRejectedHop.code === "INVENT_REJECTED_ON_RESTART_REFUSED") {
    details.push(
      "Domain: multi-restart REJECTED hop → INVENT_REJECTED_ON_RESTART_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Domain multi rejected unexpectedly ${multiRejectedHop.code}`);
  }

  const multiPhaseDrift = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [
      observed.phaseBeforeRestart,
      observed.phaseAfterRestart,
      ApprovalWaitPhase.APPROVED,
    ],
    applyAttemptCounts: [
      observed.applyAttemptCountBeforeRestart,
      observed.applyAttemptCountAfterRestart,
      observed.applyAttemptCountAfterRestart,
    ],
    slotLeaseAfterEachRestart: [
      observed.slotLease,
      ApprovalWaitSlotLease.RELEASED,
    ],
  });
  if (multiPhaseDrift.code === "AUTO_VERIFY_ON_RESTART_REFUSED") {
    details.push(
      "Domain: multi-restart phase drift to APPROVED → AUTO_VERIFY_ON_RESTART_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Domain multi phase drift unexpectedly ${multiPhaseDrift.code}`);
  }

  const checksumSnap = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      manifestIntegrity: ApprovalWaitManifestIntegrity.CHECKSUM_MISMATCH,
      fixtureOnly: true,
    },
  });
  if (checksumSnap.code === "CORRUPT_WAIT_MANIFEST") {
    details.push(
      "Domain: manifestIntegrity CHECKSUM_MISMATCH → CORRUPT_WAIT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(`Domain checksum mismatch unexpectedly ${checksumSnap.code}`);
  }

  const multiApplyDec = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [
      observed.phaseBeforeRestart,
      observed.phaseAfterRestart,
      observed.phaseAfterRestart,
    ],
    applyAttemptCounts: [
      Math.max(2, observed.applyAttemptCountBeforeRestart),
      1,
      1,
    ],
    slotLeaseAfterEachRestart: [
      ApprovalWaitSlotLease.RELEASED,
      ApprovalWaitSlotLease.RELEASED,
    ],
  });
  if (multiApplyDec.code === "APPLY_COUNT_DECREASED_ON_RESTART") {
    details.push(
      "Domain: multi-restart applyCount decrease → APPLY_COUNT_DECREASED_ON_RESTART",
    );
  } else {
    passed = false;
    details.push(`Domain multi apply decrease unexpectedly ${multiApplyDec.code}`);
  }

  const multiApplyGrew = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [
      observed.phaseBeforeRestart,
      observed.phaseAfterRestart,
      observed.phaseAfterRestart,
    ],
    applyAttemptCounts: [
      observed.applyAttemptCountBeforeRestart,
      observed.applyAttemptCountBeforeRestart + 1,
      observed.applyAttemptCountBeforeRestart + 1,
    ],
    slotLeaseAfterEachRestart: [
      ApprovalWaitSlotLease.RELEASED,
      ApprovalWaitSlotLease.RELEASED,
    ],
  });
  if (multiApplyGrew.code === "APPLY_COUNT_GREW_ON_RESTART") {
    details.push(
      "Domain: multi-restart applyCount growth → APPLY_COUNT_GREW_ON_RESTART",
    );
  } else {
    passed = false;
    details.push(`Domain multi apply grew unexpectedly ${multiApplyGrew.code}`);
  }

  const multiHeldSlot = evaluateApprovalWaitAcrossRestarts({
    operationId: observed.operationId,
    jobId: observed.jobId,
    waitIdentityKey: observed.waitIdentityKeyBeforeRestart,
    phases: [
      observed.phaseBeforeRestart,
      observed.phaseAfterRestart,
      observed.phaseAfterRestart,
    ],
    applyAttemptCounts: [
      observed.applyAttemptCountBeforeRestart,
      observed.applyAttemptCountAfterRestart,
      observed.applyAttemptCountAfterRestart,
    ],
    slotLeaseAfterEachRestart: [
      ApprovalWaitSlotLease.HELD,
      ApprovalWaitSlotLease.RELEASED,
    ],
  });
  if (multiHeldSlot.code === "SLOT_HOLD_WHILE_WAITING_REFUSED") {
    details.push(
      "Domain: multi-restart hop with held slot lease → SLOT_HOLD_WHILE_WAITING_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Domain multi slot hold unexpectedly ${multiHeldSlot.code}`);
  }

  const invisibleOp = evaluateApprovalWaitSurvivesRestart({
    snapshot: {
      ...observed,
      operationId: "\u200b",
      jobId: "\u200b",
      manifestIntegrity:
        observed.manifestIntegrity ?? ApprovalWaitManifestIntegrity.OK,
      fixtureOnly: true,
    },
  });
  if (invisibleOp.code === "INVALID_SNAPSHOT") {
    details.push(
      "Domain: invisible-only operationId/jobId → INVALID_SNAPSHOT",
    );
  } else {
    passed = false;
    details.push(`Domain invisible op/job unexpectedly ${invisibleOp.code}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE temporalWiring=NOT_WIRED",
  );
  return { passed, details };
}

/**
 * Evaluate the actual job-continuity observation across restart.
 */
export function proofApprovalWaitFromObservedJobContinuity(
  observed: ObservedApprovalWaitJobContinuity,
): ApprovalWaitDomainProofResult {
  const details: string[] = [];
  let passed = true;

  const jobOk = evaluateApprovalWaitJobContinuity(observed);
  if (jobOk.allowed && jobOk.code === "RESUME_WAIT_NO_SLOT") {
    details.push(
      `Observed job continuity: same jobId ${observed.jobIdAfterRestart} + waitIdentity — WAITING_APPROVAL before/after; slotLease=released`,
    );
  } else {
    passed = false;
    details.push(`Observed job continuity unexpectedly ${JSON.stringify(jobOk)}`);
  }

  const inventedWait = evaluateApprovalWaitJobContinuity({
    ...observed,
    phaseBeforeRestart: ApprovalWaitPhase.APPROVED,
    phaseAfterRestart: ApprovalWaitPhase.WAITING_APPROVAL,
  });
  if (inventedWait.code === "PHASE_NOT_WAITING") {
    details.push(
      "Domain: invented WAITING_APPROVAL after non-waiting pre-restart → PHASE_NOT_WAITING",
    );
  } else {
    passed = false;
    details.push(`Domain invented-wait refuse unexpectedly ${inventedWait.code}`);
  }

  const identityMismatch = evaluateApprovalWaitJobContinuity({
    ...observed,
    waitIdentityKeyAfterRestart: `${observed.waitIdentityKeyBeforeRestart}-mutated`,
  });
  if (identityMismatch.code === "WAIT_IDENTITY_MISMATCH") {
    details.push("Domain: job continuity wait identity mismatch → WAIT_IDENTITY_MISMATCH");
  } else {
    passed = false;
    details.push(
      `Domain job identity refuse unexpectedly ${identityMismatch.code}`,
    );
  }

  const duplicateJob = evaluateApprovalWaitJobContinuity({
    ...observed,
    jobIdAfterRestart: `${observed.jobIdBeforeRestart}-invented`,
    jobCreatedAfterRestart: true,
  });
  if (duplicateJob.code === "JOB_CONTINUITY_MISMATCH") {
    details.push(
      "Domain: duplicate jobId / jobCreatedAfterRestart → JOB_CONTINUITY_MISMATCH",
    );
  } else {
    passed = false;
    details.push(
      `Domain job continuity duplicate unexpectedly ${duplicateJob.code}`,
    );
  }

  const bomRaw = `\uFEFF{"schema":"${APPROVAL_WAIT_MANIFEST_SCHEMA}","operationId":"${observed.operationId}","jobId":"${observed.jobIdBeforeRestart}","phase":"${ApprovalWaitPhase.WAITING_APPROVAL}","waitIdentityKey":"${observed.waitIdentityKeyBeforeRestart}","applyAttemptCount":1,"slotLease":"${ApprovalWaitSlotLease.RELEASED}"}`;
  const bomEval = evaluateApprovalWaitCorruptManifest({
    rawManifest: bomRaw,
    inventWaitingApprovalFromCorrupt: true,
  });
  if (bomEval.code === "CORRUPT_WAIT_MANIFEST" && !bomEval.resumeWait) {
    details.push(
      "Domain: UTF-8 BOM wait-manifest + invent → CORRUPT_WAIT_MANIFEST",
    );
  } else {
    passed = false;
    details.push(`Domain BOM refuse unexpectedly ${bomEval.code}`);
  }

  const jobSlot = evaluateApprovalWaitJobContinuity({
    ...observed,
    holdsWorkerSlot: true,
    slotLease: ApprovalWaitSlotLease.HELD,
  });
  if (jobSlot.code === "SLOT_HOLD_WHILE_WAITING_REFUSED") {
    details.push(
      "Domain: job continuity slot hold → SLOT_HOLD_WHILE_WAITING_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Domain job slot hold unexpectedly ${jobSlot.code}`);
  }

  const jobLive = evaluateApprovalWaitJobContinuity({
    ...observed,
    claimLiveVerified: true,
  });
  if (jobLive.code === "LIVE_TEMPORAL_CLAIM_REFUSED") {
    details.push("Domain: job continuity claimLiveVerified → LIVE_TEMPORAL_CLAIM_REFUSED");
  } else {
    passed = false;
    details.push(`Domain job live claim unexpectedly ${jobLive.code}`);
  }

  const jobRejected = evaluateApprovalWaitJobContinuity({
    ...observed,
    phaseAfterRestart: ApprovalWaitPhase.REJECTED,
  });
  if (jobRejected.code === "PHASE_NOT_WAITING") {
    details.push(
      "Domain: job continuity REJECTED after restart → PHASE_NOT_WAITING",
    );
  } else {
    passed = false;
    details.push(`Domain job rejected phase unexpectedly ${jobRejected.code}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE temporalWiring=NOT_WIRED",
  );
  return { passed, details };
}
