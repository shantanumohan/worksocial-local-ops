/**
 * Fixture proof for T-X058 — third automatic repair attempt escalates.
 *
 * MAX_REPAIR_ATTEMPTS=2: after two failed attempts the ticket is ESCALATED
 * and starting a third attempt is denied (ATTEMPT_LIMIT). External effects: NONE.
 * CMS repair wiring: NOT_WIRED. ACCEPTED ≠ VERIFIED.
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
  evaluateRepairAttemptLimitEscalation,
  recordRepairAttempt,
  shouldRecordAttemptOnGateDenial,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X058 fixture ACCEPTED.
 * Hillclimb: GATE_DENIED escalate path, honesty wrapper, SUCCESS non-escalate,
 * CMS NOT_WIRED.
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
  const thirdHonesty = evaluateRepairAttemptLimitEscalation({
    ticket,
    startingNewAttempt: true,
  });
  if (
    !thirdHonesty.allowed &&
    thirdHonesty.code === "ATTEMPT_LIMIT" &&
    thirdHonesty.escalated === true &&
    thirdHonesty.cmsRepairWiring === "NOT_WIRED" &&
    thirdHonesty.externalEffects === "NONE" &&
    thirdHonesty.maxAttempts === MAX_REPAIR_ATTEMPTS &&
    shouldRecordAttemptOnGateDenial("ATTEMPT_LIMIT") === false &&
    ticket.attemptCount === MAX_REPAIR_ATTEMPTS
  ) {
    details.push(
      "Third automatic attempt denied (ATTEMPT_LIMIT) — escalate without recording attempt; cmsRepairWiring=NOT_WIRED externalEffects=NONE",
    );
  } else {
    passed = false;
    details.push(
      `Third honesty gate unexpectedly ${JSON.stringify(thirdHonesty)} count=${ticket.attemptCount}`,
    );
  }

  // GATE_DENIED path also escalates at max (parallel ticket).
  let gateDeniedTicket = createRepairTicket({
    ticketId: "tkt-gate-denied",
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-gate-denied",
    sourceRevision: "rev-healthy",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  gateDeniedTicket = recordRepairAttempt({
    attemptId: "gd1",
    ticket: gateDeniedTicket,
    proposalId: "prop-gd",
    outcome: RepairAttemptOutcome.GATE_DENIED,
    createdAtIso: nowIso,
  }).ticket;
  gateDeniedTicket = recordRepairAttempt({
    attemptId: "gd2",
    ticket: gateDeniedTicket,
    proposalId: "prop-gd",
    outcome: RepairAttemptOutcome.GATE_DENIED,
    createdAtIso: nowIso,
  }).ticket;
  if (
    gateDeniedTicket.status === RepairTicketStatus.ESCALATED &&
    gateDeniedTicket.attemptCount === 2
  ) {
    const thirdGd = evaluateAttemptLimitGate({
      ticket: gateDeniedTicket,
      startingNewAttempt: true,
    });
    if (!thirdGd.allowed && thirdGd.code === "ATTEMPT_LIMIT") {
      details.push(
        "GATE_DENIED ×2 → ESCALATED; third attempt ATTEMPT_LIMIT",
      );
    } else {
      passed = false;
      details.push(`GATE_DENIED third unexpectedly ${JSON.stringify(thirdGd)}`);
    }
  } else {
    passed = false;
    details.push(
      `GATE_DENIED escalate unexpectedly status=${gateDeniedTicket.status} count=${gateDeniedTicket.attemptCount}`,
    );
  }

  // SUCCESS within limit does not escalate.
  let successTicket = createRepairTicket({
    ticketId: "tkt-success",
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-success",
    sourceRevision: "rev-healthy",
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  successTicket = recordRepairAttempt({
    attemptId: "ok1",
    ticket: successTicket,
    proposalId: "prop-ok",
    outcome: RepairAttemptOutcome.RELEASED,
    createdAtIso: nowIso,
  }).ticket;
  if (
    successTicket.attemptCount === 1 &&
    successTicket.status === RepairTicketStatus.RELEASED_PENDING
  ) {
    details.push(
      "RELEASED within limit → RELEASED_PENDING (no premature escalate)",
    );
  } else {
    passed = false;
    details.push(
      `SUCCESS path unexpectedly status=${successTicket.status} count=${successTicket.attemptCount}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false cmsRepairWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
  );

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
