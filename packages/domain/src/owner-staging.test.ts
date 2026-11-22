import { describe, expect, it } from "vitest";
import {
  ActivationStepId,
  ActivationStepStatus,
  CmsEnvironment,
  MeasurementMode,
  MissionStatus,
  createActivationChecklist,
  createPageSnapshot,
  digestFields,
  emptyOwnerStagingState,
  extractPageFieldsFromHtml,
  fieldsMatch,
  ownerMissionSummary,
  runDeterministicPageChecks,
  setActivationStep,
  validateCmsEnvironmentOperation,
  type OwnerMissionRecord,
  type StagingPageFields,
} from "./owner-staging.js";

const SAMPLE_HTML = `<!doctype html>
<html><head>
<title>Pilot coworking page</title>
<meta name="description" content="Quiet desks near the PATH" />
<link rel="canonical" href="https://example.test/pilot" />
</head><body><h1>Quiet desks</h1><p>Book a tour.</p></body></html>`;

describe("owner-staging domain (M4)", () => {
  it("tracks activation checklist progress", () => {
    const now = "2026-11-20T12:00:00.000Z";
    let checklist = createActivationChecklist({
      checklistId: "act-1",
      nowIso: now,
    });
    checklist = setActivationStep({
      checklist,
      stepId: ActivationStepId.SIGN_IN,
      status: ActivationStepStatus.COMPLETE,
      nowIso: now,
    });
    expect(
      checklist.steps.find((s) => s.stepId === ActivationStepId.SIGN_IN)
        ?.status,
    ).toBe(ActivationStepStatus.COMPLETE);
  });

  it("extracts page fields and runs deterministic checks", () => {
    const fields = extractPageFieldsFromHtml(SAMPLE_HTML);
    expect(fields.title).toBe("Pilot coworking page");
    expect(fields.h1).toBe("Quiet desks");
    expect(fields.canonical).toBe("https://example.test/pilot");
    const checks = runDeterministicPageChecks({
      ...fields,
      htmlByteLength: Buffer.byteLength(SAMPLE_HTML, "utf8"),
    });
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it("creates a fixture-labeled page snapshot with digest", () => {
    const snap = createPageSnapshot({
      snapshotId: "snap-1",
      siteId: "site-1",
      pagePath: "/pilot",
      html: SAMPLE_HTML,
      measurementMode: MeasurementMode.FIXTURE,
      sourceLabel: "fixture://pilot-page",
      nowIso: "2026-11-20T12:00:00.000Z",
    });
    expect(snap.measurementMode).toBe(MeasurementMode.FIXTURE);
    expect(snap.contentDigest).toHaveLength(64);
    expect(snap.checks).toHaveLength(5);
  });

  it("compares independent read-back fields without accepting empty observed", () => {
    const desired: StagingPageFields = {
      title: "A",
      metaDescription: "B",
      h1: "C",
      bodyExcerpt: "D",
    };
    expect(fieldsMatch(desired, desired).matched).toBe(true);
    expect(
      fieldsMatch(desired, { ...desired, title: "X" }).matched,
    ).toBe(false);
    expect(digestFields(desired)).toHaveLength(64);
  });

  it("exposes owner-safe mission summary without raw digests", () => {
    const mission: OwnerMissionRecord = {
      missionId: "m1",
      siteId: "site-1",
      displayTitle: "Improve pilot title",
      summary: "Clarify the page title for local search.",
      status: MissionStatus.NEEDS_REVIEW,
      beforeSnapshotId: "snap-1",
      afterSnapshotId: null,
      changeId: null,
      reviewDecision: null,
      reviewNote: null,
      desiredFields: {
        title: "Quiet desks near PATH",
        metaDescription: "Book a tour",
        h1: "Quiet desks",
        bodyExcerpt: "Book a tour.",
      },
      fixtureOnly: true,
      createdAtIso: "2026-11-20T12:00:00.000Z",
      updatedAtIso: "2026-11-20T12:00:00.000Z",
    };
    const summary = ownerMissionSummary(mission);
    expect(summary.missionId).toBe("m1");
    expect(summary.title).toBe("Improve pilot title");
    expect(JSON.stringify(summary)).not.toContain("contentDigest");
  });

  it("starts with an honest empty state", () => {
    const state = emptyOwnerStagingState("2026-11-20T12:00:00.000Z");
    expect(state.version).toBe(1);
    expect(state.honestNote).toMatch(/NOT_WIRED/);
    expect(state.missions).toEqual([]);
  });

  it("refuses wrong CMS environment and production mutate (T-X007)", () => {
    const mismatch = validateCmsEnvironmentOperation({
      boundEnvironment: CmsEnvironment.PRODUCTION,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.code).toBe("WRONG_CMS_ENVIRONMENT");
      expect(mismatch.allowProductionOp).toBe(false);
    }
    const prod = validateCmsEnvironmentOperation({
      boundEnvironment: CmsEnvironment.PRODUCTION,
      intendedEnvironment: CmsEnvironment.PRODUCTION,
      operation: "publish",
    });
    expect(prod.ok).toBe(false);
    if (!prod.ok) {
      expect(prod.code).toBe("PRODUCTION_OP_REFUSED");
      expect(prod.allowProductionOp).toBe(false);
    }
    const staging = validateCmsEnvironmentOperation({
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
    });
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(staging.allowProductionOp).toBe(false);
    }
    const unrecognized = validateCmsEnvironmentOperation({
      boundEnvironment: "prod",
      intendedEnvironment: "prod",
      operation: "publish",
    });
    expect(unrecognized.ok).toBe(false);
    if (!unrecognized.ok) {
      expect(unrecognized.code).toBe("UNRECOGNIZED_ENVIRONMENT");
      expect(unrecognized.allowProductionOp).toBe(false);
    }
  });
});
