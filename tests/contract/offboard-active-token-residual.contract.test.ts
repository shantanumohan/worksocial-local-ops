/**
 * Contract: T-X073 offboard ACTIVE_TOKEN residual (O52 retip c5d1a31d promoted-315 SOLE exclusive).
 * Catalog ceiling T-X073. ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED.
 * Soft-skip Ads. Does not edit catalog docs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ResidualObligationStatus,
  SoakProofKind,
  assertOffboardActiveTokenResidualHonest,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
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
});