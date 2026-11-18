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
        recordedAtIso: "2026-11-18T00:00:00.000Z",
        featureHints: {},
      },
    ];
    const examples = extractLearningExamples({ roleOutcomes: roles });
    expect(examples.map((e) => e.exampleId)).toEqual(["role-live"]);
  });
});
