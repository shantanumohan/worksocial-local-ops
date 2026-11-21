/**
 * Fixture proof for T-X058 — third automatic repair attempt escalates.
 *
 * MAX_REPAIR_ATTEMPTS=2: after two failed attempts the ticket is ESCALATED
 * and starting a third attempt is denied (ATTEMPT_LIMIT). External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  IncidentSeverity,
  IncidentStatus,
  MAX_REPAIR_ATTEMPTS,
  RepairAttemptOutcome,
  RepairClass,
  RepairTicketStatus,
  SoakProofKind,
  cmsRepairWiringStatus,
  createIncident,
  createRepairTicket,
  evaluateAttemptLimitGate,
  recordRepairAttempt,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X058 fixture ACCEPTED.
 */
export function proofRepairAttemptLimitEscalated(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  if (MAX_REPAIR_ATTEMPTS === 2) {
    details.push(`MAX_REPAIR_ATTEMPTS=${MAX_REPAIR_ATTEMPTS}`);
  } else {
    passed = false;
    details.push(`Unexpected MAX_REPAIR_ATTEMPTS=${MAX_REPAIR_ATTEMPTS}`);
  }

  if (cmsRepairWiringStatus() === "NOT_WIRED") {
    details.push("CMS repair wiring NOT_WIRED");
  } else {
    passed = false;
    details.push("CMS repair unexpectedly wired");
  }

  const incident = createIncident({
    incidentId: "inc-attempt-limit",
    title: "Broken CTA",
    summary: "Home CTA href points to dead link",
    severity: IncidentSeverity.P2,
    assetId: "page-home-cta",
    siteId: "worksocial-pilot",
    failingProbeId: "probe-cta",
    businessImpact: "Lost day-pass clicks",
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: IncidentStatus.REPRODUCED,
  });
  let ticket = createRepairTicket({
    ticketId: "tkt-attempt-limit",
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-attempt-limit",
    sourceRevision: "rev-healthy",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });

  // First attempt within limit.
  const firstGate = evaluateAttemptLimitGate({
    ticket,
    startingNewAttempt: true,
  });
  if (firstGate.allowed) {
    details.push("First automatic attempt allowed");
  } else {
    passed = false;
    details.push("First attempt unexpectedly denied");
  }
  const a1 = recordRepairAttempt({
    attemptId: "a1",
    ticket,
    proposalId: "prop-1",
    outcome: RepairAttemptOutcome.TESTS_FAILED,
    createdAtIso: nowIso,
  });
  ticket = a1.ticket;
  if (ticket.attemptCount === 1) {
    details.push("Attempt 1 recorded (TESTS_FAILED)");
  } else {
    passed = false;
    details.push(`Attempt count after first=${ticket.attemptCount}`);
  }

  // Second attempt reaches max → escalate.
  const secondGate = evaluateAttemptLimitGate({
    ticket,
    startingNewAttempt: true,
  });
  if (secondGate.allowed) {
    details.push("Second automatic attempt allowed (at max)");
  } else {
    passed = false;
    details.push("Second attempt unexpectedly denied");
  }
  const a2 = recordRepairAttempt({
    attemptId: "a2",
    ticket,
    proposalId: "prop-1",
    outcome: RepairAttemptOutcome.TESTS_FAILED,
    createdAtIso: nowIso,
  });
  ticket = a2.ticket;
  if (
    ticket.attemptCount === 2 &&
    ticket.status === RepairTicketStatus.ESCALATED
  ) {
    details.push("Attempt 2 recorded; ticket status=ESCALATED");
  } else {
    passed = false;
    details.push(
      `After attempt 2 count=${ticket.attemptCount} status=${ticket.status}`,
    );
  }

  // Third automatic attempt refused — T-X058.
  const thirdGate = evaluateAttemptLimitGate({
    ticket,
    startingNewAttempt: true,
  });
  if (!thirdGate.allowed && thirdGate.code === "ATTEMPT_LIMIT") {
    details.push(
      "Third automatic attempt denied (ATTEMPT_LIMIT) — escalate",
    );
  } else {
    passed = false;
    details.push("Third attempt unexpectedly allowed or wrong code");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-attempt-limit-${randomUUID()}`,
    kind: SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x058-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
