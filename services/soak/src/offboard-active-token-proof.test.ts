/**
 * T-X073 soak proof — offboard ACTIVE_TOKEN residual.
 * Fixture only. ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofOffboardActiveTokenResidual } from "./offboard-active-token-proof.js";

describe("proofOffboardActiveTokenResidual (T-X073)", () => {
  it("passes with residual honesty markers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-tx073-soak-"));
    try {
      const proof = await proofOffboardActiveTokenResidual(
        dir,
        "2026-11-21T20:00:00.000Z",
      );

      expect(proof.kind).toBe(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL);
      expect(proof.passed).toBe(true);
      expect(proof.fixtureOnly).toBe(true);
      expect(proof.applyAttemptCount).toBe(1);

      const joined = proof.details.join(" | ");
      expect(joined).toMatch(/ACTIVE_TOKEN residual BLOCKED_NOT_WIRED/);
      expect(joined).toMatch(/PROVIDER_REVOKE residual BLOCKED_NOT_WIRED/);
      expect(joined).toMatch(/OFFBOARD_RESIDUAL_HONEST/);
      expect(joined).toMatch(/liveProviderRevoke=NOT_WIRED/);
      expect(joined).toMatch(/liveProviderSuccessClaimed=false/);
      expect(joined).toMatch(/externalEffects=NONE/);
      expect(joined).toMatch(/ACCEPTED≠VERIFIED/);
      expect(joined).not.toMatch(/repair_weaken|REPAIR_WEAKEN/i);
      expect(joined).not.toMatch(/repair_attempt_limit|REPAIR_ATTEMPT_LIMIT/i);
      expect(joined).not.toMatch(
        /duplicate_platform_attribution|DUPLICATE_PLATFORM/i,
      );
      expect(joined).not.toMatch(/keyboard_focus_restore/i);
      expect(joined).not.toMatch(/optimization_breaks_cta/i);
      expect(joined).not.toMatch(/T-F07|T-US-013|T-US-014/);
      expect(proof.operationId).toMatch(/^op-tx073-/);
      expect(proof.proofId).toMatch(/^proof-offboard-token-/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});