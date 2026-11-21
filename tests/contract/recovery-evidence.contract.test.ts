/**
 * Contract: WP10 / F24 recovery evidence honesty.
 * Distinguishes STALE_OBSERVATION / ACTIVE_INCIDENT / UNKNOWN_REMOTE_OUTCOME.
 * Fixture ≠ live VERIFIED. External effects NONE.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FORBIDDEN_LIVE_RECOVERY_STATUS,
  RecoveryObservationClass,
  validateLiveRecoveryClaim,
} from "@worksocial/domain";
import { createFileRecoveryStore } from "@worksocial/persistence";
import { createRecoveryService } from "@worksocial/recovery";

describe("contract: WP10 recovery evidence", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-recovery-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("separates stale observation, active incident, and unknown remote", () => {
    const service = createRecoveryService(createFileRecoveryStore(dir));
    const result = service.runFixtureRecovery({
      nowIso: "2026-11-21T21:20:00.000Z",
    });
    expect(result.ok).toBe(true);

    const classes = new Set(result.results.map((r) => r.classification));
    expect(classes.has(RecoveryObservationClass.STALE_OBSERVATION)).toBe(true);
    expect(classes.has(RecoveryObservationClass.ACTIVE_INCIDENT)).toBe(true);
    expect(classes.has(RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME)).toBe(
      true,
    );

    for (const r of result.results) {
      expect(r.run.liveRecoveryVerified).toBe(false);
      expect(r.run.liveRecoveryClaim).toBe("NOT_RUN");
      expect(r.run.externalEffects).toBe("NONE");
      expect(r.artifact.environment).toBe("fixture");
      expect(r.artifact.redacted).toBe(true);
    }

    const inspection = service.inspection();
    expect(inspection.classCounts.ACTIVE_INCIDENT).toBeGreaterThanOrEqual(1);
    expect(inspection.classCounts.STALE_OBSERVATION).toBeGreaterThanOrEqual(1);
    expect(
      inspection.classCounts.UNKNOWN_REMOTE_OUTCOME,
    ).toBeGreaterThanOrEqual(1);

    const status = service.status();
    expect(status.liveWiring.credentialRotation).toBe("fixture");
    expect(status.liveWiring.offboarding).toBe("fixture");
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.relatedCaseIds).toContain("T-F24");
  });

  it("rejects silent live VERIFIED recovery claims", () => {
    const check = validateLiveRecoveryClaim(FORBIDDEN_LIVE_RECOVERY_STATUS);
    expect(check.ok).toBe(false);
  });
});
