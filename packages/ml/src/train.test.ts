import { describe, expect, it } from "vitest";
import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import {
  assertAuthorityNonExpansion,
  createLearningProposal,
  FIXED_NON_EXPANDING_AUTHORITY,
  LearningProposalKind,
} from "./index.js";
import { predictWithWeights, trainModel } from "./models.js";
import { extractWritePathExamples } from "./features.js";
import { runTrainLoop } from "./train.js";

const isolation = {
  principal: "learning-worker" as const,
  hasActionGatewayWritePrincipal: false,
  hasProductionEffectCredentials: false,
};

function outcomes(): WritePathOutcomeEvidence[] {
  return [
    {
      outcomeId: "o1",
      writePathId: "wp-a",
      operationId: "op1",
      label: OutcomeLabel.SUCCESS,
      source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
      featureHints: { code: "ACCEPTED" },
      summary: "ok",
      fixtureOnly: false,
      recordedAtIso: "2026-11-18T01:00:00.000Z",
    },
    {
      outcomeId: "o2",
      writePathId: "wp-a",
      operationId: "op2",
      label: OutcomeLabel.FAILURE,
      source: OutcomeEvidenceSource.STOP_SWITCH,
      featureHints: { code: "DENIED" },
      summary: "stopped",
      fixtureOnly: false,
      recordedAtIso: "2026-11-18T02:00:00.000Z",
    },
    {
      outcomeId: "o3",
      writePathId: "wp-b",
      operationId: "op3",
      label: OutcomeLabel.SUCCESS,
      source: OutcomeEvidenceSource.READ_BACK,
      featureHints: { code: "VERIFIED" },
      summary: "verified",
      fixtureOnly: false,
      recordedAtIso: "2026-11-18T03:00:00.000Z",
    },
    {
      outcomeId: "fix",
      writePathId: "wp-fix",
      operationId: "op-fx",
      label: OutcomeLabel.FAILURE,
      source: OutcomeEvidenceSource.FIXTURE,
      featureHints: {},
      summary: "fixture",
      fixtureOnly: true,
      recordedAtIso: "2026-11-18T04:00:00.000Z",
    },
  ];
}

describe("offline train/predict + authority non-bypass", () => {
  it("trains both pinned models offline and predicts", () => {
    const examples = extractWritePathExamples(outcomes());
    expect(examples).toHaveLength(3);
    const nb = trainModel("outcome-nb-bernoulli@1.0.0", examples, "2026-11-18T05:00:00.000Z");
    const lr = trainModel("outcome-logreg-l2@1.0.0", examples, "2026-11-18T05:00:00.000Z");
    expect(nb.runtimeMode).toBe("local_trained");
    expect(lr.runtimeMode).toBe("local_trained");
    const pred = predictWithWeights(nb, examples[0]!);
    expect(["SUCCESS", "FAILURE"]).toContain(pred.predictedLabel);
    expect(pred.score).toBeGreaterThanOrEqual(0);
    expect(pred.score).toBeLessThanOrEqual(1);
  });

  it("falls back to fixture baseline weights with empty corpus", () => {
    const result = runTrainLoop({
      writePathOutcomes: [],
      roleOutcomes: [],
      nowIso: "2026-11-18T06:00:00.000Z",
      runId: "run-empty",
      isolation,
    });
    expect(result.run.runtimeMode).toBe("offline_fixture");
    expect(result.run.modelWeights).toHaveLength(2);
    expect(result.proposals.length).toBeGreaterThanOrEqual(2);
    expect(result.proposals.every((p) => p.status === "awaiting_review")).toBe(true);
  });

  it("refuses authority expansion in proposals", () => {
    expect(() =>
      assertAuthorityNonExpansion(FIXED_NON_EXPANDING_AUTHORITY, {
        grantId: "g-1",
      }),
    ).toThrow(/authority-expansion/i);

    expect(() =>
      createLearningProposal({
        proposalId: "bad",
        kind: LearningProposalKind.RISK,
        modelIds: ["outcome-logreg-l2@1.0.0"],
        trainingRunId: "r",
        summary: "bad",
        metrics: {
          sampleCount: 0,
          heldOutCount: 0,
          accuracy: null,
          successRate: null,
          meanScore: null,
          fixtureExcludedCount: 0,
          modelIds: [],
        },
        payload: { spendLimit: 999 },
        createdAtIso: "2026-11-18T07:00:00.000Z",
      }),
    ).toThrow(/authority-expansion|spendLimit/i);
  });

  it("train loop isolation rejects gateway write principal", () => {
    expect(() =>
      runTrainLoop({
        writePathOutcomes: outcomes(),
        roleOutcomes: [],
        nowIso: "2026-11-18T08:00:00.000Z",
        runId: "run-bad",
        isolation: {
          principal: "learning-worker",
          hasActionGatewayWritePrincipal: true,
          hasProductionEffectCredentials: false,
        },
      }),
    ).toThrow(/action-gateway write principal/i);
  });

  it("produces versioned proposals without expanding authority", () => {
    const result = runTrainLoop({
      writePathOutcomes: outcomes(),
      roleOutcomes: [],
      nowIso: "2026-11-18T09:00:00.000Z",
      runId: "run-ok",
      isolation,
    });
    expect(result.examples).toHaveLength(3);
    expect(result.proposals.every((p) => p.authorityImpact.expandsGrants === false)).toBe(
      true,
    );
    expect(result.proposals.every((p) => p.authorityImpact.expandsSpend === false)).toBe(
      true,
    );
    expect(result.proposals.every((p) => p.authorityImpact.expandsCrmWrite === false)).toBe(
      true,
    );
    expect(result.proposals.every((p) => p.authorityImpact.expandsPublish === false)).toBe(
      true,
    );
    expect(result.proposals.map((p) => p.kind).sort()).toEqual([
      "playbook",
      "ranking",
      "risk",
    ]);
  });
});
