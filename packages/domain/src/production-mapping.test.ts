import { describe, expect, it } from "vitest";
import { ActionClass } from "./standing-authority.js";
import {
  AdapterWiring,
  EvidenceKind,
  OutcomeEvidenceSource,
  OutcomeLabel,
  createFixturePilotMapping,
  createReadEvidence,
  listWritePathOutcomesForLearning,
  proveFixturePilotWritePath,
  recordWritePathOutcome,
  resolvePilotWriteGates,
} from "./production-mapping.js";

const now = "2026-11-18T15:00:00.000Z";

describe("production mapping write gates", () => {
  it("allows observe without a mapped write path", () => {
    const { state } = createFixturePilotMapping(now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.OBSERVE,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "fetch_page",
      mapping: state,
    });
    expect(gates.ownershipProven).toBe(true);
    expect(gates.readEvidencePresent).toBe(true);
    expect(gates.prerequisiteMissing).toBe(false);
  });

  it("denies write when ownership and read evidence are missing", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_PUBLISH,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: state,
    });
    expect(gates.matchedWritePath?.writePathId).toBe(writePathId);
    expect(gates.ownershipProven).toBe(false);
    expect(gates.readEvidencePresent).toBe(false);
    expect(gates.prerequisiteMissing).toBe(true);
    expect(gates.missingEvidenceKinds.length).toBeGreaterThan(0);
  });

  it("passes gates only after ownership + full read evidence", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(state, writePathId, now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: proven,
    });
    expect(gates.ownershipProven).toBe(true);
    expect(gates.readEvidencePresent).toBe(true);
    expect(gates.prerequisiteMissing).toBe(false);
    expect(gates.missingEvidenceKinds).toEqual([]);
  });

  it("fails closed when no write path is registered", () => {
    const { state } = createFixturePilotMapping(now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_PUBLISH,
      channelId: "owned-site",
      assetId: "page-other",
      operation: "publish_page",
      mapping: state,
    });
    expect(gates.ownershipProven).toBe(false);
    expect(gates.readEvidencePresent).toBe(false);
    expect(gates.matchedWritePath).toBeNull();
  });

  it("refuses LIVE adapter read evidence in R1-03", () => {
    expect(() =>
      createReadEvidence({
        evidenceId: "ev-1",
        writePathId: "wp-1",
        evidenceKind: EvidenceKind.IDENTITY,
        resourceType: "binding",
        resourceId: "b1",
        operation: "read_identity",
        summary: "should fail",
        fixtureOnly: false,
        observedAtIso: now,
        adapterWiring: AdapterWiring.LIVE,
      }),
    ).toThrow(/refuses LIVE/);
  });

  it("exposes labeled SUCCESS/FAILURE outcomes for a future learning-worker", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const withOutcomes: typeof state = {
      ...state,
      writePathOutcomes: [
        recordWritePathOutcome({
          outcomeId: "out-1",
          writePathId,
          operationId: "op-ok",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          summary: "Verified fixture canary",
          fixtureOnly: false,
          recordedAtIso: now,
          featureHints: { code: "ok", stage: "crm" },
        }),
        recordWritePathOutcome({
          outcomeId: "out-2",
          writePathId,
          operationId: "op-fail",
          label: OutcomeLabel.FAILURE,
          source: OutcomeEvidenceSource.READ_BACK,
          summary: "CRM record missing",
          fixtureOnly: false,
          recordedAtIso: now,
        }),
        recordWritePathOutcome({
          outcomeId: "out-3",
          writePathId,
          operationId: "op-unk",
          label: OutcomeLabel.UNKNOWN,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          summary: "Accepted pending",
          fixtureOnly: false,
          recordedAtIso: now,
        }),
        recordWritePathOutcome({
          outcomeId: "out-4",
          writePathId,
          operationId: "op-fix",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.FIXTURE,
          summary: "Fixture only",
          fixtureOnly: true,
          recordedAtIso: now,
        }),
      ],
    };
    const labels = listWritePathOutcomesForLearning(withOutcomes);
    expect(labels.map((r) => r.label)).toEqual([
      OutcomeLabel.SUCCESS,
      OutcomeLabel.FAILURE,
    ]);
    expect(
      listWritePathOutcomesForLearning(withOutcomes, { includeFixture: true }),
    ).toHaveLength(3);
  });
});
