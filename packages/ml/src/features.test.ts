import { describe, expect, it } from "vitest";
import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  type RoleRunOutcomeEvidence,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import {
  extractLearningExamples,
  extractWritePathExamples,
  isUnverifiedModelClaimLabel,
} from "./features.js";

function writeOutcome(
  partial: Partial<WritePathOutcomeEvidence> & Pick<WritePathOutcomeEvidence, "outcomeId" | "label" | "fixtureOnly" | "source">,
): WritePathOutcomeEvidence {
  return {
    writePathId: "wp-1",
    operationId: "op-1",
    featureHints: {},
    summary: "test",
    recordedAtIso: "2026-11-18T00:00:00.000Z",
    ...partial,
  };
}

describe("feature extraction", () => {
  it("excludes fixtureOnly by default", () => {
    const rows = [
      writeOutcome({
        outcomeId: "real",
        label: OutcomeLabel.SUCCESS,
        source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
        fixtureOnly: false,
      }),
      writeOutcome({
        outcomeId: "fix",
        label: OutcomeLabel.FAILURE,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
      }),
    ];
    const examples = extractWritePathExamples(rows);
    expect(examples.map((e) => e.exampleId)).toEqual(["real"]);
    expect(
      extractWritePathExamples(rows, { includeFixture: true }),
    ).toHaveLength(2);
  });

  it("rejects unverified model claims as labels", () => {
    expect(
      isUnverifiedModelClaimLabel({ labelSource: "model_claim" }),
    ).toBe(true);
    expect(() =>
      extractWritePathExamples([
        writeOutcome({
          outcomeId: "claim",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: false,
          featureHints: { labelSource: "model_claim" },
        }),
      ]),
    ).toThrow(/unverified model claim/i);
  });

  it("excludes fixture role runs by default", () => {
    const roles: RoleRunOutcomeEvidence[] = [
      {
        outcomeId: "role-live",
        roleId: "A01",
        jobId: "j1",
        runId: "r1",
        label: OutcomeLabel.SUCCESS,
        status: "succeeded",
        executionMode: "live_cli",
        reason: "ok",
        artifactIds: [],
        costMinor: 1,
        costKind: "unknown",
        recordedAtIso: "2026-11-18T00:00:00.000Z",
        featureHints: {},
      },
      {
        outcomeId: "role-fix",
        roleId: "A02",
        jobId: "j2",
        runId: "r2",
        label: OutcomeLabel.FAILURE,
        status: "failed",
        executionMode: "fixture",
        reason: "fixture",
        artifactIds: [],
        costMinor: 0,
        costKind: "fixture",
        recordedAtIso: "2026-11-18T00:00:00.000Z",
        featureHints: {},
      },
    ];
    const examples = extractLearningExamples({ roleOutcomes: roles });
    expect(examples.map((e) => e.exampleId)).toEqual(["role-live"]);
  });

  it("fixture baseline weights do not encode label= or status= leakage (F08)", async () => {
    const { fixtureBaselineWeights, FEATURE_DIM } = await import("./models.js");
    const { hashToken } = await import("./features.js");
    const lr = fixtureBaselineWeights(
      "outcome-logreg-l2@1.0.0",
      "2026-11-20T00:00:00.000Z",
    );
    const coeffs = lr.params.coefficients as number[];
    expect(coeffs[hashToken("label=SUCCESS", FEATURE_DIM)]).toBe(0);
    expect(coeffs[hashToken("label=FAILURE", FEATURE_DIM)]).toBe(0);
    expect(coeffs[hashToken("status=failed", FEATURE_DIM)]).toBe(0);
    // Pre-action priors remain present.
    expect(coeffs[hashToken("hint.code=DENIED", FEATURE_DIM)]).toBeGreaterThan(0);
  });

  it("does not leak SUCCESS/FAILURE labels or post-outcome fields into features (F08)", () => {
    const rows = [
      writeOutcome({
        outcomeId: "real",
        label: OutcomeLabel.SUCCESS,
        source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
        fixtureOnly: false,
        featureHints: {
          code: "ACCEPTED",
          label: "SUCCESS",
          deniedEffectCount: 2,
          costMinor: 75,
        },
      }),
    ];
    const examples = extractWritePathExamples(rows);
    expect(examples).toHaveLength(1);
    const tokens = examples[0]!.features.tokens.join(" ");
    expect(tokens).not.toMatch(/label=SUCCESS/);
    expect(tokens).not.toMatch(/label=FAILURE/);
    expect(tokens).toContain("hint.code=ACCEPTED");
    expect(examples[0]!.features.numerics.deniedEffectCount).toBeUndefined();
    expect(examples[0]!.features.numerics.costMinor).toBeUndefined();
  });
});
