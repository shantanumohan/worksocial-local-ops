/**
 * E2E-lite (offline): HTTP → DOM → form-to-CRM canary → learning ledger.
 * No live network / Zoho. Catalog cases remain NOT_RUN for product acceptance.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  ProbeKind,
  ProbeVerdict,
  createFixturePilotMapping,
  listWritePathOutcomesForLearning,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import {
  createFileProbeStore,
  createFileProductionMappingStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createProbeService } from "@worksocial/probes";

const dirs: string[] = [];
const now = "2026-11-18T19:00:00.000Z";

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("e2e-lite: monitoring journey", () => {
  it("runs HTTP + DOM + fixture canary and records fixtureOnly learning outcomes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-e2e-lite-"));
    dirs.push(dir);
    const probeStore = createFileProbeStore(dir);
    const mappingStore = createFileProductionMappingStore(dir);
    const seeded = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(
      seeded.state,
      seeded.writePathId,
      now,
    );
    mappingStore.write(proven);

    const policy: StandingPolicy = {
      policyId: "pol-e2e",
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
      grantId: "grant-e2e",
      policyId: "pol-e2e",
      targetAccountId: "acct-fixture-canary",
      allowedOperations: ["submit_form_canary"],
      allowedAssetScope: ["page-contact"],
      contentRevisionBound: null,
      rateLimitPerHour: null,
      expiresAtIso: null,
      revoked: false,
      createdAtIso: now,
    };

    const service = createProbeService({ store: probeStore, mappingStore });
    const http = await service.runHttp({ nowIso: now });
    const dom = await service.runDom({ nowIso: now });
    const canary = service.runFormCanary({
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [policy],
        grants: [grant],
        productionMapping: mappingStore.read(),
      },
      writePathId: seeded.writePathId,
      gateway: createActionGateway(),
      nowIso: now,
    });

    expect(http.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(dom.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(canary.run.kind).toBe(ProbeKind.FORM_TO_CRM_CANARY);
    expect(canary.run.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(canary.receipt?.synthetic).toBe(true);

    const forLearningDefault = listWritePathOutcomesForLearning(
      mappingStore.read(),
    );
    // fixtureOnly excluded from default training projection
    expect(forLearningDefault).toHaveLength(0);
    const withFixture = listWritePathOutcomesForLearning(mappingStore.read(), {
      includeFixture: true,
    });
    expect(withFixture.some((o) => o.label === "SUCCESS")).toBe(true);
    expect(service.status().liveZohoWiring).toBe("NOT_WIRED");
  });
});
