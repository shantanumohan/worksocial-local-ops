/**
 * Contract: T-X073 offboard ACTIVE_TOKEN residual (O81 continue @ b106092f HOLD).
 * Catalog ceiling T-X073. ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED.
 * Soft-skip Ads. Does not edit catalog docs. Exclusive elsewhere: #343 Slot S.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ResidualObligationStatus,
  SoakProofKind,
  assertOffboardActiveTokenResidualHonest,
  assertOffboardActiveTokenResidualReclaimIdempotent,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  reclaimOffboardActiveTokenResidual,
  SOAK_FIXTURE_CASE_IDS,
} from "@worksocial/domain";

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  here,
  "../acceptance-evidence/fixture/art-fixture-t-x073.json",
);

describe("contract: T-X073 offboard ACTIVE_TOKEN residual", () => {
  it("maps only OFFBOARD_ACTIVE_TOKEN_RESIDUAL ↔ T-X073", () => {
    expect(expectedProofsForFixtureCase("T-X073")).toEqual([
      SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);
    expect(expectedProofsForFixtureCase("T-X043")).toEqual([
      SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X057")).toEqual([
      SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED),
    ).toContain("T-X057");
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED),
    ).not.toContain("T-X073");
    expect(expectedProofsForFixtureCase("T-X058")).toEqual([
      SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED),
    ).toContain("T-X058");
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED),
    ).not.toContain("T-X073");
    expect(expectedProofsForFixtureCase("T-X059")).toEqual([
      SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
      ),
    ).toContain("T-X059");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
      ),
    ).not.toContain("T-X073");
    expect(expectedProofsForFixtureCase("T-X061")).toEqual([
      SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
      ),
    ).toContain("T-X061");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
      ),
    ).not.toContain("T-X073");
    expect(expectedProofsForFixtureCase("T-X064")).toEqual([
      SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
      ),
    ).toContain("T-X064");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X064");
    expect(expectedProofsForFixtureCase("T-X065")).toEqual([
      SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
      ),
    ).toContain("T-X065");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X065");
    expect(expectedProofsForFixtureCase("T-X066")).toEqual([
      SoakProofKind.BACKUP_OMIT_RECEIPT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).toContain("T-X066");
    expect(
      mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X066");
    expect(expectedProofsForFixtureCase("T-X063")).toEqual([
      SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).toContain("T-X063");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X063");
    expect(expectedProofsForFixtureCase("T-X067")).toEqual([
      SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
      ),
    ).toContain("T-X067");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X067");
    expect(expectedProofsForFixtureCase("T-X068")).toEqual([
      SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED),
    ).toContain("T-X068");
    expect(
      mapProofToFixtureCases(SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X068");
    expect(expectedProofsForFixtureCase("T-X062")).toEqual([
      SoakProofKind.SSE_GAP_FULL_STATE_RESYNC,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SSE_GAP_FULL_STATE_RESYNC),
    ).toContain("T-X062");
    expect(
      mapProofToFixtureCases(SoakProofKind.SSE_GAP_FULL_STATE_RESYNC),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X062");
    expect(expectedProofsForFixtureCase("T-X069")).toEqual([
      SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA),
    ).toContain("T-X069");
    expect(
      mapProofToFixtureCases(SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X069");
    expect(expectedProofsForFixtureCase("T-X070")).toEqual([
      SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).toContain("T-X070");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X071")).toEqual([
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      ),
    ).toContain("T-X071");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X072")).toEqual([
      SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS),
    ).toContain("T-X072");
    expect(
      mapProofToFixtureCases(SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X072");
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(expectedProofsForFixtureCase(adsCase)).not.toContain(
        SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
      );
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }
  });

  it("requires BLOCKED_NOT_WIRED residuals and fixture honesty", () => {
    const honestManifest = {
      offboardId: "ob-fixture",
      connectionId: "conn-fixture",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 incomplete until live revoke; ACCEPTED≠VERIFIED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.code).toBe("OFFBOARD_RESIDUAL_HONEST");
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");

    const dishonest = assertOffboardActiveTokenResidualHonest({
      ...honestManifest,
      liveProviderRevoke: "WIRED",
    });
    expect(dishonest.ok).toBe(false);
    expect(dishonest.code).toBe("OFFBOARD_RESIDUAL_DISHONEST");

    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      summary: string;
      proofKinds: string[];
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
    };
    expect(art.caseId).toBe("T-X073");
    expect(art.proofKinds).toEqual(["offboard_active_token_residual"]);
    expect(art.summary).toMatch(/ACTIVE_TOKEN residual BLOCKED_NOT_WIRED/);
    expect(art.summary).toMatch(/PROVIDER_REVOKE residual BLOCKED_NOT_WIRED/);
    expect(art.summary).toMatch(/OFFBOARD_RESIDUAL_HONEST/);
    expect(art.summary).toMatch(/ACCEPTED≠VERIFIED|ACCEPTED.*VERIFIED/);
    expect(art.summary).toMatch(/liveProviderRevoke=NOT_WIRED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).not.toMatch(
      /repair_weaken|REPAIR_WEAKEN_TEST_REJECTED/i,
    );
    expect(art.summary).not.toMatch(
      /repair_attempt_limit|REPAIR_ATTEMPT_LIMIT/i,
    );
    expect(art.summary).not.toMatch(
      /duplicate_platform_attribution|DUPLICATE_PLATFORM/i,
    );
    expect(art.summary).not.toMatch(
      /keyboard_focus_restore|KEYBOARD_FOCUS_RESTORE/i,
    );
    expect(art.summary).not.toMatch(/optimization_breaks_cta|JOURNEY_REGRESSION/i);
    expect(art.summary).not.toMatch(
      /ssrf_redirect_dns_rebind|SSRF_REDIRECT_DNS_REBIND/i,
    );
    expect(art.summary).not.toMatch(
      /worker_browser_auth_state_os_denied|WORKER_BROWSER_AUTH_STATE/i,
    );
    expect(art.summary).not.toMatch(/backup_omit_receipt|BACKUP_OMIT_RECEIPT/i);
    expect(art.summary).not.toMatch(
      /indirect_prompt_injection_exfil|INDIRECT_PROMPT_INJECTION/i,
    );
    expect(art.summary).not.toMatch(
      /incompatible_workflow_upgrade|INCOMPATIBLE_WORKFLOW_UPGRADE/i,
    );
    expect(art.summary).not.toMatch(
      /thirty_alerts_one_outage|THIRTY_ALERTS_ONE_OUTAGE/i,
    );
    expect(art.summary).not.toMatch(/sse_gap_full_state_resync|SSE_GAP_FULL_STATE/i);
    expect(art.summary).not.toMatch(
      /imported_doc_quarantined|IMPORTED_DOC_QUARANTINED/i,
    );
    expect(art.summary).not.toMatch(
      /validated_payload_not_collected|VALIDATED_PAYLOAD_NOT_COLLECTED/i,
    );
    expect(art.summary).not.toMatch(
      /host_offline_public_discovery|HOST_OFFLINE_PUBLIC_DISCOVERY/i,
    );
    expect(art.summary).not.toMatch(
      /customer_data_eval_redaction|CUSTOMER_DATA_EVAL_REDACTION/i,
    );
    expect(art.summary).not.toMatch(/T-F07|T-US-013|T-US-014/);
    expect(art.summary).toMatch(
      /I17 edges:.*sandbox VERIFIED.*dishonest/i,
    );
  });

  it("promoted-315 SOLE exclusive: T-X073 registered in soak fixture catalog", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X073");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X072");
    expect(expectedProofsForFixtureCase("T-X073")).toEqual([
      SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
    ]);
  });

  it("continue HOLD: NO_DUPLICATE_EFFECTS stays unmapped from T-X073 ceiling", () => {
    expect(
      mapProofToFixtureCases(SoakProofKind.NO_DUPLICATE_EFFECTS),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);
  });

  it("retip-316 continue HOLD: T-X057/T-X058 repair proofs stay off T-X073 ceiling", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X057");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X058");
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED),
    ).not.toContain("T-X073");
  });

  it("O55 edge-deepen HOLD: reclaim idempotent; pool ≤ T-X073; exclusive #317 unclaimed", () => {
    const honestManifest = {
      offboardId: "ob-o55",
      connectionId: "conn-o55",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O55 reclaim; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
    expect(reclaim.liveProviderRevoke).toBe("NOT_WIRED");
    expect(reclaim.externalEffects).toBe("NONE");
    expect(r1.priorLiveRevokeInvented).toBe(false);
    expect(r1.honesty.ok).toBe(true);

    // Pool ceiling ≤ T-X073 — never invent T-X074+.
    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X075");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    // Exclusive #317 Slot P owns T-X058 — Slot O does not claim.
    expect(expectedProofsForFixtureCase("T-X058")).toEqual([
      SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED,
    ]);
    expect(expectedProofsForFixtureCase("T-X058")).not.toContain(
      SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
    );
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X058");

    // Soft-skip Ads remain off T-X073 residual mapping.
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }
  });

  it("retip-317 continue HOLD: T-X059 attribution off T-X073; exclusive #318 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X059");
    expect(expectedProofsForFixtureCase("T-X059")).toEqual([
      SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X059");
  });

  it("retip-318 continue HOLD: T-X060 currency/timezone off T-X073; exclusive #319 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X060");
    expect(expectedProofsForFixtureCase("T-X060")).toEqual([
      SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X060");
  });

  it("retip-319 continue HOLD: T-X061 keyboard focus off T-X073; exclusive #320 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X061");
    expect(expectedProofsForFixtureCase("T-X061")).toEqual([
      SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X061");
  });

  it("retip-320 continue HOLD: T-X062 SSE resync off T-X073; exclusive #321 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X062");
    expect(expectedProofsForFixtureCase("T-X062")).toEqual([
      SoakProofKind.SSE_GAP_FULL_STATE_RESYNC,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SSE_GAP_FULL_STATE_RESYNC),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X062");
  });

  it("retip-321 continue HOLD: T-X063 prompt-injection off T-X073; exclusive #322 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X063");
    expect(expectedProofsForFixtureCase("T-X063")).toEqual([
      SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X063");
  });

  it("O61 tip-moved-322 HOLD: T-X064 SSRF off T-X073; exclusive #323 unclaimed; residual sole", () => {
    // Exclusive #323 Slot D owns T-X064 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X064");
    expect(expectedProofsForFixtureCase("T-X064")).toEqual([
      SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X064");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // Soft-skip Ads + NONE/NOT_WIRED reclaim honesty.
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }
    const honestManifest = {
      offboardId: "ob-o61",
      connectionId: "conn-o61",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O61; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O62 tip-moved-323 HOLD: T-X065 browser-auth off T-X073; exclusive #324 unclaimed; residual sole", () => {
    // Exclusive #324 Slot M owns T-X065 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X065");
    expect(expectedProofsForFixtureCase("T-X065")).toEqual([
      SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X065");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // Soft-skip Ads remain off residual mapping.
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }
  });

  it("retip-324 continue HOLD: T-X066 backup omit off T-X073; exclusive #325 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X066");
    expect(expectedProofsForFixtureCase("T-X066")).toEqual([
      SoakProofKind.BACKUP_OMIT_RECEIPT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X066");
  });

  it("retip-325 continue HOLD: T-X067 workflow upgrade off T-X073; exclusive #326 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X067");
    expect(expectedProofsForFixtureCase("T-X067")).toEqual([
      SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X067");
  });

  it("retip-326 continue HOLD: T-X068 thirty-alerts off T-X073; exclusive #327 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X068");
    expect(expectedProofsForFixtureCase("T-X068")).toEqual([
      SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X068");
  });

  it("retip-327 continue HOLD: T-X069 imported doc off T-X073; exclusive #328 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X069");
    expect(expectedProofsForFixtureCase("T-X069")).toEqual([
      SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X069");
  });

  it("retip-328 continue HOLD: T-X070 validated-payload off T-X073; exclusive #329 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X070")).toEqual([
      SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X070");
  });

  it("retip-329 continue HOLD: T-X071 host-offline off T-X073; exclusive #330 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X071")).toEqual([
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X071");
  });

  it("retip-330 continue HOLD: T-X072 eval-redaction off T-X073; exclusive #331 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X072");
    expect(expectedProofsForFixtureCase("T-X072")).toEqual([
      SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X072");
  });

  it("promoted-332 SOLE exclusive: post-#331 pool ceiling; OFFBOARD_ACTIVE_TOKEN_RESIDUAL ↔ T-X073 only", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);
    expect(expectedProofsForFixtureCase("T-X073")).toEqual([
      SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS),
    ).not.toContain("T-X073");
  });

  it("O71 tip-moved-332 continue HOLD: T-X057 repair-weaken off T-X073; exclusive #333 unclaimed; residual sole", () => {
    // Exclusive #333 Slot K owns T-X057 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X057");
    expect(expectedProofsForFixtureCase("T-X057")).toEqual([
      SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X057");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o71",
      connectionId: "conn-o71",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O71 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("retip-333 continue HOLD: T-X058 repair-limit off T-X073; exclusive #334 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X058");
    expect(expectedProofsForFixtureCase("T-X058")).toEqual([
      SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X058");
  });

  it("retip-334 continue HOLD: T-X059 dup-attribution off T-X073; exclusive #335 unclaimed", () => {
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X059");
    expect(expectedProofsForFixtureCase("T-X059")).toEqual([
      SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X059");
  });

  it("O74 tip-moved-335 continue HOLD: T-X060 currency/tz off T-X073; exclusive #336 unclaimed; residual sole", () => {
    // Exclusive #336 Slot G owns T-X060 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X060");
    expect(expectedProofsForFixtureCase("T-X060")).toEqual([
      SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X060");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X059 now on tip via #335 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X059");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
      ),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o74",
      connectionId: "conn-o74",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O74 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O75 tip-moved-336 continue HOLD: T-X061 keyboard-focus off T-X073; exclusive #337 unclaimed; residual sole", () => {
    // Exclusive #337 Slot T owns T-X061 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X061");
    expect(expectedProofsForFixtureCase("T-X061")).toEqual([
      SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X061");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X060 now on tip via #336 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X060");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
      ),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o75",
      connectionId: "conn-o75",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O75 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O76 tip-moved-337 continue HOLD: T-X062 SSE resync off T-X073; exclusive #338 unclaimed; residual sole", () => {
    // Exclusive #338 Slot F owns T-X062 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X062");
    expect(expectedProofsForFixtureCase("T-X062")).toEqual([
      SoakProofKind.SSE_GAP_FULL_STATE_RESYNC,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SSE_GAP_FULL_STATE_RESYNC),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X062");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X061 now on tip via #337 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X061");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
      ),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o76",
      connectionId: "conn-o76",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O76 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O77 tip-moved-338 continue HOLD: T-X063 prompt-injection off T-X073; exclusive #339 unclaimed; residual sole", () => {
    // Exclusive #339 Slot R owns T-X063 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X063");
    expect(expectedProofsForFixtureCase("T-X063")).toEqual([
      SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X063");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X062 now on tip via #338 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X062");
    expect(
      mapProofToFixtureCases(SoakProofKind.SSE_GAP_FULL_STATE_RESYNC),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o77",
      connectionId: "conn-o77",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O77 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O78 tip-moved-339 continue HOLD: T-X064 SSRF off T-X073; exclusive #340 unclaimed; residual sole", () => {
    // Exclusive #340 Slot D owns T-X064 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X064");
    expect(expectedProofsForFixtureCase("T-X064")).toEqual([
      SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X064");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X063 now on tip via #339 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X063");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o78",
      connectionId: "conn-o78",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O78 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O79 tip-moved-340 continue HOLD: T-X065 browser-auth off T-X073; exclusive #341 unclaimed; residual sole", () => {
    // Exclusive #341 Slot M owns T-X065 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X065");
    expect(expectedProofsForFixtureCase("T-X065")).toEqual([
      SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X065");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X064 now on tip via #340 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X064");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
      ),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o79",
      connectionId: "conn-o79",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O79 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O80 tip-moved-341 continue HOLD: T-X066 backup-omit off T-X073; exclusive #342 unclaimed; residual sole", () => {
    // Exclusive #342 Slot L owns T-X066 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X066");
    expect(expectedProofsForFixtureCase("T-X066")).toEqual([
      SoakProofKind.BACKUP_OMIT_RECEIPT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X066");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X065 now on tip via #341 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X065");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
      ),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o80",
      connectionId: "conn-o80",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O80 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });

  it("O81 tip-moved-342 continue HOLD: T-X067 workflow-upgrade off T-X073; exclusive #343 unclaimed; residual sole", () => {
    // Exclusive #343 Slot S owns T-X067 — Slot O does not claim.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X067");
    expect(expectedProofsForFixtureCase("T-X067")).toEqual([
      SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
      ),
    ).not.toContain("T-X073");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).not.toContain("T-X067");
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);

    // T-X066 now on tip via #342 — still off residual mapping.
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X066");
    expect(
      mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).not.toContain("T-X073");

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const m = /^T-X(\d+)$/.exec(id);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(73);
      }
    }

    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(
        mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
      ).not.toContain(adsCase);
    }

    const honestManifest = {
      offboardId: "ob-o81",
      connectionId: "conn-o81",
      revokedLocally: true,
      auditRetained: true,
      schedulesDisabled: true,
      secretsExported: false,
      catalogClaim: "NOT_RUN" as const,
      liveProviderRevoke: "NOT_WIRED" as const,
      externalEffects: "NONE" as const,
      productionActivated: false,
      summary: "T-X073 O81 continue; ACCEPTED≠VERIFIED; NONE/NOT_WIRED",
      residualObligations: [
        {
          kind: "ACTIVE_TOKEN" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "provider token may still be active",
        },
        {
          kind: "PROVIDER_REVOKE" as const,
          status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
          summary: "live revoke not wired",
        },
      ],
    };
    const honesty = assertOffboardActiveTokenResidualHonest(honestManifest);
    expect(honesty.ok).toBe(true);
    expect(honesty.liveProviderRevoke).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    const r1 = reclaimOffboardActiveTokenResidual(honestManifest);
    const r2 = reclaimOffboardActiveTokenResidual(honestManifest);
    const reclaim = assertOffboardActiveTokenResidualReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(reclaim.ok).toBe(true);
    expect(reclaim.code).toBe("OFFBOARD_RECLAIM_IDEMPOTENT");
  });
});
