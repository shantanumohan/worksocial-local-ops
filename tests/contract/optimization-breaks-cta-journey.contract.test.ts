/**
 * Contract: T-X043 optimization breaks CTA journey regression (O37 exclusive retip e7226169).
 * Tip matrix/runbook preserved — does not edit catalog docs.
 * ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED. Soft-skip Ads.
 * Catalog ≤ T-X073.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MONITORING_RELATED_CASE_IDS,
  ProbeVerdict,
  SoakProofKind,
  evaluateOptimizationCtaJourneyGate,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  here,
  "../acceptance-evidence/fixture/art-fixture-t-x043.json",
);

const minimalSteps = [
  {
    stepId: "cta-text",
    target: "Book a tour",
    action: "assert_text" as const,
    expected: "Book a tour",
  },
  {
    stepId: "tour-href",
    target: 'href="/tour"',
    action: "assert_href" as const,
    expected: "/tour",
  },
];

describe("contract: T-X043 optimization CTA journey", () => {
  it("maps only OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS ↔ T-X043", () => {
    expect(expectedProofsForFixtureCase("T-X043")).toEqual([
      SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
      ),
    ).toEqual(["T-X043"]);
    expect([...MONITORING_RELATED_CASE_IDS]).toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X025")).toEqual([
      SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
      ),
    ).toEqual(["T-X025"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
      ),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X026")).toEqual([
      SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
      ),
    ).toEqual(["T-X026"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
      ),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X027")).toEqual([
      SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
      ),
    ).toEqual(["T-X027"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
      ),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X032")).toEqual([
      SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
      ),
    ).toContain("T-X032");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
      ),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X037")).toEqual([
      SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
      ),
    ).toContain("T-X037");
    expect(
      mapProofToFixtureCases(
        SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
      ),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X070")).not.toContain(
      SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    );
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X042")).toEqual([
      SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X041")).toEqual([
      SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X031")).toEqual([
      SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X014")).toEqual([
      SoakProofKind.CRASH_RESTART,
      SoakProofKind.JOB_CONTINUITY,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CRASH_RESTART),
    ).not.toContain("T-X043");
    expect(mapProofToFixtureCases(SoakProofKind.JOB_CONTINUITY)).not.toContain(
      "T-X043",
    );
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).toEqual(["T-X070"]);
    expect(expectedProofsForFixtureCase("T-X020")).toEqual([
      SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.UNKNOWN_REMOTE_RECONCILE),
    ).not.toContain("T-X043");
    expect(expectedProofsForFixtureCase("T-X028")).toEqual([
      SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
      ),
    ).toEqual(["T-X028"]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
      ),
    ).not.toContain("T-X043");
    for (const adsCase of ["T-F07", "T-US-013", "T-US-014"] as const) {
      expect(expectedProofsForFixtureCase(adsCase)).not.toContain(
        SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
      );
      expect(mapProofToFixtureCases(SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS)).not.toContain(
        adsCase,
      );
    }
  });

  it("blocks broken CTA and requires journey steps", () => {
    const okHtml = '<a href="/tour">Book a tour</a>';
    const allowed = evaluateOptimizationCtaJourneyGate({
      optimizedHtml: okHtml,
      journeySteps: minimalSteps,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.code).toBeNull();
    expect(allowed.journeyVerdict).toBe(ProbeVerdict.SUCCESS);
    expect(allowed.liveProviderWiring).toBe("NOT_WIRED");
    expect(allowed.externalEffects).toBe("NONE");
    expect(allowed.fixtureOnly).toBe(true);

    const hrefBreak = evaluateOptimizationCtaJourneyGate({
      optimizedHtml: '<a href="/pricing">Book a tour</a>',
      journeySteps: minimalSteps,
    });
    expect(hrefBreak.allowed).toBe(false);
    expect(hrefBreak.code).toBe("JOURNEY_REGRESSION_FAILED");
    expect(hrefBreak.passedStepIds).toContain("cta-text");

    const textBreak = evaluateOptimizationCtaJourneyGate({
      optimizedHtml: '<a href="/tour">Learn more</a>',
      journeySteps: minimalSteps,
    });
    expect(textBreak.allowed).toBe(false);
    expect(textBreak.code).toBe("JOURNEY_REGRESSION_FAILED");
    expect(textBreak.passedStepIds).toContain("tour-href");

    const decoy = evaluateOptimizationCtaJourneyGate({
      optimizedHtml:
        '<a href="/pricing">Book a tour</a><footer><a href="/tour">Locations</a></footer>',
      journeySteps: minimalSteps,
    });
    expect(decoy.allowed).toBe(false);
    expect(decoy.code).toBe("JOURNEY_REGRESSION_FAILED");
    expect(decoy.failedStepDetails.some((d) => /same <a>|decoy/i.test(d))).toBe(
      true,
    );

    const empty = evaluateOptimizationCtaJourneyGate({
      optimizedHtml: okHtml,
      journeySteps: [],
    });
    expect(empty.allowed).toBe(false);
    expect(empty.code).toBe("JOURNEY_STEPS_REQUIRED");
    expect(empty.journeyVerdict).toBeNull();
    expect(empty.externalEffects).toBe("NONE");

    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      summary: string;
      proofKinds: string[];
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
    };
    expect(art.caseId).toBe("T-X043");
    expect(art.proofKinds).toEqual(["optimization_breaks_cta_journey_fails"]);
    expect(art.summary).toMatch(/JOURNEY_REGRESSION_FAILED/);
    expect(art.summary).toMatch(/JOURNEY_STEPS_REQUIRED/);
    expect(art.summary).toMatch(/optimization_breaks_cta_journey_fails/);
    expect(art.summary).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(art.summary).toMatch(/externalEffects=NONE/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).not.toMatch(
      /validated_payload|VALIDATION_FAILED|COLLECTION_FAILED/i,
    );
    expect(art.summary).not.toMatch(/schema_differs_from_page/i);
    expect(art.summary).not.toMatch(/incomparable_trend/i);
    expect(art.summary).not.toMatch(/external_human_edit|EXTERNAL_HUMAN_EDIT/i);
    expect(art.summary).not.toMatch(
      /concurrent_final_budget|BUDGET_RESERVATION/i,
    );
    expect(art.summary).not.toMatch(/T-F07|T-US-013|T-US-014/);
    expect(art.summary).not.toMatch(
      /unknown_usage_cancel|USAGE_CANCEL_HOLDS/i,
    );
    expect(art.summary).not.toMatch(
      /ga4_debug_not_delivered|GA4_DEBUG_NOT_DELIVERED/i,
    );
    expect(art.summary).not.toMatch(
      /eval_only_operational|EVAL_ONLY_OPERATIONAL/i,
    );
    expect(art.summary).not.toMatch(/unknown_remote|UNKNOWN_REMOTE/i);
    expect(art.summary).not.toMatch(/overrun_visible|ACTUAL_COST_EXCEEDS/i);
    expect(art.summary).not.toMatch(/\bsandbox\b.*\bVERIFIED\b/);
  });
});