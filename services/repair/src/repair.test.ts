import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_REPAIR_ATTEMPTS,
  OperatingMode,
  RepairTicketStatus,
  WeakenTestOperation,
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
} from "./index.js";

const dirs: string[] = [];
const now = "2026-11-20T05:00:00.000Z";

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "ws-repair-svc-"));
  dirs.push(dir);
  const store = createFileRepairStore(dir);
  const gateway = createActionGateway();
  const service = createRepairService(store, { gateway });
  return { store, gateway, service };
}

describe("repair service", () => {
  it("inject → review → release → verify restores canary", () => {
    const { service } = harness();
    service.seedFixtures(now);
    const injected = service.injectDefect({ nowIso: now });
    expect(injected.ok).toBe(true);
    if (!injected.ok) return;
    expect(injected.canaryPassed).toBe(false);

    const reviewed = service.recordIndependentReview({
      proposalId: REPAIR_PROPOSAL_ID,
      approved: true,
      reason: "Scope and baseline intact",
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
    expect(released.proposal?.status).toBe("released_pending");
    expect(released.acceptanceEqualsVerified).toBe(false);

    const verified = service.verifyRepair({
      proposalId: REPAIR_PROPOSAL_ID,
      nowIso: now,
    });
    expect(verified.canaryPassed).toBe(true);
    expect(verified.proposal?.status).toBe("verified");
    expect(verified.outcome?.label).toBe("SUCCESS");
  });

  it("blocks weaken-test proposals at review integrity check", () => {
    const { service, store } = harness();
    service.seedFixtures(now);
    const state = store.read();
    const proposal = state.proposals[0]!;
    store.upsertProposal({
      ...proposal,
      testOperations: [WeakenTestOperation.DISABLE_TEST],
      updatedAtIso: now,
    });
    const reviewed = service.recordIndependentReview({
      proposalId: proposal.proposalId,
      approved: true,
      reason: "should not matter",
      nowIso: now,
    });
    expect(reviewed.ok).toBe(false);
    if (!reviewed.ok) {
      expect(reviewed.code).toBe("TEST_INTEGRITY_VIOLATION");
    }
  });

  it("reports live CMS as NOT_WIRED", () => {
    const stub = liveCmsRepairStub();
    expect(stub.wiring).toBe("NOT_WIRED");
    expect(stub.accepted).toBe(false);

    const { service } = harness();
    service.seedFixtures(now);
    service.recordIndependentReview({
      proposalId: REPAIR_PROPOSAL_ID,
      approved: true,
      reason: "ok",
      nowIso: now,
    });
    const { mapping } = service.seedAndProveRepairMapping(now);
    const demo = createDemoRepairGrant(now);
    const live = service.releaseRepair({
      proposalId: REPAIR_PROPOSAL_ID,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [demo.policy],
        grants: [demo.grant],
      },
      productionMapping: mapping,
      preferLive: true,
      nowIso: now,
    });
    expect(live.liveCmsRepairWiring).toBe("NOT_WIRED");
    expect(live.gatewayDecision).toBeNull();
  });

  it("exposes acceptance case ids and learning hook note", () => {
    const { service } = harness();
    const status = service.status();
    expect(status.acceptanceCaseIds).toContain("T-F21");
    expect(status.liveCmsRepairWiring).toBe("NOT_WIRED");
    expect(status.learningHookNote).toMatch(/learning-worker/i);
  });

  it("T-X058: ATTEMPT_LIMIT release refuses without recording a third attempt", () => {
    const { service, store } = harness();
    service.seedFixtures(now);
    service.recordIndependentReview({
      proposalId: REPAIR_PROPOSAL_ID,
      approved: true,
      reason: "ok",
      nowIso: now,
    });
    const state = store.read();
    const ticket = state.tickets[0]!;
    store.upsertTicket({
      ...ticket,
      attemptCount: MAX_REPAIR_ATTEMPTS,
      status: RepairTicketStatus.ESCALATED,
      updatedAtIso: now,
    });
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
    expect(released.proposal?.status).toBe("blocked");
    expect(released.gatewayDecision).toBeNull();
    expect(
      released.details.some((d) => d.includes("ATTEMPT_LIMIT")),
    ).toBe(true);
    const after = store.read();
    const nextTicket = after.tickets.find((t) => t.ticketId === ticket.ticketId)!;
    expect(nextTicket.attemptCount).toBe(MAX_REPAIR_ATTEMPTS);
    expect(nextTicket.status).toBe(RepairTicketStatus.ESCALATED);
    expect(after.attempts.filter((a) => a.ticketId === ticket.ticketId)).toHaveLength(
      0,
    );
  });
});
