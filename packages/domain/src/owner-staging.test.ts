import { describe, expect, it } from "vitest";
import {
  ActivationStepId,
  ActivationStepStatus,
  CmsEnvironment,
  MeasurementMode,
  MissionStatus,
  WRONG_CMS_ENVIRONMENT_RELATED_CASE_IDS,
  createActivationChecklist,
  createPageSnapshot,
  digestFields,
  emptyOwnerStagingState,
  evaluateCmsEnvironmentMutateWithLease,
  evaluateCmsLeaseExpireRaceAttackSuite,
  evaluateWrongCmsEnvironmentAttackSuite,
  extractPageFieldsFromHtml,
  fieldsMatch,
  isCmsCredentialLeaseExpired,
  normalizeCmsEnvironmentLabel,
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
      expect(mismatch.liveProviderWiring).toBe("NOT_WIRED");
      expect(mismatch.externalEffects).toBe("NONE");
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
      expect(prod.liveProviderWiring).toBe("NOT_WIRED");
    }
    const staging = validateCmsEnvironmentOperation({
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
    });
    expect(staging.ok).toBe(true);
    if (staging.ok) {
      expect(staging.allowProductionOp).toBe(false);
      expect(staging.liveProviderWiring).toBe("NOT_WIRED");
      expect(staging.externalEffects).toBe("NONE");
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

    // Case + whitespace normalization cannot invent a bypass.
    const padded = validateCmsEnvironmentOperation({
      boundEnvironment: " PRODUCTION ",
      intendedEnvironment: "Staging",
      operation: "publish",
    });
    expect(padded.ok).toBe(false);
    if (!padded.ok) {
      expect(padded.code).toBe("WRONG_CMS_ENVIRONMENT");
    }
    const caseMatchStaging = validateCmsEnvironmentOperation({
      boundEnvironment: " Staging ",
      intendedEnvironment: "STAGING",
      operation: "repair",
    });
    expect(caseMatchStaging.ok).toBe(true);
    if (caseMatchStaging.ok) {
      expect(caseMatchStaging.allowProductionOp).toBe(false);
    }

    expect([...WRONG_CMS_ENVIRONMENT_RELATED_CASE_IDS]).toEqual(["T-X007"]);
    expect(normalizeCmsEnvironmentLabel("\u00A0Production\u200B")).toBe(
      "production",
    );
    expect(normalizeCmsEnvironmentLabel(" \tprod\n ")).toBe("prod");
    const suite = evaluateWrongCmsEnvironmentAttackSuite();
    expect(suite.passed).toBe(true);
    expect(suite.details.join(" ")).toMatch(/NOT_WIRED/);
    expect(suite.details.join(" ")).toMatch(/unicode|NBSP|alias|fixtureOnly/i);
    expect(suite.results.every((r) => r.fixtureOnly === true)).toBe(true);
    expect(suite.results.every((r) => r.allowProductionOp === false)).toBe(
      true,
    );

    // H9: lease-expire race — mutate-time recheck.
    const t0 = "2026-11-21T18:00:00.000Z";
    const t1 = "2026-11-21T18:05:00.000Z";
    const leaseExpires = "2026-11-21T18:02:00.000Z";
    expect(
      isCmsCredentialLeaseExpired({
        leaseExpiresAtIso: leaseExpires,
        nowIso: t0,
      }),
    ).toBe(false);
    expect(
      isCmsCredentialLeaseExpired({
        leaseExpiresAtIso: leaseExpires,
        nowIso: t1,
      }),
    ).toBe(true);
    const raceT0 = evaluateCmsEnvironmentMutateWithLease({
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
      leaseExpiresAtIso: leaseExpires,
      nowIso: t0,
    });
    expect(raceT0.allowed).toBe(true);
    const raceT1 = evaluateCmsEnvironmentMutateWithLease({
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
      leaseExpiresAtIso: leaseExpires,
      nowIso: t1,
    });
    expect(raceT1.allowed).toBe(false);
    if (!raceT1.allowed) {
      expect(raceT1.code).toBe("LEASE_EXPIRED");
      expect(raceT1.providerMutateAllowed).toBe(false);
    }
    const leaseSuite = evaluateCmsLeaseExpireRaceAttackSuite();
    expect(leaseSuite.passed).toBe(true);
    expect(leaseSuite.details.join(" ")).toMatch(/Exact boundary/);
    expect(leaseSuite.details.join(" ")).toMatch(/Invalid lease/);
    expect(leaseSuite.details.join(" ")).toMatch(/Second mutate/);
    expect(leaseSuite.details.join(" ")).toMatch(/H13 whitespace-only lease/);
    expect(leaseSuite.details.join(" ")).toMatch(/H14 empty-string lease/);
    expect(leaseSuite.details.join(" ")).toMatch(/H15 ZWSP-only lease/);
    expect(leaseSuite.details.join(" ")).toMatch(/H16 double-ZWSP-only lease/);
    expect(leaseSuite.details.join(" ")).toMatch(/H17 ZWSP-padded valid ISO lease/);
    expect(leaseSuite.details.join(" ")).toMatch(/H18 BOM-prefixed valid ISO lease/);

    // H12: exact boundary + invalid lease.
    const exactNow = "2026-11-21T18:02:00.000Z";
    expect(
      isCmsCredentialLeaseExpired({
        leaseExpiresAtIso: exactNow,
        nowIso: exactNow,
      }),
    ).toBe(true);
    const exact = evaluateCmsEnvironmentMutateWithLease({
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
      leaseExpiresAtIso: exactNow,
      nowIso: exactNow,
    });
    expect(exact.allowed).toBe(false);
    if (!exact.allowed) {
      expect(exact.code).toBe("LEASE_EXPIRED");
      expect(exact.providerMutateAllowed).toBe(false);
    }
    const invalid = evaluateCmsEnvironmentMutateWithLease({
      boundEnvironment: CmsEnvironment.STAGING,
      intendedEnvironment: CmsEnvironment.STAGING,
      operation: "publish",
      leaseExpiresAtIso: "not-a-timestamp",
      nowIso: t0,
    });
    expect(invalid.allowed).toBe(false);
    if (!invalid.allowed) {
      expect(invalid.code).toBe("LEASE_EXPIRED");
      expect(invalid.liveProviderWiring).toBe("NOT_WIRED");
    }
  });
});
