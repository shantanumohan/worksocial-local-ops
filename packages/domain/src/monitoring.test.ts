import { describe, expect, it } from "vitest";
import {
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  ReconciliationStatus,
  assertSyntheticExcludedFromCommercial,
  buildProbeWritePathOutcome,
  createSyntheticLead,
  emptyMonitoringState,
  evaluateDomJourneyFixture,
  evaluateHttpProbe,
  evaluateOptimizationCtaJourneyGate,
  reconcileCanaryIntent,
} from "./monitoring.js";
import { OutcomeEvidenceSource, OutcomeLabel } from "./production-mapping.js";

const now = "2026-11-18T15:00:00.000Z";

describe("monitoring domain", () => {
  it("creates synthetic leads flagged for commercial exclusion", () => {
    const lead = createSyntheticLead({ correlationId: "corr-1" });
    expect(lead.synthetic).toBe(true);
    expect(lead.notificationSink).toBe("controlled_internal");
    assertSyntheticExcludedFromCommercial(lead);
    expect(lead.fieldValues.ws_correlation_id).toBe("corr-1");
  });

  it("reconciles a correlated fixture receipt as SUCCESS", () => {
    const intent = {
      operationId: "op-1",
      writePathId: "wp-form-to-crm",
      formId: "form-contact",
      correlationId: "corr-ok",
      payloadDigest: "abc",
      synthetic: true as const,
      submittedAtIso: now,
    };
    const receipt = {
      receiptId: "rcpt-1",
      correlationId: "corr-ok",
      moduleId: "Leads",
      recordId: "fixture-lead-1",
      synthetic: true,
      observedAtIso: now,
      source: "fixture_crm" as const,
      fieldSnapshot: {
        Email: "canary+corr-ok@worksocial.test.local",
        Last_Name: "Canary corr-ok",
        ws_correlation_id: "corr-ok",
        ws_synthetic: "true",
      },
    };
    const result = reconcileCanaryIntent({
      intent,
      receipts: [receipt],
      expectedModuleId: "Leads",
    });
    expect(result.status).toBe(ReconciliationStatus.MATCHED);
    expect(result.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(result.blocksRetry).toBe(false);
  });

  it("rejects receipts whose email lacks this canary correlation", () => {
    const intent = {
      operationId: "op-email",
      writePathId: "wp-form-to-crm",
      formId: "form-contact",
      correlationId: "corr-a",
      payloadDigest: "abc",
      synthetic: true as const,
      submittedAtIso: now,
    };
    const result = reconcileCanaryIntent({
      intent,
      receipts: [
        {
          receiptId: "rcpt-wrong-email",
          correlationId: "corr-a",
          moduleId: "Leads",
          recordId: "fixture-lead-x",
          synthetic: true,
          observedAtIso: now,
          source: "fixture_crm",
          fieldSnapshot: {
            Email: "canary+corr-other@worksocial.test.local",
            ws_correlation_id: "corr-a",
          },
        },
      ],
      expectedModuleId: "Leads",
    });
    expect(result.status).toBe(ReconciliationStatus.FIELD_MISMATCH);
    expect(result.verdict).toBe(ProbeVerdict.FAILURE);
  });

  it("fails closed on ambiguous writes (no recordId)", () => {
    const intent = {
      operationId: "op-amb",
      writePathId: "wp-form-to-crm",
      formId: "form-contact",
      correlationId: "corr-amb",
      payloadDigest: "abc",
      synthetic: true as const,
      submittedAtIso: now,
    };
    const result = reconcileCanaryIntent({
      intent,
      receipts: [
        {
          receiptId: "rcpt-amb",
          correlationId: "corr-amb",
          moduleId: "Leads",
          recordId: null,
          synthetic: true,
          observedAtIso: now,
          source: "fixture_crm",
          fieldSnapshot: {
            Email: "canary+corr-amb@worksocial.test.local",
            ws_correlation_id: "corr-amb",
          },
        },
      ],
      expectedModuleId: "Leads",
    });
    expect(result.status).toBe(ReconciliationStatus.AMBIGUOUS);
    expect(result.verdict).toBe(ProbeVerdict.UNKNOWN);
    expect(result.blocksRetry).toBe(true);
  });

  it("returns NOT_WIRED for live Zoho when unwired", () => {
    const intent = {
      operationId: "op-live",
      writePathId: "wp-form-to-crm",
      formId: "form-contact",
      correlationId: "corr-live",
      payloadDigest: "abc",
      synthetic: true as const,
      submittedAtIso: now,
    };
    const result = reconcileCanaryIntent({
      intent,
      receipts: [],
      expectedModuleId: "Leads",
      liveRequested: true,
      liveWired: false,
    });
    expect(result.status).toBe(ReconciliationStatus.NOT_WIRED);
    expect(result.verdict).toBe(ProbeVerdict.NOT_WIRED);
  });

  it("detects duplicate remote receipts", () => {
    const intent = {
      operationId: "op-dup",
      writePathId: "wp-form-to-crm",
      formId: "form-contact",
      correlationId: "corr-dup",
      payloadDigest: "abc",
      synthetic: true as const,
      submittedAtIso: now,
    };
    const base = {
      correlationId: "corr-dup",
      moduleId: "Leads",
      recordId: "r1",
      synthetic: true,
      observedAtIso: now,
      source: "fixture_crm" as const,
      fieldSnapshot: {
        Email: "canary+corr-dup@worksocial.test.local",
        ws_correlation_id: "corr-dup",
      },
    };
    const result = reconcileCanaryIntent({
      intent,
      receipts: [
        { ...base, receiptId: "a", recordId: "r1" },
        { ...base, receiptId: "b", recordId: "r2" },
      ],
      expectedModuleId: "Leads",
    });
    expect(result.status).toBe(ReconciliationStatus.DUPLICATE_REMOTE);
    expect(result.verdict).toBe(ProbeVerdict.FAILURE);
  });

  it("evaluates HTTP and DOM fixtures deterministically", () => {
    const http = evaluateHttpProbe({
      observedStatus: 200,
      observedBody: "<html>Contact WorkSocial</html>",
      expectation: {
        statusCode: 200,
        bodyContains: ["Contact", "WorkSocial"],
        maxLatencyMs: null,
      },
      latencyMs: null,
    });
    expect(http.verdict).toBe(ProbeVerdict.SUCCESS);

    const dom = evaluateDomJourneyFixture({
      html: '<form id="contact"><a href="/tour">Book</a><button>Submit</button></form>',
      steps: [
        {
          stepId: "s1",
          target: 'id="contact"',
          action: "assert_visible",
          expected: null,
        },
        {
          stepId: "s2",
          target: "Book",
          action: "assert_text",
          expected: "Book",
        },
        {
          stepId: "s3",
          target: 'href="/tour"',
          action: "assert_href",
          expected: "/tour",
        },
      ],
    });
    expect(dom.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(dom.passedStepIds).toHaveLength(3);
  });


  it("blocks optimization release when CTA journey regression fails", () => {
    const ctaSteps = [
      { stepId: "cta-visible", target: "Book a tour", action: "assert_text" as const, expected: "Book a tour" },
      { stepId: "tour-href", target: 'href="/tour"', action: "assert_href" as const, expected: "/tour" },
    ];
    const healthy = evaluateOptimizationCtaJourneyGate({
      optimizedHtml: '<a href="/tour">Book a tour</a><form id="contact"><button>Submit</button></form>',
      journeySteps: ctaSteps,
    });
    expect(healthy.allowed).toBe(true);
    expect(healthy.code).toBeNull();
    expect(healthy.journeyVerdict).toBe(ProbeVerdict.SUCCESS);
    const broken = evaluateOptimizationCtaJourneyGate({
      optimizedHtml: '<a href="/broken-cta">Learn more</a><form id="contact"><button>Submit</button></form>',
      journeySteps: ctaSteps,
    });
    expect(broken.allowed).toBe(false);
    expect(broken.code).toBe("JOURNEY_REGRESSION_FAILED");
    expect(broken.journeyVerdict).toBe(ProbeVerdict.FAILURE);
    expect(broken.failedStepDetails.length).toBeGreaterThan(0);
  });

  it("builds fixtureOnly learning outcomes for SUCCESS/FAILURE only", () => {
    const success = buildProbeWritePathOutcome({
      outcomeId: "out-1",
      writePathId: "wp-form-to-crm",
      operationId: "op-1",
      verdict: ProbeVerdict.SUCCESS,
      mode: ProbeMode.FIXTURE,
      summary: "Fixture canary matched",
      recordedAtIso: now,
    });
    expect(success?.label).toBe(OutcomeLabel.SUCCESS);
    expect(success?.fixtureOnly).toBe(true);
    expect(success?.source).toBe(OutcomeEvidenceSource.FIXTURE);

    const unknown = buildProbeWritePathOutcome({
      outcomeId: "out-2",
      writePathId: "wp-form-to-crm",
      operationId: "op-2",
      verdict: ProbeVerdict.NOT_WIRED,
      mode: ProbeMode.LIVE,
      summary: "Zoho not wired",
      recordedAtIso: now,
    });
    expect(unknown).toBeNull();
  });

  it("starts with empty monitoring state and honest live wiring", () => {
    const state = emptyMonitoringState(now);
    expect(state.liveZohoWiring).toBe("NOT_WIRED");
    expect(state.runs).toEqual([]);
    expect(ProbeKind.FORM_TO_CRM_CANARY).toBe("form_to_crm_canary");
  });
});
