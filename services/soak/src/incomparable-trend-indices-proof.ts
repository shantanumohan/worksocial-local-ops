/**
 * Fixture proof for T-X041 — incomparable trend indices → reject/label.
 *
 * Never divides arbitrary indices from different data extracts. Same
 * comparability group + unit + sourceSystem required before a ratio is
 * allowed. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  CollectionMethod,
  DemandSignalKind,
  SoakProofKind,
  SupportLabel,
  compareTrendIndices,
  registerDemandObservation,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X041 fixture ACCEPTED.
 */
export function proofIncomparableTrendIndicesRejected(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const left = registerDemandObservation({
    observationId: "obs-trend-a",
    kind: DemandSignalKind.TREND,
    queryOrTopic: "day pass meeting room",
    collectionMethod: CollectionMethod.FIXTURE,
    sourceSystem: "trends_fixture_a",
    rawValue: 40,
    unit: "relative_interest_index",
    comparabilityGroup: "extract-week-2026-W45",
    sampleSize: 100,
    missingDataState: "complete",
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [
      {
        evidenceId: "ev-trend-a",
        sourceRef: "fixture://trends/a",
        collectionMethod: CollectionMethod.FIXTURE,
        summary: "Fixture trend extract A",
        observedAtIso: nowIso,
        fixtureOnly: true,
      },
    ],
    observedAtIso: nowIso,
    createdAtIso: nowIso,
    fixtureOnly: true,
  });

  const rightSame = registerDemandObservation({
    observationId: "obs-trend-a2",
    kind: DemandSignalKind.TREND,
    queryOrTopic: "day pass meeting room",
    collectionMethod: CollectionMethod.FIXTURE,
    sourceSystem: "trends_fixture_a",
    rawValue: 60,
    unit: "relative_interest_index",
    comparabilityGroup: "extract-week-2026-W45",
    sampleSize: 100,
    missingDataState: "complete",
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [
      {
        evidenceId: "ev-trend-a2",
        sourceRef: "fixture://trends/a2",
        collectionMethod: CollectionMethod.FIXTURE,
        summary: "Fixture trend extract A week-over-week",
        observedAtIso: nowIso,
        fixtureOnly: true,
      },
    ],
    observedAtIso: nowIso,
    createdAtIso: nowIso,
    fixtureOnly: true,
  });

  const comparable = compareTrendIndices(left, rightSame);
  if (
    comparable.kind === "comparable" &&
    comparable.ratio === 1.5 &&
    comparable.label === "comparable"
  ) {
    details.push(
      "same comparability group + unit + source → comparable ratio=1.5",
    );
  } else {
    passed = false;
    details.push(`comparable control unexpectedly ${JSON.stringify(comparable)}`);
  }

  const otherExtract = registerDemandObservation({
    observationId: "obs-trend-b",
    kind: DemandSignalKind.TREND,
    queryOrTopic: "day pass meeting room",
    collectionMethod: CollectionMethod.FIXTURE,
    sourceSystem: "trends_fixture_a",
    rawValue: 90,
    unit: "relative_interest_index",
    comparabilityGroup: "extract-week-2026-W46-rescale",
    sampleSize: 100,
    missingDataState: "complete",
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [
      {
        evidenceId: "ev-trend-b",
        sourceRef: "fixture://trends/b",
        collectionMethod: CollectionMethod.FIXTURE,
        summary: "Rescaled different Trends extract",
        observedAtIso: nowIso,
        fixtureOnly: true,
      },
    ],
    observedAtIso: nowIso,
    createdAtIso: nowIso,
    fixtureOnly: true,
  });

  const rejectedGroup = compareTrendIndices(left, otherExtract);
  if (
    rejectedGroup.kind === "rejected" &&
    rejectedGroup.reason === "incomparable_group" &&
    rejectedGroup.label === "incomparable"
  ) {
    details.push(
      "different comparability groups → rejected/labeled incomparable (no ratio)",
    );
  } else {
    passed = false;
    details.push(
      `incomparable group unexpectedly ${JSON.stringify(rejectedGroup)}`,
    );
  }

  const unlabeledLeft = registerDemandObservation({
    observationId: "obs-trend-unlabeled",
    kind: DemandSignalKind.TREND,
    queryOrTopic: "coworking near PATH",
    collectionMethod: CollectionMethod.FIXTURE,
    sourceSystem: "trends_fixture_a",
    rawValue: 22,
    unit: "relative_interest_index",
    comparabilityGroup: null,
    sampleSize: 50,
    missingDataState: "complete",
    observedAtIso: nowIso,
    createdAtIso: nowIso,
    fixtureOnly: true,
  });
  const unlabeled = compareTrendIndices(unlabeledLeft, {
    kind: unlabeledLeft.kind,
    rawValue: 33,
    unit: unlabeledLeft.unit,
    comparabilityGroup: unlabeledLeft.comparabilityGroup,
    sourceSystem: unlabeledLeft.sourceSystem,
  });
  if (
    unlabeled.kind === "rejected" &&
    unlabeled.reason === "missing_comparability_group" &&
    unlabeled.label === "unlabeled"
  ) {
    details.push("missing comparability group → rejected/labeled unlabeled");
  } else {
    passed = false;
    details.push(`unlabeled unexpectedly ${JSON.stringify(unlabeled)}`);
  }

  const unitMismatch = compareTrendIndices(left, {
    ...rightSame,
    unit: "search_volume",
  });
  if (
    unitMismatch.kind === "rejected" &&
    unitMismatch.reason === "unit_mismatch" &&
    unitMismatch.label === "incomparable"
  ) {
    details.push("unit mismatch → rejected/labeled incomparable");
  } else {
    passed = false;
    details.push(`unit mismatch unexpectedly ${JSON.stringify(unitMismatch)}`);
  }

  const sourceMismatch = compareTrendIndices(left, {
    ...rightSame,
    sourceSystem: "trends_fixture_other_vendor",
  });
  if (
    sourceMismatch.kind === "rejected" &&
    sourceMismatch.reason === "source_mismatch" &&
    sourceMismatch.label === "incomparable"
  ) {
    details.push("sourceSystem mismatch → rejected/labeled incomparable");
  } else {
    passed = false;
    details.push(
      `source mismatch unexpectedly ${JSON.stringify(sourceMismatch)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-incomparable-trend-${randomUUID()}`,
    kind: SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-incomparable-trend-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
