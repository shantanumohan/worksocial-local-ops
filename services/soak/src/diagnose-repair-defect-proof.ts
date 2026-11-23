/**
 * Fixture proof for T-US-041 — diagnose/repair defect with verified resolution
 * or acknowledged human handoff. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  IncidentSeverity,
  IncidentStatus,
  InboxChannel,
  OutcomeEvidenceSource,
  RepairClass,
  RepairPatchOp,
  RepairProposalStatus,
  RepairTicketStatus,
  SoakProofKind,
  acknowledgeHandoff,
  applyFixtureRepairPatches,
  applyRepairReleaseVerification,
  cmsRepairWiringStatus,
  createConversation,
  createHandoff,
  createIncident,
  createRepairProposal,
  createRepairTicket,
  digestTestBaseline,
  emptyRepairState,
  evaluateFixtureCanary,
  injectFixtureDefect,
  type FixtureAssetSnapshot,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-041 fixture ACCEPTED.
 */
export function proofDiagnoseRepairDefectResolvedOrHandoff(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const baseline = digestTestBaseline("probe-cta", ["cta_href_equals_healthy"]);

  let asset: FixtureAssetSnapshot = {
    assetId: "page-home-cta",
    fieldKey: "ctaHref",
    fieldValue: "/day-pass",
    healthyValue: "/day-pass",
    defectInjected: false,
    revision: "rev-healthy",
    updatedAtIso: nowIso,
  };

  // 1. Diagnose: inject defect → canary fails.
  asset = injectFixtureDefect({
    asset,
    defectValue: "/broken",
    nowIso,
  });
  const diagnosed = evaluateFixtureCanary(asset);
  if (diagnosed.passed === false && asset.defectInjected === true) {
    details.push("Injected CTA defect → canary FAILURE (diagnose)");
  } else {
    passed = false;
    details.push(`Diagnose unexpectedly ${JSON.stringify(diagnosed)}`);
  }

  // 2. Verified resolution: restore patch → canary SUCCESS → release VERIFIED.
  const restored = applyFixtureRepairPatches({
    asset,
    patches: [
      {
        path: "sites/worksocial/home/cta.json",
        op: RepairPatchOp.RESTORE_VALUE,
        before: "/broken",
        after: "/day-pass",
      },
    ],
    nowIso,
  });
  if (
    restored.ok === true &&
    evaluateFixtureCanary(restored.asset).passed === true &&
    restored.asset.defectInjected === false
  ) {
    details.push("Fixture restore patches → canary SUCCESS (resolution)");
    asset = restored.asset;
  } else {
    passed = false;
    details.push(`Restore unexpectedly ${JSON.stringify(restored)}`);
  }

  const incident = createIncident({
    incidentId: `inc-${randomUUID().slice(0, 8)}`,
    title: "Broken CTA",
    summary: "Home CTA href points to dead link",
    severity: IncidentSeverity.P2,
    assetId: asset.assetId,
    siteId: "worksocial-pilot",
    failingProbeId: "probe-cta",
    businessImpact: "Lost day-pass clicks",
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: IncidentStatus.REPRODUCED,
  });
  const ticket = createRepairTicket({
    ticketId: `tkt-${randomUUID().slice(0, 8)}`,
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-us041",
    sourceRevision: "rev-defect",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const proposal = {
    ...createRepairProposal({
      proposalId: `prop-${randomUUID().slice(0, 8)}`,
      ticket,
      authorRoleId: "A24",
      title: "Restore CTA href",
      summary: "Restore known-good CTA target",
      patches: [
        {
          path: "sites/worksocial/home/cta.json",
          op: RepairPatchOp.RESTORE_VALUE,
          before: "/broken",
          after: "/day-pass",
        },
      ],
      testOperations: ["run_regression"],
      regressionProbeId: "probe-cta",
      testBaselineDigest: baseline,
      proposedTestBaselineDigest: baseline,
      fixtureOnly: true,
      createdAtIso: nowIso,
    }),
    status: RepairProposalStatus.RELEASED_PENDING,
  };

  let state = emptyRepairState(nowIso);
  state = {
    ...state,
    incidents: [incident],
    tickets: [ticket],
    proposals: [proposal],
  };

  const verified = applyRepairReleaseVerification(state, {
    proposalId: proposal.proposalId,
    decision: "SUCCESS",
    source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
    fixtureOnly: true,
    summary: "Canary restored after fixture repair",
    outcomeId: `out-${randomUUID().slice(0, 8)}`,
    operationId: `op-ok-${randomUUID().slice(0, 8)}`,
    writePathId: "wp-bounded-repair",
    nowIso,
  });
  const resolvedIncident = verified.state.incidents.find(
    (i) => i.incidentId === incident.incidentId,
  );
  if (
    verified.proposal?.status === RepairProposalStatus.VERIFIED &&
    verified.ticket?.status === RepairTicketStatus.VERIFIED &&
    resolvedIncident?.status === IncidentStatus.RESOLVED &&
    verified.outcome?.label === "SUCCESS"
  ) {
    details.push(
      "Release SUCCESS → proposal/ticket VERIFIED + incident RESOLVED",
    );
  } else {
    passed = false;
    details.push(
      `Verified resolution unexpectedly proposal=${verified.proposal?.status} ticket=${verified.ticket?.status} incident=${resolvedIncident?.status}`,
    );
  }

  // 3. Handoff path: failed release does not invent success; acknowledged handoff.
  const failIncident = createIncident({
    incidentId: `inc-fail-${randomUUID().slice(0, 8)}`,
    title: "Broken CTA (unresolved)",
    summary: "Repair canary still failing",
    severity: IncidentSeverity.P2,
    assetId: asset.assetId,
    siteId: "worksocial-pilot",
    failingProbeId: "probe-cta",
    businessImpact: "Lost day-pass clicks",
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: IncidentStatus.REPAIRING,
  });
  const failTicket = createRepairTicket({
    ticketId: `tkt-fail-${randomUUID().slice(0, 8)}`,
    incident: failIncident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-us041-fail",
    sourceRevision: "rev-defect",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const failProposal = {
    ...createRepairProposal({
      proposalId: `prop-fail-${randomUUID().slice(0, 8)}`,
      ticket: failTicket,
      authorRoleId: "A24",
      title: "Restore CTA href (failed canary)",
      summary: "Attempted restore still failing canary",
      patches: [
        {
          path: "sites/worksocial/home/cta.json",
          op: RepairPatchOp.RESTORE_VALUE,
          before: "/broken",
          after: "/still-broken",
        },
      ],
      testOperations: ["run_regression"],
      regressionProbeId: "probe-cta",
      testBaselineDigest: baseline,
      proposedTestBaselineDigest: baseline,
      fixtureOnly: true,
      createdAtIso: nowIso,
    }),
    status: RepairProposalStatus.RELEASED_PENDING,
  };
  let failState = emptyRepairState(nowIso);
  failState = {
    ...failState,
    incidents: [failIncident],
    tickets: [failTicket],
    proposals: [failProposal],
  };
  const failed = applyRepairReleaseVerification(failState, {
    proposalId: failProposal.proposalId,
    decision: "FAILURE",
    source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
    fixtureOnly: true,
    summary: "Canary still failing after repair attempt",
    outcomeId: `out-fail-${randomUUID().slice(0, 8)}`,
    operationId: `op-fail-${randomUUID().slice(0, 8)}`,
    writePathId: "wp-bounded-repair",
    nowIso,
  });
  if (
    failed.proposal?.status === RepairProposalStatus.FAILED &&
    failed.ticket?.status === RepairTicketStatus.FAILED &&
    failed.outcome?.label === "FAILURE"
  ) {
    details.push(
      "Release FAILURE → proposal/ticket FAILED (no invented SUCCESS)",
    );
  } else {
    passed = false;
    details.push(
      `Failure path unexpectedly proposal=${failed.proposal?.status} ticket=${failed.ticket?.status}`,
    );
  }

  const conversation = createConversation({
    conversationId: `conv-${randomUUID().slice(0, 8)}`,
    providerThreadId: `thr-${randomUUID().slice(0, 8)}`,
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Fixture Operator",
    fixtureOnly: true,
    nowIso,
  });
  const { handoff, conversation: handed } = createHandoff({
    handoffId: `ho-${randomUUID().slice(0, 8)}`,
    conversation,
    reason: "Repair canary failed — escalate to human owner",
    nextOwner: "A29",
    customerQuestions: ["Is the day-pass CTA fixed?"],
    verifiedAnswers: [],
    requestedAction: "Human diagnose remaining CTA defect",
    nowIso,
  });
  const acked = acknowledgeHandoff({ handoff, nowIso });
  if (
    handed.humanOwned === true &&
    handed.agentSendAllowed === false &&
    acked.acknowledged === true &&
    acked.acknowledgedAtIso === nowIso
  ) {
    details.push(
      "Failed repair → createHandoff + acknowledgeHandoff (human handoff)",
    );
  } else {
    passed = false;
    details.push(
      `Handoff unexpectedly acknowledged=${acked.acknowledged} humanOwned=${handed.humanOwned}`,
    );
  }

  if (cmsRepairWiringStatus() === "NOT_WIRED") {
    details.push("cmsRepairWiringStatus=NOT_WIRED");
  } else {
    passed = false;
    details.push("Expected cmsRepairWiringStatus=NOT_WIRED");
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-diagnose-repair-${randomUUID()}`,
    kind: SoakProofKind.DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us041-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
