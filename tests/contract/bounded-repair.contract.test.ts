/**
 * Contract: R1-10 bounded repair — weaken-test fails closed; attempt limit;
 * injected defect → repair → independently verified; live CMS NOT_WIRED.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OperatingMode,
  RepairAttemptOutcome,
  WeakenTestOperation,
  evaluateAttemptLimitGate,
  evaluateTestIntegrityGate,
  recordRepairAttempt,
} from "@worksocial/domain";
import {
  createDemoRepairGrant,
  createFileRepairStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  REPAIR_PROPOSAL_ID,
  createRepairService,
  liveCmsRepairStub,
} from "@worksocial/repair";

const dirs: string[] = [];
const now = "2026-11-20T05:30:00.000Z";

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("contract: weaken-test fail closed (T-R01)", () => {
  it("rejects proposals that disable tests or mutate baselines", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-repair-contract-"));
    dirs.push(dir);
    const store = createFileRepairStore(dir);
    const service = createRepairService(store, {
      gateway: createActionGateway(),
    });
    service.seedFixtures(now);
    const proposal = store.read().proposals[0]!;
    const weakened = {
      ...proposal,
      testOperations: [WeakenTestOperation.LOWER_THRESHOLD],
      proposedTestBaselineDigest: "mutated",
    };
    const gate = evaluateTestIntegrityGate(weakened);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("TEST_INTEGRITY_VIOLATION");
    }
  });
});

describe("contract: attempt limit + independent review (T-R02)", () => {
  it("escalates after two failed attempts and forbids self-approval", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-repair-contract-"));
    dirs.push(dir);
    const store = createFileRepairStore(dir);
    const service = createRepairService(store);
    const seeded = service.seedFixtures(now);
    let ticket = seeded.ticket;

    const a1 = recordRepairAttempt({
      attemptId: "a1",
      ticket,
      proposalId: REPAIR_PROPOSAL_ID,
      outcome: RepairAttemptOutcome.TESTS_FAILED,
      createdAtIso: now,
    });
    ticket = a1.ticket;
    const a2 = recordRepairAttempt({
      attemptId: "a2",
      ticket,
      proposalId: REPAIR_PROPOSAL_ID,
      outcome: RepairAttemptOutcome.TESTS_FAILED,
      createdAtIso: now,
    });
    expect(a2.ticket.status).toBe("escalated");
    expect(
      evaluateAttemptLimitGate({
        ticket: a2.ticket,
        startingNewAttempt: true,
      }).allowed,
    ).toBe(false);

    store.upsertProposal({
      ...seeded.proposal,
      selfApprovalAttempted: true,
      updatedAtIso: now,
    });
    const self = service.submitForReview({
      proposalId: REPAIR_PROPOSAL_ID,
      nowIso: now,
    });
    expect(self.ok).toBe(false);
  });
});

describe("contract: injected defect → repair → verify (T-R03)", () => {
  it("restores fixture canary through gateway with ACCEPTED_PENDING ≠ VERIFIED", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-repair-contract-"));
    dirs.push(dir);
    const store = createFileRepairStore(dir);
    const gateway = createActionGateway();
    const service = createRepairService(store, { gateway });
    service.seedFixtures(now);
    service.injectDefect({ nowIso: now });

    const reviewed = service.recordIndependentReview({
      proposalId: REPAIR_PROPOSAL_ID,
      approved: true,
      reason: "Independent A25 approval",
      nowIso: now,
    });
    expect(reviewed.ok).toBe(true);

    const { mapping } = service.seedAndProveRepairMapping(now);
    const demo = createDemoRepairGrant(now);
    const released = service.releaseRepair({
      proposalId: REPAIR_PROPOSAL_ID,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [demo.policy],
        grants: [demo.grant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(released.gatewayDecision?.allowed).toBe(true);
    expect(released.gatewayDecision?.outcome).toBe("ACCEPTED_PENDING");
    expect(released.acceptanceEqualsVerified).toBe(false);

    const verified = service.verifyRepair({
      proposalId: REPAIR_PROPOSAL_ID,
      nowIso: now,
    });
    expect(verified.canaryPassed).toBe(true);
    expect(verified.proposal?.status).toBe("verified");
    expect(gateway.getDecision(released.gatewayDecision!.operationId)?.outcome).toBe(
      "VERIFIED",
    );
  });
});

describe("contract: live CMS NOT_WIRED", () => {
  it("does not pretend live repair is available", () => {
    expect(liveCmsRepairStub().code).toBe("NOT_WIRED");
  });
});
