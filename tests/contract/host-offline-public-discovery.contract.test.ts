/**
 * Contract: T-X071 host offline public discovery (O59 exclusive wipe15 deepen).
 * Tip matrix/runbook preserved — #263 does not edit catalog docs.
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live wiring NOT_WIRED. Soft-skip Ads.
 * Catalog ≤ T-X073.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HOST_OFFLINE_PUBLIC_DISCOVERY_RELATED_CASE_IDS,
  HostDiscoveryLiveness,
  PublicDiscoveryAvailability,
  PublicDiscoveryDecisionCode,
  PublicDiscoveryUnavailableReason,
  SoakProofKind,
  evaluateHostOfflinePublicDiscovery,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  here,
  "../acceptance-evidence/fixture/art-fixture-t-x071.json",
);

describe("contract: T-X071 host offline public discovery", () => {
  it("maps only HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE ↔ T-X071", () => {
    expect(expectedProofsForFixtureCase("T-X071")).toEqual([
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      ),
    ).toEqual(["T-X071"]);
    expect([...HOST_OFFLINE_PUBLIC_DISCOVERY_RELATED_CASE_IDS]).toEqual([
      "T-X071",
    ]);
    expect(expectedProofsForFixtureCase("T-X001")).toEqual([
      SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP,
    ]);
    expect(expectedProofsForFixtureCase("T-X001")).not.toContain(
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    );
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP,
      ),
    ).toEqual(["T-X001"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X003")).toEqual([
      SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION,
      ),
    ).toEqual(["T-X003"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X004")).toEqual([
      SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
      ),
    ).toEqual(["T-X004"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X002")).toEqual([
      SoakProofKind.COMPETING_SUPERVISOR_LEASE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.COMPETING_SUPERVISOR_LEASE),
    ).toEqual(expect.arrayContaining(["T-US-002", "T-X002"]));
    expect(
      mapProofToFixtureCases(SoakProofKind.COMPETING_SUPERVISOR_LEASE),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X022")).toEqual([
      SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X015")).toEqual([
      SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X021")).toEqual([
      SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X018")).toEqual([
      SoakProofKind.SELF_APPROVAL_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SELF_APPROVAL_REJECTED),
    ).not.toContain("T-X071");
    expect(
      mapProofToFixtureCases(SoakProofKind.SELF_APPROVAL_REJECTED),
    ).toEqual(expect.arrayContaining(["T-X018", "T-US-054"]));
    expect(expectedProofsForFixtureCase("T-X020")).toEqual([
      SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.UNKNOWN_REMOTE_RECONCILE),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X005")).toEqual([
      SoakProofKind.FORGED_BROWSER_ROLE_IGNORED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.FORGED_BROWSER_ROLE_IGNORED),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X006")).toEqual([
      SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X010")).toEqual([
      SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X008")).toEqual([
      SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X017")).toEqual([
      SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X012")).toEqual([
      SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X013")).toEqual([
      SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X014")).toEqual([
      SoakProofKind.CRASH_RESTART,
      SoakProofKind.JOB_CONTINUITY,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CRASH_RESTART),
    ).not.toContain("T-X071");
    expect(
      mapProofToFixtureCases(SoakProofKind.JOB_CONTINUITY),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X009")).toEqual([
      SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO),
    ).toEqual(["T-X009"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X007")).toEqual([
      SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP,
      ),
    ).toEqual(["T-X007"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X027")).toEqual([
      SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X026")).toEqual([
      SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X016")).toEqual([
      SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X019")).toEqual([
      SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
      ),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X038")).toEqual([
      SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED),
    ).toEqual(["T-X038"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED),
    ).not.toContain("T-X071");
    expect(expectedProofsForFixtureCase("T-X072")).toEqual([
      SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
      ),
    ).toEqual(["T-X072"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
      ),
    ).not.toContain("T-X071");
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(expectedProofsForFixtureCase(adsCase)).not.toContain(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      );
    }
  });

  it("greenfield I63 BIND: ONLINE claimed AVAILABLE without prior stays NO_PRIOR_UNAVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i63-contract",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("keeps fixture honesty edges (offline UNAVAILABLE; claimed AVAILABLE refused)", () => {
    const offline = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-contract-offline",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(offline.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(offline.liveProviderWiring).toBe("NOT_WIRED");
    expect(offline.externalEffects).toBe("NONE");
    expect(offline.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(offline.activeCoverageClaimed).toBe(false);
    expect(offline.inventedDiscoveryRank).toBeNull();
    expect(
      offline.reasons.some((r) => r.includes("No pretend active coverage")),
    ).toBe(true);
    expect(offline.observedAtIso).toBe("2026-11-21T18:00:00.000Z");

    const refuse = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-contract-refuse",
      surface: "public_visibility",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      claimedAvailability: PublicDiscoveryAvailability.AVAILABLE,
    });
    expect(refuse.code).toBe(
      PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED,
    );
    expect(refuse.unavailableReason).toBe(
      PublicDiscoveryUnavailableReason.HOST_OFFLINE,
    );

    const honestUnavailableClaim = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-contract-honest-claim",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      claimedAvailability: PublicDiscoveryAvailability.UNAVAILABLE,
      lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
    });
    expect(honestUnavailableClaim.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(honestUnavailableClaim.activeCoverageClaimed).toBe(false);

    const onlinePrior = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-contract-online",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      lastSuccessfulDiscoveryAtIso: "2026-11-22T12:00:00.000Z",
    });
    expect(onlinePrior.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE,
    );
    expect(onlinePrior.chatgptAdsAccess).toBe("ACCESS_BLOCKED");

    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      summary: string;
      status?: string;
    };
    expect(art.caseId).toBe("T-X071");
    expect(art.summary).toMatch(
      /proof=host_offline_public_discovery_unavailable/,
    );
    expect(art.summary).toMatch(/HOST_OFFLINE/);
    expect(art.summary).toMatch(/CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED/);
    expect(art.summary).toMatch(/HOST_ONLINE_NO_PRIOR_UNAVAILABLE/);
    expect(art.summary).toMatch(/geo_presence\+chatgpt_business\+public_visibility/);
    expect(art.summary).toMatch(/prior success ignored/i);
    expect(art.summary).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(art.summary).toMatch(/externalEffects=NONE/);
    expect(art.summary).toMatch(/liveProviderSuccessClaimed=false/);
    expect(art.summary).not.toMatch(/concurrent_final_budget/i);
    expect(art.summary).not.toMatch(/unknown_usage_cancel/i);
    expect(art.summary).not.toMatch(/unknown_remote_reconcile/i);
    expect(art.summary).not.toMatch(/WRONG_CMS/i);
    expect(art.summary).not.toMatch(/approval-wait|JOB_CONTINUITY/i);
    expect(art.summary).not.toMatch(/replay_historical/i);
    expect(art.summary).not.toMatch(/orphan_worker/i);
    expect(art.summary).not.toMatch(/stop_after_dispatch/i);
    expect(art.summary).not.toMatch(/WAITING_/);
    expect(art.summary).not.toMatch(/settle-outside/i);
    expect(art.summary).not.toMatch(/FACT_CHANGES_AFTER_REVIEW/i);
    expect(art.summary).not.toMatch(/forged_browser|FORGED_BROWSER/i);
    expect(art.summary).not.toMatch(/cross_workspace/i);
    expect(art.summary).not.toMatch(/malicious_prompt|shell.injection/i);
    expect(art.summary).not.toMatch(/cli_error_despite_exit_zero/i);
    expect(art.summary).not.toMatch(/wrong_cms_environment/i);
    expect(art.summary).not.toMatch(/disk_full_evidence/i);
    expect(art.summary).not.toMatch(/competing_supervisor/i);
    expect(art.summary).not.toMatch(/host_sleep_monitoring|coverage_gap/i);
    expect(art.summary).not.toMatch(/ENOSPC/i);
    expect(art.summary).not.toMatch(/symlink_escape/i);
    expect(art.summary).not.toMatch(/customer_data_eval_redaction/i);
    expect(art.summary).not.toMatch(/eval_no_grounding/i);
    expect(art.summary).not.toMatch(/\bsandbox\b.*\bVERIFIED\b/);
    if (art.status) {
      expect(art.status).not.toBe("VERIFIED");
    }
  });

  it("keeps fixture artifact honesty fields (proof kind; no Ads cases)", () => {
    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      environment: string;
      proofKinds: string[];
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
      redacted: boolean;
    };
    expect(art.environment).toBe("fixture");
    expect(art.proofKinds).toEqual([
      "host_offline_public_discovery_unavailable",
    ]);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.redacted).toBe(true);
    expect(expectedProofsForFixtureCase("T-F07")).not.toContain(
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    );
    expect(expectedProofsForFixtureCase("T-X074")).toEqual([]);

    const onlineNoPrior = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-contract-noprior",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(onlineNoPrior.code).toBe(
      PublicDiscoveryDecisionCode.HOST_ONLINE_NO_PRIOR_UNAVAILABLE,
    );
    expect(onlineNoPrior.surface).toBe("chatgpt_business");
    expect(onlineNoPrior.externalEffects).toBe("NONE");
    expect(onlineNoPrior.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("wipe15 I68 ON_TIP: geo_presence ONLINE+prior stays AVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i68-contract-geo",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      lastSuccessfulDiscoveryAtIso: "2026-11-22T11:00:00.000Z",
    });
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.surface).toBe("geo_presence");
    expect(obs.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("wipe15 I69 ON_TIP: chatgpt_business ONLINE+prior AVAILABLE (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i69-contract-chatgpt",
      surface: "chatgpt_business",
      hostLiveness: HostDiscoveryLiveness.ONLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      lastSuccessfulDiscoveryAtIso: "2026-11-22T12:30:00.000Z",
    });
    expect(obs.code).toBe(PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE);
    expect(obs.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("wipe15 I70 ON_TIP: OFFLINE geo ignores prior (T-X071)", () => {
    const obs = evaluateHostOfflinePublicDiscovery({
      observationId: "obs-i70-contract-geo-off",
      surface: "geo_presence",
      hostLiveness: HostDiscoveryLiveness.OFFLINE,
      nowIso: "2026-11-21T18:00:00.000Z",
      lastSuccessfulDiscoveryAtIso: "2026-11-22T09:00:00.000Z",
    });
    expect(obs.code).toBe(
      PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
    );
    expect(obs.activeCoverageClaimed).toBe(false);
  });
});