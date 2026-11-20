import { describe, expect, it } from "vitest";
import {
  IncidentSeverity,
  IncidentStatus,
  MAX_REPAIR_ATTEMPTS,
  RepairAttemptOutcome,
  RepairClass,
  RepairPatchOp,
  RepairProposalStatus,
  RepairTicketStatus,
  WeakenTestOperation,
  acquireRepairLease,
  applyFixtureRepairPatches,
  applyRepairReleaseVerification,
  createIncident,
  createRepairProposal,
  createRepairTicket,
  createTestEvidence,
  digestTestBaseline,
  emptyRepairState,
  evaluateAttemptLimitGate,
  evaluateFixtureCanary,
  evaluateProtectedPathGate,
  evaluateRepairReleaseGate,
  evaluateRepairScopeGate,
  evaluateTestIntegrityGate,
  injectFixtureDefect,
  pathIsProtected,
  recordRepairAttempt,
  cmsRepairWiringStatus,
  type FixtureAssetSnapshot,
  type RepairTicket,
} from "./repair.js";
import { OutcomeEvidenceSource } from "./production-mapping.js";

const now = "2026-11-20T04:00:00.000Z";
const baseline = digestTestBaseline("probe-cta", ["cta_href_equals_healthy"]);

function ticket(): RepairTicket {
  const incident = createIncident({
    incidentId: "inc-1",
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
    ticketId: "tkt-1",
    incident,
    repairClass: RepairClass.RESTORE_CTA,
    worktreeRef: "worktrees/tkt-1",
    sourceRevision: "rev-healthy",
    fixtureOnly: true,
    createdAtIso: now,
  });
}

function healthyProposal(overrides?: Partial<Parameters<typeof createRepairProposal>[0]>) {
  return createRepairProposal({
    proposalId: "prop-1",
    ticket: ticket(),
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
    createdAtIso: now,
    status: RepairProposalStatus.READY_FOR_REVIEW,
    ...overrides,
  });
}

describe("path protection", () => {
  it("flags tests, policies, and gateway paths", () => {
    expect(pathIsProtected("tests/unit/foo.test.ts")).toBe(true);
    expect(pathIsProtected("packages/domain/src/standing-authority.ts")).toBe(
      true,
    );
    expect(pathIsProtected("services/action-gateway/src/gateway.ts")).toBe(
      true,
    );
    expect(pathIsProtected("sites/worksocial/home/cta.json")).toBe(false);
  });
});

describe("test integrity gate", () => {
  it("fails closed when weaken operations are declared", () => {
    const proposal = healthyProposal({
      testOperations: [WeakenTestOperation.DISABLE_TEST],
    });
    const gate = evaluateTestIntegrityGate(proposal);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("TEST_INTEGRITY_VIOLATION");
    }
  });

  it("fails closed when baseline digest would change", () => {
    const proposal = healthyProposal({
      proposedTestBaselineDigest: "tampered",
    });
    const gate = evaluateTestIntegrityGate(proposal);
    expect(gate.allowed).toBe(false);
  });

  it("passes when baseline is preserved", () => {
    const gate = evaluateTestIntegrityGate(healthyProposal());
    expect(gate.allowed).toBe(true);
  });
});

describe("protected path + scope gates", () => {
  it("rejects patches under tests/", () => {
    const proposal = healthyProposal({
      patches: [
        {
          path: "tests/unit/cta.test.ts",
          op: RepairPatchOp.REPLACE_FIELD,
          before: "expect(true)",
          after: "expect(true).skip()",
        },
      ],
    });
    const gate = evaluateProtectedPathGate(proposal);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("PROTECTED_PATH");
  });

  it("rejects high-risk markers in summary", () => {
    const proposal = healthyProposal({
      summary: "Also tweak payment credentials while fixing CTA",
    });
    const gate = evaluateRepairScopeGate({
      proposal,
      ticket: ticket(),
    });
    expect(gate.allowed).toBe(false);
  });
});

