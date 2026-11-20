import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActionClass,
  LeadCaptureJourneyStatus,
  LocalRole,
  OperatingMode,
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createFileLeadCaptureStore } from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createLeadCaptureService } from "./service.js";

const dirs: string[] = [];
const now = "2026-11-20T16:00:00.000Z";

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function authority(mapping: ReturnType<typeof proveFixturePilotWritePath>) {
  const policy: StandingPolicy = {
    policyId: "pol-lc-test",
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
    grantId: "grant-lc-test",
    policyId: "pol-lc-test",
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

describe("lead-capture service", () => {
  it("runs browser→CRM→verify→cleanup and excludes synthetic from commerce", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-lc-"));
    dirs.push(dir);
    const store = createFileLeadCaptureStore(dir);
    const service = createLeadCaptureService(store, {
      gateway: createActionGateway(),
    });
    const seeded = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(
      seeded.state,
      seeded.writePathId,
      now,
    );

    const { journey, details } = await service.runJourney({
      authority: authority(proven),
      nowIso: now,
    });

    expect(journey.status).toBe(LeadCaptureJourneyStatus.CLEANED);
    expect(journey.commercialExcluded).toBe(true);
    expect(journey.artifactRefs.screenshotId).toBeTruthy();
    expect(journey.artifactRefs.traceId).toBeTruthy();
    expect(journey.fieldVerifyPassed).toBe(true);
    expect(journey.cleanup.status).toBe("done");
    expect(journey.durableOperationId).toBeTruthy();
    expect(details.some((d) => d.includes("VERIFIED") || d.includes("ACCEPTED_PENDING"))).toBe(
      true,
    );

    const status = service.status();
    expect(status.lastSuccess?.correlationId).toBe(journey.correlationId);
    expect(status.commerce.leadCount).toBe(0);
    expect(status.commerce.syntheticExcludedCount).toBe(1);
    expect(status.liveZohoWiring).toBe("NOT_WIRED");
    expect(status.r1CompleteClaim).toBe(false);
  });

  it("opens incident on delivery failure and recovers without weakening tests", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-lc-fail-"));
    dirs.push(dir);
    const store = createFileLeadCaptureStore(dir);
    const service = createLeadCaptureService(store, {
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
    expect(failed.journey.status).toBe(LeadCaptureJourneyStatus.FAILED);
    expect(failed.journey.currentFailure?.stage).toBe("crm_write");

    const recovered = await service.runBoundedRepairRecovery({
      journeyId: failed.journey.journeyId,
      authority: authority(proven),
      nowIso: "2026-11-20T16:05:00.000Z",
      attemptWeakenTest: true,
    });
    expect(recovered.weakenTestBlocked).toBe(true);
    expect(recovered.ok).toBe(true);
    expect(recovered.journey?.status).toBe(LeadCaptureJourneyStatus.RECOVERED);
    expect(recovered.journey?.repair?.state).toBe("verified_recovered");
  });
});
