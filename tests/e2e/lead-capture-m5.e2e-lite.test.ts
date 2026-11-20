/**
 * E2E-lite (offline): browser harness → fixture CRM → verify → cleanup;
 * failure → incident → repair → verify. Not browser product acceptance.
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
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import { createFileLeadCaptureStore } from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  createLeadCaptureService,
  runBrowserFormSubmit,
} from "@worksocial/lead-capture";

const dirs: string[] = [];
const now = "2026-11-20T18:00:00.000Z";

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("e2e-lite: M5 lead capture journey", () => {
  it("proves browser artifact refs and full recovery path", async () => {
    const browser = await runBrowserFormSubmit({
      correlationId: "corr-e2e",
      fieldValues: {
        Email: "canary+corr-e2e@worksocial.test.local",
        Last_Name: "Canary corr-e2e",
        ws_synthetic: "true",
        ws_correlation_id: "corr-e2e",
      },
    });
    expect(browser.ok).toBe(true);
    expect(browser.destination).toBe("fixture_test");
    expect(browser.artifactRefs.htmlSnapshotId).toBeTruthy();

    const dir = mkdtempSync(join(tmpdir(), "ws-m5-e2e-"));
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
    const policy: StandingPolicy = {
      policyId: "pol-e2e-m5",
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
      grantId: "grant-e2e-m5",
      policyId: "pol-e2e-m5",
      targetAccountId: "acct-fixture-canary",
      allowedOperations: ["submit_form_canary"],
      allowedAssetScope: ["page-contact"],
      contentRevisionBound: null,
      rateLimitPerHour: null,
      expiresAtIso: null,
      revoked: false,
      createdAtIso: now,
    };
    const auth = {
      outboundStopped: false,
      operatingMode: OperatingMode.OPERATE,
      policies: [policy],
      grants: [grant],
      productionMapping: proven,
    };

    const ok = await service.runJourney({ authority: auth, nowIso: now });
    expect(ok.journey.status).toBe(LeadCaptureJourneyStatus.CLEANED);

    const failed = await service.runJourney({
      authority: auth,
      nowIso: now,
      failDelivery: true,
    });
    const recovered = await service.runBoundedRepairRecovery({
      journeyId: failed.journey.journeyId,
      authority: auth,
      nowIso: now,
      attemptWeakenTest: true,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.weakenTestBlocked).toBe(true);
    expect(service.status().temporalWiring).toBe("NOT_WIRED");
    expect(service.status().r1CompleteClaim).toBe(false);
  });
});
