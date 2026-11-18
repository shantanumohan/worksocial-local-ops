/**
 * Contract: multi-model registry, fixture exclusion, authority non-bypass,
 * learning-worker isolation (no gateway write / effect credentials), offline train.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  emptyProductionMappingState,
  recordWritePathOutcome,
} from "@worksocial/domain";
import {
  assertAuthorityNonExpansion,
  assertMultiModelRegistry,
  createLearningProposal,
  extractWritePathExamples,
  FIXED_NON_EXPANDING_AUTHORITY,
  LearningProposalKind,
  listPinnedModels,
  predictWithWeights,
  trainModel,
} from "@worksocial/ml";
import { createFileLearningStore } from "@worksocial/persistence";
import { createLearningWorker } from "@worksocial/learning-worker";
import { createCredentialBroker } from "@worksocial/credential-broker";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("contract: learning-worker multi-model", () => {
  it("registers ≥2 pinned open-source models", () => {
    assertMultiModelRegistry();
    expect(listPinnedModels().length).toBeGreaterThanOrEqual(2);
  });

  it("excludes fixtureOnly outcomes by default and rejects model claims", () => {
    const rows = [
      recordWritePathOutcome({
        outcomeId: "live",
        writePathId: "wp",
        operationId: "op",
        label: OutcomeLabel.SUCCESS,
        source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
        summary: "ok",
        fixtureOnly: false,
        recordedAtIso: "2026-11-18T00:00:00.000Z",
      }),
      recordWritePathOutcome({
        outcomeId: "fx",
        writePathId: "wp",
        operationId: "op2",
        label: OutcomeLabel.FAILURE,
        source: OutcomeEvidenceSource.FIXTURE,
        summary: "fx",
        fixtureOnly: true,
        recordedAtIso: "2026-11-18T00:00:00.000Z",
      }),
    ];
    expect(extractWritePathExamples(rows).map((e) => e.exampleId)).toEqual(["live"]);
    expect(() =>
      extractWritePathExamples([
        recordWritePathOutcome({
          outcomeId: "claim",
          writePathId: "wp",
          operationId: "op3",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          summary: "claim",
          fixtureOnly: false,
          recordedAtIso: "2026-11-18T00:00:00.000Z",
          featureHints: { unverifiedModelClaim: true },
        }),
      ]),
    ).toThrow(/unverified model claim/i);
  });

  it("refuses authority expansion via proposals", () => {
    expect(() =>
      assertAuthorityNonExpansion(FIXED_NON_EXPANDING_AUTHORITY, {
        capabilityGrants: [],
      }),
    ).toThrow(/authority-expansion/i);
    expect(() =>
      createLearningProposal({
        proposalId: "p",
        kind: LearningProposalKind.PLAYBOOK,
        modelIds: ["outcome-nb-bernoulli@1.0.0"],
        trainingRunId: "r",
        summary: "x",
        metrics: {
          sampleCount: 0,
          heldOutCount: 0,
          accuracy: null,
          successRate: null,
          meanScore: null,
          fixtureExcludedCount: 0,
          modelIds: [],
        },
        payload: { publishAuthority: true },
        createdAtIso: "2026-11-18T00:00:00.000Z",
      }),
    ).toThrow(/authority-expansion|publishAuthority/i);
  });

  it("denies learning-worker production effect credentials and gateway mint", () => {
    const broker = createCredentialBroker();
    const ref = broker.putReference(
      "crm",
      ["write"],
      "secret",
      "2026-11-18T00:00:00.000Z",
    );
    expect(
      broker.mintScopedHandle({
        principal: "learning-worker",
        referenceId: ref.referenceId,
        requestedScopes: ["write"],
        nowIso: "2026-11-18T00:00:00.000Z",
      }),
    ).toMatchObject({ ok: false, code: "PRINCIPAL_DENIED" });
  });

  it("trains and predicts offline without downloaded weights", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-learn-c-"));
    dirs.push(dir);
    const worker = createLearningWorker(createFileLearningStore(dir));
    expect(worker.hasActionGatewayWritePrincipal).toBe(false);
    expect(worker.hasProductionEffectCredentials).toBe(false);

    const now = "2026-11-18T13:00:00.000Z";
    let mapping = emptyProductionMappingState(now);
    mapping = {
      ...mapping,
      writePathOutcomes: [
        recordWritePathOutcome({
          outcomeId: "a",
          writePathId: "wp",
          operationId: "1",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          summary: "ok",
          fixtureOnly: false,
          recordedAtIso: now,
          featureHints: { code: "ACCEPTED" },
        }),
        recordWritePathOutcome({
          outcomeId: "b",
          writePathId: "wp",
          operationId: "2",
          label: OutcomeLabel.FAILURE,
          source: OutcomeEvidenceSource.STOP_SWITCH,
          summary: "stop",
          fixtureOnly: false,
          recordedAtIso: now,
          featureHints: { code: "DENIED" },
        }),
      ],
    };

    const result = worker.trainFromLedgers({ mapping, roleOutcomes: [], nowIso: now });
    expect(result.run.modelWeights).toHaveLength(2);
    expect(result.proposals.every((p) => p.status === "awaiting_review")).toBe(true);
    expect(
      result.proposals.every(
        (p) =>
          p.authorityImpact.expandsGrants === false &&
          p.authorityImpact.expandsSpend === false &&
          p.authorityImpact.expandsCrmWrite === false &&
          p.authorityImpact.expandsPublish === false,
      ),
    ).toBe(true);

    const examples = extractWritePathExamples(mapping.writePathOutcomes);
    const weights = trainModel(
      "outcome-nb-bernoulli@1.0.0",
      examples,
      now,
    );
    const pred = predictWithWeights(weights, examples[0]!);
    expect(pred.score).toBeGreaterThanOrEqual(0);
    expect(pred.score).toBeLessThanOrEqual(1);
  });
});
