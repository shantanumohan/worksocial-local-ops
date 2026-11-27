/**
 * Contract: T-X070 validated payload separate failure states (O37 retip b827c6c2).
 * Tip matrix/runbook preserved — does not edit catalog docs.
 * ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED. Soft-skip Ads.
 * Catalog ≤ T-X073.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  VALIDATED_PAYLOAD_COLLECTION_RELATED_CASE_IDS,
  evaluateValidatedPayloadCollection,
  fixtureWebhookSignature,
  SoakProofKind,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  here,
  "../acceptance-evidence/fixture/art-fixture-t-x070.json",
);

describe("contract: T-X070 validated payload collection", () => {
  it("maps only VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES ↔ T-X070", () => {
    expect(expectedProofsForFixtureCase("T-X070")).toEqual([
      SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).toEqual(["T-X070"]);
    expect([...VALIDATED_PAYLOAD_COLLECTION_RELATED_CASE_IDS]).toEqual([
      "T-X070",
    ]);
    expect(expectedProofsForFixtureCase("T-X071")).not.toContain(
      SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    );
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      ),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X029")).toEqual([
      SoakProofKind.EXPLICIT_ACCOUNT_REBIND,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EXPLICIT_ACCOUNT_REBIND),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X032")).toEqual([
      SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X030")).toEqual([
      SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
      ),
    ).toEqual(["T-X030"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
      ),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X046")).toEqual([
      SoakProofKind.UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION,
      ),
    ).toEqual(["T-X046"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION,
      ),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X039")).toEqual([
      SoakProofKind.METRIC_DENOMINATORS_HONEST,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.METRIC_DENOMINATORS_HONEST),
    ).toEqual(expect.arrayContaining(["T-X039", "T-US-058"]));
    expect(
      mapProofToFixtureCases(SoakProofKind.METRIC_DENOMINATORS_HONEST),
    ).not.toContain("T-X070");
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(expectedProofsForFixtureCase(adsCase)).not.toContain(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      );
    }
    expect(expectedProofsForFixtureCase("T-X011")).toEqual([
      SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X037")).toEqual([
      SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN),
    ).toEqual(expect.arrayContaining(["T-US-018", "T-X037"]));
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X038")).toEqual([
      SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X041")).toEqual([
      SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X042")).toEqual([
      SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X043")).toEqual([
      SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X016")).toEqual([
      SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION),
    ).toEqual(["T-X016"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X054")).toEqual([
      SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND),
    ).toEqual(["T-X054"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X033")).toEqual([
      SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO),
    ).toEqual(expect.arrayContaining(["T-US-010", "T-X033"]));
    expect(
      mapProofToFixtureCases(SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X040")).toEqual([
      SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
      ),
    ).toEqual(["T-X040"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
      ),
    ).not.toContain("T-X070");
    expect(expectedProofsForFixtureCase("T-X012")).toEqual([
      SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED),
    ).toEqual(["T-X012"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED),
    ).not.toContain("T-X070");
  });

  it("keeps VALIDATION_FAILED distinct from COLLECTION_FAILED", () => {
    const secret = "contract-fixture-secret";
    const body = JSON.stringify({ eventId: "evt-contract", kind: "lead.created" });
    const goodSig = fixtureWebhookSignature(body, secret);

    const collected = evaluateValidatedPayloadCollection({
      payload: { eventId: "evt-contract", body, signatureHex: goodSig },
      secret,
      collect: () => ({ ok: true, recordId: "rec-1" }),
    });
    expect(collected.code).toBe("COLLECTED");
    expect(collected.validated).toBe(true);
    expect(collected.collected).toBe(true);
    expect(collected.liveProviderWiring).toBe("NOT_WIRED");
    expect(collected.externalEffects).toBe("NONE");
    expect(collected.chatgptAdsAccess).toBe("ACCESS_BLOCKED");

    const validationFailed = evaluateValidatedPayloadCollection({
      payload: { eventId: "evt-contract", body, signatureHex: "ab".repeat(32) },
      secret,
      collect: () => ({ ok: true, recordId: "rec-1" }),
    });
    expect(validationFailed.code).toBe("VALIDATION_FAILED");
    expect(validationFailed.collectionAttempted).toBe(false);
    expect(validationFailed.validated).toBe(false);
    expect(validationFailed.collected).toBe(false);

    const collectionFailed = evaluateValidatedPayloadCollection({
      payload: { eventId: "evt-contract", body, signatureHex: goodSig },
      secret,
      collect: () => ({ ok: true, recordId: "" }),
    });
    expect(collectionFailed.code).toBe("COLLECTION_FAILED");
    expect(collectionFailed.validated).toBe(true);
    expect(collectionFailed.collected).toBe(false);
    expect(validationFailed.code).not.toBe(collectionFailed.code);

    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      summary: string;
      proofKinds: string[];
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
    };
    expect(art.caseId).toBe("T-X070");
    expect(art.proofKinds).toEqual([
      "validated_payload_not_collected_separate_states",
    ]);
    expect(art.summary).toMatch(/VALIDATION_FAILED/);
    expect(art.summary).toMatch(/COLLECTION_FAILED/);
    expect(art.summary).toMatch(/validated_payload_not_collected_separate_states/);
    expect(art.summary).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(art.summary).toMatch(/externalEffects=NONE/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).not.toMatch(/HOST_OFFLINE|host_offline_public_discovery/i);
    expect(art.summary).not.toMatch(/explicit_account_rebind/i);
    expect(art.summary).not.toMatch(/ga4_debug|GA4_DEBUG/i);
    expect(art.summary).not.toMatch(/rate_limit_bounded|bounded_backoff/i);
    expect(art.summary).not.toMatch(/unsupported_blog|fake_publication/i);
    expect(art.summary).not.toMatch(/metric_denominators/i);
    expect(art.summary).not.toMatch(/output_bomb|OUTPUT_BOMB|quarantined/i);
    expect(art.summary).not.toMatch(/eval_only_operational|operational_tool_forbidden/i);
    expect(art.summary).not.toMatch(/eval_no_grounding|no_grounding/i);
    expect(art.summary).not.toMatch(/incomparable_trend/i);
    expect(art.summary).not.toMatch(/schema_differs_from_page/i);
    expect(art.summary).not.toMatch(/optimization_breaks_cta|cta_journey/i);
    expect(art.summary).not.toMatch(/stop_before_dispatch|OUTBOUND_STOPPED/i);
    expect(art.summary).not.toMatch(/reply_sent_crm|CRM_RECONCILES|no_resend/i);
    expect(art.summary).not.toMatch(/DELIVERED reconcile|T-X054/i);
    expect(art.summary).not.toMatch(/gsc_omitted|GSC_OMITTED|UNKNOWN_NOT_ZERO/i);
    expect(art.summary).not.toMatch(/low_sample_trend|insufficient_evidence/i);
    expect(art.summary).not.toMatch(/orphan_worker|ORPHAN_WORKER|process tree stopped/i);
    expect(art.summary).not.toMatch(/\bsandbox\b.*\bVERIFIED\b/);
  });
});