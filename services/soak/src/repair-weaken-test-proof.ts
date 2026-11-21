/**
 * Fixture proof for T-US-042 / T-X057 — repair cannot weaken protected tests.
 *
 * Test-integrity and protected-path gates reject disable/skip/delete weaken
 * operations and patches under tests/. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  IncidentSeverity,
  IncidentStatus,
  RepairClass,
  RepairPatchOp,
  RepairProposalStatus,
  SoakProofKind,
  WeakenTestOperation,
  createIncident,
  createRepairProposal,
  createRepairTicket,
  digestTestBaseline,
  evaluateProtectedPathGate,
  evaluateTestIntegrityGate,
  pathIsProtected,
  type SoakProofRecord,
} from "@worksocial/domain";

const now = "2026-11-21T23:10:00.000Z";
const baseline = digestTestBaseline("probe-cta", ["cta_href_equals_healthy"]);

function ticket() {
  const incident = createIncident({
    incidentId: "inc-weaken",
    title: "Broken CTA",
    summary: "Home CTA href points to dead link",
    severity: IncidentSeverity.P2,
    assetId: "page-home-cta",
    siteId: "worksocial-pilot",
    failingProbeId: "probe-cta",
    businessImpact: "Lost day-pass clicks",
    fixtureOnly: true,
    createdAtIso: now,
    status: IncidentStatus.REPRODUCED,
  });
  return createRepairTicket({
    ticketId: "tkt-weaken",
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-weaken",
    sourceRevision: "rev-healthy",
    fixtureOnly: true,
    createdAtIso: now,
  });
}

/**
 * Complete expected proof set for T-US-042 / T-X057 fixture ACCEPTED.
 */
export function proofRepairWeakenTestRejected(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const t = ticket();

  // 1. Positive control: healthy restore proposal preserves test baseline.
  const healthy = createRepairProposal({
    proposalId: "prop-healthy",
    ticket: t,
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
    status: RepairProposalStatus.READY_FOR_REVIEW,
  });
  const healthyGate = evaluateTestIntegrityGate(healthy);
  if (healthyGate.allowed) {
    details.push("Healthy repair preserves test baseline");
  } else {
    passed = false;
    details.push("Healthy repair unexpectedly failed test integrity");
  }

  // 2. Explicit weaken operation (disable failing test) rejected — T-X057.
  const weaken = createRepairProposal({
    proposalId: "prop-weaken",
    ticket: t,
    authorRoleId: "A24",
    title: "Disable failing test",
    summary: "Disable failing probe test instead of fixing CTA",
    patches: healthy.patches,
    testOperations: [WeakenTestOperation.DISABLE_TEST],
    regressionProbeId: "probe-cta",
    testBaselineDigest: baseline,
    proposedTestBaselineDigest: baseline,
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: RepairProposalStatus.READY_FOR_REVIEW,
  });
  const weakenGate = evaluateTestIntegrityGate(weaken);
  if (
    !weakenGate.allowed &&
    weakenGate.code === "TEST_INTEGRITY_VIOLATION"
  ) {
    details.push(
      "DISABLE_TEST weaken operation rejected (TEST_INTEGRITY_VIOLATION)",
    );
  } else {
    passed = false;
    details.push("DISABLE_TEST unexpectedly passed test integrity");
  }

  // 3. Protected test path patch rejected — T-US-042.
  if (pathIsProtected("tests/unit/cta.test.ts")) {
    details.push("tests/unit/cta.test.ts is protected");
  } else {
    passed = false;
    details.push("Expected tests/unit/cta.test.ts to be protected");
  }
  const pathHit = createRepairProposal({
    proposalId: "prop-path",
    ticket: t,
    authorRoleId: "A24",
    title: "Skip assertion in test",
    summary: "Mutate protected test file",
    patches: [
      {
        path: "tests/unit/cta.test.ts",
        op: RepairPatchOp.REPLACE_FIELD,
        before: "expect(true)",
        after: "expect(true).skip()",
      },
    ],
    testOperations: ["run_regression"],
    regressionProbeId: "probe-cta",
    testBaselineDigest: baseline,
    proposedTestBaselineDigest: baseline,
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: RepairProposalStatus.READY_FOR_REVIEW,
  });
  const pathGate = evaluateProtectedPathGate(pathHit);
  if (!pathGate.allowed && pathGate.code === "PROTECTED_PATH") {
    details.push("Protected test path patch rejected (PROTECTED_PATH)");
  } else {
    passed = false;
    details.push("Protected test path patch unexpectedly allowed");
  }

  // 4. Baseline digest mutation rejected.
  const baselineTamper = createRepairProposal({
    proposalId: "prop-baseline",
    ticket: t,
    authorRoleId: "A24",
    title: "Tamper baseline",
    summary: "Change proposed test baseline digest",
    patches: healthy.patches,
    testOperations: ["run_regression"],
    regressionProbeId: "probe-cta",
    testBaselineDigest: baseline,
    proposedTestBaselineDigest: "tampered-baseline",
    fixtureOnly: true,
    createdAtIso: nowIso,
    status: RepairProposalStatus.READY_FOR_REVIEW,
  });
  const baselineGate = evaluateTestIntegrityGate(baselineTamper);
  if (!baselineGate.allowed) {
    details.push("Test baseline digest mutation rejected");
  } else {
    passed = false;
    details.push("Baseline digest mutation unexpectedly allowed");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-repair-weaken-${randomUUID()}`,
    kind: SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us042-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
