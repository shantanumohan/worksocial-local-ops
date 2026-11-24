import { describe, expect, it } from "vitest";
import {
  CleanupStatus,
  LeadCaptureJourneyStatus,
  LeadCaptureStage,
  appendCommerceLead,
  createLeadCaptureJourney,
  emptyLeadCaptureState,
  markJourneyFailure,
  markJourneySuccess,
  markStageComplete,
  projectCommerceTotals,
  summarizeLeadCaptureStatus,
  verifyCanaryCrmFields,
} from "./lead-capture.js";

const now = "2026-11-20T15:00:00.000Z";

describe("lead-capture domain", () => {
  it("excludes synthetic leads from commerce totals", () => {
    let state = emptyLeadCaptureState(now);
    state = appendCommerceLead(
      state,
      {
        recordId: "lead-real",
        synthetic: false,
        revenueMinor: 5000,
        countedInCommerce: true,
      },
      now,
    );
    state = appendCommerceLead(
      state,
      {
        recordId: "lead-canary",
        synthetic: true,
        revenueMinor: 99999,
        countedInCommerce: false,
      },
      now,
    );
    const totals = projectCommerceTotals(state.commerceLeads);
    expect(totals.leadCount).toBe(1);
    expect(totals.revenueMinor).toBe(5000);
    expect(totals.syntheticExcludedCount).toBe(1);
    expect(totals.syntheticExcludedRevenueMinor).toBe(99999);
    expect(totals.liveProviderWiring).toBe("NOT_WIRED");
    expect(totals.externalEffects).toBe("NONE");
    expect(totals.fixtureOnly).toBe(true);
  });

  it("refuses synthetic leads marked countedInCommerce", () => {
    const state = emptyLeadCaptureState(now);
    expect(() =>
      appendCommerceLead(
        state,
        {
          recordId: "bad",
          synthetic: true,
          revenueMinor: 1,
          countedInCommerce: true,
        },
        now,
      ),
    ).toThrow(/countedInCommerce/);
  });

  it("projects out synthetic even if countedInCommerce slipped true (T-X052)", () => {
    const totals = projectCommerceTotals([
      {
        recordId: "real",
        synthetic: false,
        revenueMinor: 1000,
        countedInCommerce: true,
      },
      {
        recordId: "slipped-synthetic",
        synthetic: true,
        revenueMinor: 50_000,
        countedInCommerce: true,
      },
    ]);
    expect(totals.leadCount).toBe(1);
    expect(totals.revenueMinor).toBe(1000);
    expect(totals.syntheticExcludedCount).toBe(1);
    expect(totals.syntheticExcludedRevenueMinor).toBe(50_000);
  });

  it("does not count non-commerce real rows or multiple synthetics into leadCount", () => {
    const totals = projectCommerceTotals([
      {
        recordId: "real-commerce",
        synthetic: false,
        revenueMinor: 2000,
        countedInCommerce: true,
      },
      {
        recordId: "real-audit-only",
        synthetic: false,
        revenueMinor: 3000,
        countedInCommerce: false,
      },
      {
        recordId: "syn-a",
        synthetic: true,
        revenueMinor: 10,
        countedInCommerce: false,
      },
      {
        recordId: "syn-b",
        synthetic: true,
        revenueMinor: 20,
        countedInCommerce: false,
      },
    ]);
    expect(totals.leadCount).toBe(1);
    expect(totals.revenueMinor).toBe(2000);
    expect(totals.syntheticExcludedCount).toBe(2);
    expect(totals.syntheticExcludedRevenueMinor).toBe(30);
  });

  it("verifies required canary CRM fields", () => {
    const corr = "corr-abc";
    const ok = verifyCanaryCrmFields({
      correlationId: corr,
      expected: {
        Email: `canary+${corr}@worksocial.test.local`,
        Last_Name: `Canary ${corr}`,
      },
      observed: {
        Email: `canary+${corr}@worksocial.test.local`,
        Last_Name: `Canary ${corr}`,
        ws_synthetic: "true",
        ws_correlation_id: corr,
      },
    });
    expect(ok.passed).toBe(true);

    const bad = verifyCanaryCrmFields({
      correlationId: corr,
      expected: { Email: `canary+${corr}@worksocial.test.local`, Last_Name: "x" },
      observed: {
        Email: "person@example.com",
        Last_Name: "x",
        ws_synthetic: "false",
        ws_correlation_id: "other",
      },
    });
    expect(bad.passed).toBe(false);
    expect(bad.mismatchedFields.length).toBeGreaterThan(0);
  });

  it("tracks journey stages and keeps failures visible while repairing", () => {
    let journey = createLeadCaptureJourney({
      journeyId: "j1",
      correlationId: "c1",
      createdAtIso: now,
    });
    journey = markStageComplete(journey, LeadCaptureStage.BROWSER, now);
    journey = markStageComplete(journey, LeadCaptureStage.CRM_WRITE, now);
    journey = markJourneySuccess(journey, now);
    expect(journey.status).toBe(LeadCaptureJourneyStatus.SUCCESS);
    expect(journey.stagesCompleted).toContain(LeadCaptureStage.BROWSER);

    let failed = createLeadCaptureJourney({
      journeyId: "j2",
      correlationId: "c2",
      createdAtIso: now,
    });
    failed = markJourneyFailure(failed, {
      stage: LeadCaptureStage.CRM_WRITE,
      verdict: "FAILURE",
      details: ["MISSING_REMOTE"],
      atIso: "2026-11-20T15:01:00.000Z",
    });
    failed = {
      ...failed,
      status: LeadCaptureJourneyStatus.REPAIRING,
      currentFailure: failed.currentFailure,
    };
    expect(failed.cleanup.status).toBe(CleanupStatus.PENDING);

    const state = {
      ...emptyLeadCaptureState(now),
      journeys: [journey, failed],
    };
    const summary = summarizeLeadCaptureStatus(state);
    expect(summary.lastSuccess?.journeyId).toBe("j1");
    expect(summary.currentFailure?.journeyId).toBe("j2");
    expect(summary.r1CompleteClaim).toBe(false);
    expect(summary.liveZohoWiring).toBe("NOT_WIRED");
  });
});