describe("attempt limit", () => {
  it("defaults to two attempts then escalate", () => {
    expect(MAX_REPAIR_ATTEMPTS).toBe(2);
    let t = ticket();
    const a1 = recordRepairAttempt({
      attemptId: "a1",
      ticket: t,
      proposalId: "prop-1",
      outcome: RepairAttemptOutcome.TESTS_FAILED,
      createdAtIso: now,
    });
    expect(a1.ticket.attemptCount).toBe(1);
    t = a1.ticket;
    const a2 = recordRepairAttempt({
      attemptId: "a2",
      ticket: t,
      proposalId: "prop-1",
      outcome: RepairAttemptOutcome.TESTS_FAILED,
      createdAtIso: now,
    });
    expect(a2.ticket.attemptCount).toBe(2);
    expect(a2.ticket.status).toBe(RepairTicketStatus.ESCALATED);

    const denied = evaluateAttemptLimitGate({
      ticket: a2.ticket,
      startingNewAttempt: true,
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.code).toBe("ATTEMPT_LIMIT");
  });
});

describe("independent review on release gate", () => {
  it("rejects self-approval", () => {
    const proposal = healthyProposal({ selfApprovalAttempted: true });
    const gate = evaluateRepairReleaseGate({
      proposal,
      ticket: ticket(),
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("SELF_APPROVAL_FORBIDDEN");
    }
  });

  it("accepts A24 proposal with A25 verdict path when no weaken ops", () => {
    const proposal = healthyProposal();
    const gate = evaluateRepairReleaseGate({
      proposal,
      ticket: ticket(),
      existingVerdict: {
        verdictId: "v1",
        proposalId: proposal.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A24",
        approved: true,
        reason: "Scope and tests intact",
        decidedAtIso: now,
      },
    });
    expect(gate.allowed).toBe(true);
  });
});

describe("fixture inject → repair → canary", () => {
  it("restores healthy CTA and passes canary", () => {
    let asset: FixtureAssetSnapshot = {
      assetId: "page-home-cta",
      fieldKey: "ctaHref",
      fieldValue: "/day-pass",
      healthyValue: "/day-pass",
      defectInjected: false,
      revision: "rev-healthy",
      updatedAtIso: now,
    };
    expect(evaluateFixtureCanary(asset).passed).toBe(true);

    asset = injectFixtureDefect({
      asset,
      defectValue: "/broken",
      nowIso: now,
    });
    expect(evaluateFixtureCanary(asset).passed).toBe(false);

    const applied = applyFixtureRepairPatches({
      asset,
      patches: [
        {
          path: "sites/worksocial/home/cta.json",
          op: RepairPatchOp.RESTORE_VALUE,
          before: "/broken",
          after: "/day-pass",
        },
      ],
      nowIso: now,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(evaluateFixtureCanary(applied.asset).passed).toBe(true);
  });

  it("refuses apply that targets protected paths", () => {
    const asset: FixtureAssetSnapshot = {
      assetId: "page-home-cta",
      fieldKey: "ctaHref",
      fieldValue: "/broken",
      healthyValue: "/day-pass",
      defectInjected: true,
      revision: "rev-defect",
      updatedAtIso: now,
    };
    const applied = applyFixtureRepairPatches({
      asset,
      patches: [
        {
          path: "tests/unit/cta.test.ts",
          op: RepairPatchOp.REPLACE_FIELD,
          before: "x",
          after: "y",
        },
      ],
      nowIso: now,
    });
    expect(applied.ok).toBe(false);
  });
});

describe("lease + evidence + learning outcome", () => {
  it("acquires lease and records verified release outcome", () => {
    const leased = acquireRepairLease({
      ticket: ticket(),
      owner: "A24",
      nowIso: now,
    });
    expect(leased.leaseOwner).toBe("A24");
    expect(leased.leaseExpiresAtIso).toBeTruthy();

    const evidence = createTestEvidence({
      evidenceId: "ev-1",
      proposalId: "prop-1",
      probeId: "probe-cta",
      passed: true,
      assertionFingerprints: ["cta_href_equals_healthy"],
      summary: "ok",
      fixtureOnly: true,
      recordedAtIso: now,
    });
    expect(evidence.passed).toBe(true);

    let state = emptyRepairState(now);
    const proposal = healthyProposal({
      status: RepairProposalStatus.RELEASED_PENDING,
    });
    // force status for verification path
    const pending = {
      ...proposal,
      status: RepairProposalStatus.RELEASED_PENDING,
    };
    state = {
      ...state,
      incidents: [
        createIncident({
          incidentId: "inc-1",
          title: "Broken CTA",
          summary: "x",
          severity: IncidentSeverity.P2,
          assetId: "page-home-cta",
          siteId: "worksocial-pilot",
          failingProbeId: "probe-cta",
          businessImpact: "x",
          fixtureOnly: true,
          createdAtIso: now,
        }),
      ],
      tickets: [ticket()],
      proposals: [pending],
      testEvidence: [evidence],
    };

    const applied = applyRepairReleaseVerification(state, {
      proposalId: pending.proposalId,
      decision: "SUCCESS",
      source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
      fixtureOnly: true,
      summary: "Canary restored",
      outcomeId: "out-1",
      operationId: "op-1",
      writePathId: "wp-bounded-repair",
      nowIso: now,
    });
    expect(applied.proposal?.status).toBe(RepairProposalStatus.VERIFIED);
    expect(applied.outcome?.label).toBe("SUCCESS");
    expect(cmsRepairWiringStatus()).toBe("NOT_WIRED");
  });
});
