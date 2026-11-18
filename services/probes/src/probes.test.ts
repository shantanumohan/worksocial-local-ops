import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  ReconciliationStatus,
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  type CapabilityGrant,
  type StandingPolicy,
} from "@worksocial/domain";
import {
  createFileProbeStore,
  createFileProductionMappingStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import { createProbeService } from "./service.js";
import { runHttpProbe } from "./http-probe.js";
import { runDomJourneyProbe } from "./dom-journey.js";

const dirs: string[] = [];
const now = "2026-11-18T17:00:00.000Z";

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function canaryAuthority(mapping: ReturnType<typeof proveFixturePilotWritePath>) {
  const policy: StandingPolicy = {
    policyId: "pol-canary",
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
    grantId: "grant-canary",
    policyId: "pol-canary",
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

describe("probes service", () => {
  it("runs fixture HTTP and DOM probes successfully", async () => {
    const http = await runHttpProbe({
      targetId: "fixture-contact",
      mode: ProbeMode.FIXTURE,
      nowIso: now,
    });
    expect(http.verdict).toBe(ProbeVerdict.SUCCESS);

    const broken = await runHttpProbe({
      targetId: "fixture-contact-broken",
      mode: ProbeMode.FIXTURE,
      nowIso: now,
    });
    expect(broken.verdict).toBe(ProbeVerdict.FAILURE);

    const dom = await runDomJourneyProbe({
      targetId: "fixture-contact",
      mode: ProbeMode.FIXTURE,
      nowIso: now,
    });
    expect(dom.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(dom.passedStepIds.length).toBeGreaterThan(0);

    const liveDom = await runDomJourneyProbe({
      targetId: "fixture-contact",
      mode: ProbeMode.LIVE,
      nowIso: now,
    });
    expect(liveDom.verdict).toBe(ProbeVerdict.NOT_WIRED);
  });

  it("runs a fixture form-to-CRM canary with correlated receipt and learning outcome", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-canary-"));
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

    const service = createProbeService({ store: probeStore, mappingStore });
    const gateway = createActionGateway();
    const result = service.runFormCanary({
      authority: canaryAuthority(proven),
      writePathId: seeded.writePathId,
      gateway,
      nowIso: now,
    });

    expect(result.gatewayAllowed).toBe(true);
    expect(result.receipt?.correlationId).toBe(result.intent?.correlationId);
    expect(result.run.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(result.run.reconciliation?.status).toBe(ReconciliationStatus.MATCHED);
    expect(result.outcome?.fixtureOnly).toBe(true);
    expect(result.outcome?.label).toBe("SUCCESS");
    expect(result.intent?.synthetic).toBe(true);

    const mapping = mappingStore.read();
    expect(mapping.writePathOutcomes.some((o) => o.outcomeId === result.outcome?.outcomeId)).toBe(
      true,
    );
    expect(service.status().liveZohoWiring).toBe("NOT_WIRED");
    expect(service.lastEvidence()?.kind).toBe(ProbeKind.FORM_TO_CRM_CANARY);
  });

  it("fails closed on ambiguous fixture receipts and blocks retry until cleared", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-canary-amb-"));
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
    const service = createProbeService({ store: probeStore, mappingStore });

    const ambiguous = service.runFormCanary({
      authority: canaryAuthority(proven),
      writePathId: seeded.writePathId,
      nowIso: now,
      ambiguousReceipt: true,
    });
    expect(ambiguous.run.verdict).toBe(ProbeVerdict.UNKNOWN);
    expect(ambiguous.run.reconciliation?.blocksRetry).toBe(true);
    expect(ambiguous.outcome).toBeNull();
    expect(service.hasUnresolvedCanaryBlock(seeded.writePathId)).toBe(true);

    const blocked = service.runFormCanary({
      authority: canaryAuthority(proven),
      writePathId: seeded.writePathId,
      nowIso: now,
    });
    expect(blocked.gatewayCode).toBe("BLOCKS_RETRY");
    expect(blocked.gatewayAllowed).toBe(false);

    const cleared = service.runFormCanary({
      authority: canaryAuthority(proven),
      writePathId: seeded.writePathId,
      nowIso: now,
      clearUnresolvedBlock: true,
    });
    expect(cleared.run.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(cleared.receipt?.correlationId).toBe(cleared.intent?.correlationId);

    const live = service.runFormCanary({
      authority: canaryAuthority(proven),
      writePathId: seeded.writePathId,
      nowIso: now,
      liveZoho: true,
      clearUnresolvedBlock: true,
    });
    expect(live.run.verdict).toBe(ProbeVerdict.NOT_WIRED);
  });

  it("returns WRITE_PATH_MISSING for unknown writePathId without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-canary-missing-"));
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
    const service = createProbeService({ store: probeStore, mappingStore });
    const missing = service.runFormCanary({
      authority: canaryAuthority(proven),
      writePathId: "wp-does-not-exist",
      nowIso: now,
    });
    expect(missing.gatewayCode).toBe("WRITE_PATH_MISSING");
    expect(missing.run.verdict).toBe(ProbeVerdict.FAILURE);
  });

  it("rejects unknown fixture DOM targets", async () => {
    const dom = await runDomJourneyProbe({
      targetId: "fixture-typo",
      mode: ProbeMode.FIXTURE,
      nowIso: now,
    });
    expect(dom.verdict).toBe(ProbeVerdict.FAILURE);
    expect(dom.details[0]).toMatch(/Unknown fixture DOM target/);
  });

  it("denies canary without grant/read evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-canary-deny-"));
    dirs.push(dir);
    const probeStore = createFileProbeStore(dir);
    const mappingStore = createFileProductionMappingStore(dir);
    const seeded = createFixturePilotMapping(now);
    mappingStore.write(seeded.state);
    const service = createProbeService({ store: probeStore, mappingStore });

    const denied = service.runFormCanary({
      authority: canaryAuthority(seeded.state),
      writePathId: seeded.writePathId,
      nowIso: now,
    });
    expect(denied.gatewayAllowed).toBe(false);
    expect(denied.run.verdict).toBe(ProbeVerdict.FAILURE);
    expect(denied.outcome?.label).toBe("FAILURE");
  });
});
