import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RecoveryObservationClass,
  RecoveryRunStatus,
} from "@worksocial/domain";
import { createFileRecoveryStore } from "@worksocial/persistence";
import { createRecoveryService } from "./service.js";

describe("recovery service fixture scenarios", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-recovery-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs all scenarios and distinguishes the three classes", () => {
    const service = createRecoveryService(createFileRecoveryStore(dir));
    const result = service.runFixtureRecovery({
      nowIso: "2026-11-21T21:10:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(4);

    const byScenario = Object.fromEntries(
      result.results.map((r) => [r.run.scenarioId, r]),
    );
    expect(byScenario.host_outage_queued_work.classification).toBe(
      RecoveryObservationClass.ACTIVE_INCIDENT,
    );
    expect(byScenario.provider_outage_capability_stop.classification).toBe(
      RecoveryObservationClass.ACTIVE_INCIDENT,
    );
    expect(byScenario.stale_heartbeat_not_incident.classification).toBe(
      RecoveryObservationClass.STALE_OBSERVATION,
    );
    expect(byScenario.unknown_remote_reconcile.classification).toBe(
      RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
    );

    for (const r of result.results) {
      expect(r.run.status).toBe(RecoveryRunStatus.PASSED);
      expect(r.run.liveRecoveryVerified).toBe(false);
      expect(r.run.externalEffects).toBe("NONE");
      expect(r.run.productionActivated).toBe(false);
    }

    expect(result.classCounts.ACTIVE_INCIDENT).toBeGreaterThanOrEqual(2);
    expect(result.classCounts.STALE_OBSERVATION).toBeGreaterThanOrEqual(1);
    expect(result.classCounts.UNKNOWN_REMOTE_OUTCOME).toBeGreaterThanOrEqual(1);

    const inspection = service.inspection();
    expect(inspection.liveRecoveryClaim).toBe("NOT_RUN");
    expect(inspection.queuedWork.length).toBeGreaterThanOrEqual(1);
    expect(inspection.activeStops.length).toBeGreaterThanOrEqual(1);

    const status = service.status();
    expect(status.externalEffects).toBe("NONE");
    expect(status.liveWiring.credentialRotation).toBe("fixture");
    expect(status.liveWiring.offboarding).toBe("fixture");
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.chatgptAdsWiring).toBe("NOT_WIRED");
  });

  it("capability stop is scoped — unrelated outbound remains allowed", () => {
    const service = createRecoveryService(createFileRecoveryStore(dir));
    const result = service.runFixtureRecovery({
      scenarioId: "provider_outage_capability_stop",
      nowIso: "2026-11-21T21:11:00.000Z",
    });
    expect(result.ok).toBe(true);
    const stops = service.listCapabilityStops();
    expect(stops).toHaveLength(1);
    expect(stops[0]?.capabilityId).toBe("gbp_publish");
    expect(stops[0]?.unrelatedCapabilitiesAllowed).toBe(true);
  });
});
