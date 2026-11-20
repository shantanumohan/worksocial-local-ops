/**
 * Contract: M5 / NEXT-16 — delivery failure → incident → bounded repair
 * cannot weaken protected tests; cleanup excludes synthetic from commerce.
 * Catalog refs T-F20 / T-F21 / T-US-020 — not product VERIFIED.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActionClass,
  LeadCaptureJourneyStatus,
  LocalRole,
  OperatingMode,
  WeakenTestOperation,
  createFixturePilotMapping,
  createRepairProposal,
  createRepairTicket,
  createIncident,
  digestTestBaseline,
  evaluateProtectedPathGate,
  evaluateTestIntegrityGate,
  IncidentSeverity,
  RepairClass,
  RepairPatchOp,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createFileLeadCaptureStore } from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createLeadCaptureService } from "@worksocial/lead-capture";

const dirs: string[] = [];
const now = "2026-11-20T17:00:00.000Z";

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function authority(mapping: ReturnType<typeof proveFixturePilotWritePath>) {
  const policy: StandingPolicy = {
    policyId: "pol-m5-contract",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "owned-site",
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    allowedAssetScope: ["page-contact"],
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: now,
  };
  const grant: CapabilityGrant = {
    grantId: "grant-m5-contract",
    policyId: "pol-m5-contract",
    targetAccountId: "acct-fixture-canary",
    allowedOperations: ["submit_form_canary"],
    allowedAssetScope: ["page-contact"],
    contentRevisionBound: null,
    rateLimitPerHour: null,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: now,
  };
  return {
    outboundStopped: false,
    operatingMode: OperatingMode.OPERATE,
    policies: [policy],
    grants: [grant],
    productionMapping: mapping,
  };
}

describe("contract: M5 lead capture + bounded repair", () => {
  it("completes happy path with cleanup and zero commerce pollution", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-m5-ok-"));
    dirs.push(dir);
    const service = createLeadCaptureService(createFileLeadCaptureStore(dir), {
      gateway: createActionGateway(),
    });
    const seeded = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(
      seeded.state,
      seeded.writePathId,
      now,
    );
    const { journey } = await service.runJourney({
      authority: authority(proven),
      nowIso: now,
    });
    expect(journey.status).toBe(LeadCaptureJourneyStatus.CLEANED);
    expect(journey.submission?.synthetic).toBe(true);
    expect(journey.crmReceipt?.synthetic).toBe(true);
    expect(service.status().commerce.leadCount).toBe(0);
    expect(service.status().acceptanceCaseIds).toContain("T-F20");
  });

  it("blocks weaken-test proposals and recovers after delivery failure", async () => {
    const baseline = digestTestBaseline("probe-form-crm-canary", [
      "crm_receipt_present",
    ]);
    const incident = createIncident({
      incidentId: "inc-contract",
      title: "fail",
      summary: "fail",
      severity: IncidentSeverity.P1,
      assetId: "page-contact",
      siteId: "worksocial-pilot",
      failingProbeId: "j1",
      businessImpact: "leads",
      fixtureOnly: true,
      createdAtIso: now,
    });
    const ticket = createRepairTicket({
      ticketId: "tkt-contract",
      incident,
      repairClass: RepairClass.IDEMPOTENT_RETRY,
      worktreeRef: "wt",
      sourceRevision: "rev",
      fixtureOnly: true,
      createdAtIso: now,
    });
    const weakened = createRepairProposal({
      proposalId: "prop-weak",
      ticket,
      authorRoleId: "A24",
      title: "weaken",
      summary: "bad",
      patches: [
        {
          path: "tests/contract/form-crm-canary.contract.test.ts",
          op: RepairPatchOp.REPLACE_FIELD,
          before: "x",
          after: "y",
        },
      ],
      testOperations: [WeakenTestOperation.DISABLE_TEST],
      regressionProbeId: "probe-form-crm-canary",
      testBaselineDigest: baseline,
      proposedTestBaselineDigest: "mutated",
      fixtureOnly: true,
      createdAtIso: now,
    });
    expect(evaluateTestIntegrityGate(weakened).allowed).toBe(false);
    expect(evaluateProtectedPathGate(weakened).allowed).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "ws-m5-rec-"));
    dirs.push(dir);
    const service = createLeadCaptureService(createFileLeadCaptureStore(dir), {
      gateway: createActionGateway(),
    });
    const seeded = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(
      seeded.state,
      seeded.writePathId,
      now,
    );
    const failed = await service.runJourney({
      authority: authority(proven),
      nowIso: now,
      failDelivery: true,
    });
    const recovered = await service.runBoundedRepairRecovery({
      journeyId: failed.journey.journeyId,
      authority: authority(proven),
      nowIso: now,
      attemptWeakenTest: true,
    });
    expect(recovered.weakenTestBlocked).toBe(true);
    expect(recovered.ok).toBe(true);
    expect(recovered.journey?.status).toBe(LeadCaptureJourneyStatus.RECOVERED);
    expect(service.status().acceptanceCaseIds).toContain("T-F21");
  });
});
