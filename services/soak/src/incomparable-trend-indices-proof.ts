/**
 * Fixture proof for T-X041 — incomparable trend indices → reject/label.
 *
 * Never divides arbitrary indices from different data extracts. Same
 * comparability group + unit + sourceSystem required before a ratio is
 * allowed. Unit/source matching is trim + case-insensitive. External
 * effects: NONE. Never invents live VERIFIED.
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
    comparable.label === "comparable" &&
    comparable.liveProviderWiring === "NOT_WIRED" &&
    comparable.externalEffects === "NONE"
  ) {
    details.push(
      "same comparability group + unit + source → comparable ratio=1.5 (honesty NOT_WIRED/NONE)",
    );
  } else {
    passed = false;
    details.push(`comparable control unexpectedly ${JSON.stringify(comparable)}`);
  }

  // Case/whitespace-normalized unit + source still comparable.
  const normalized = compareTrendIndices(left, {
    kind: rightSame.kind,
    rawValue: 80,
    unit: " Relative_Interest_Index ",
    comparabilityGroup: "extract-week-2026-W45",
    sourceSystem: " Trends_Fixture_A ",
  });
  if (
    normalized.kind === "comparable" &&
    normalized.ratio === 2 &&
    normalized.externalEffects === "NONE"
  ) {
    details.push(
      "case/whitespace-normalized unit+source → comparable ratio=2",
    );
  } else {
    passed = false;
    details.push(
      `normalized comparable unexpectedly ${JSON.stringify(normalized)}`,
    );
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
    rejectedGroup.label === "incomparable" &&
    rejectedGroup.externalEffects === "NONE"
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

  const blankGroup = compareTrendIndices(
    {
      kind: left.kind,
      rawValue: left.rawValue,
      unit: left.unit,
      comparabilityGroup: "   ",
      sourceSystem: left.sourceSystem,
    },
    {
      kind: rightSame.kind,
      rawValue: rightSame.rawValue,
      unit: rightSame.unit,
      comparabilityGroup: "   ",
      sourceSystem: rightSame.sourceSystem,
    },
  );
  if (
    blankGroup.kind === "rejected" &&
    blankGroup.reason === "missing_comparability_group" &&
    blankGroup.label === "unlabeled"
  ) {
    details.push("whitespace-only comparability group → rejected/labeled unlabeled");
  } else {
    passed = false;
    details.push(`blank group unexpectedly ${JSON.stringify(blankGroup)}`);
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

  const zeroBaseline = compareTrendIndices(
    {
      kind: left.kind,
      rawValue: 0,
      unit: left.unit,
      comparabilityGroup: left.comparabilityGroup,
      sourceSystem: left.sourceSystem,
    },
    {
      kind: rightSame.kind,
      rawValue: 40,
      unit: rightSame.unit,
      comparabilityGroup: rightSame.comparabilityGroup,
      sourceSystem: rightSame.sourceSystem,
    },
  );
  if (
    zeroBaseline.kind === "rejected" &&
    zeroBaseline.reason === "zero_baseline" &&
    zeroBaseline.label === "invalid"
  ) {
    details.push("zero baseline → rejected/labeled invalid (no ratio)");
  } else {
    passed = false;
    details.push(`zero baseline unexpectedly ${JSON.stringify(zeroBaseline)}`);
  }

  const nonTrend = compareTrendIndices(
    {
      kind: DemandSignalKind.FAQ,
      rawValue: 10,
      unit: left.unit,
      comparabilityGroup: left.comparabilityGroup,
      sourceSystem: left.sourceSystem,
    },
    rightSame,
  );
  if (
    nonTrend.kind === "rejected" &&
    nonTrend.reason === "non_trend" &&
    nonTrend.label === "invalid"
  ) {
    details.push("non-trend kind → rejected/labeled invalid");
  } else {
    passed = false;
    details.push(`non-trend unexpectedly ${JSON.stringify(nonTrend)}`);
  }

  const missingValue = compareTrendIndices(
    {
      kind: left.kind,
      rawValue: null,
      unit: left.unit,
      comparabilityGroup: left.comparabilityGroup,
      sourceSystem: left.sourceSystem,
    },
    rightSame,
  );
  if (
    missingValue.kind === "rejected" &&
    missingValue.reason === "missing_value" &&
    missingValue.label === "invalid"
  ) {
    details.push("missing rawValue → rejected/labeled invalid");
  } else {
    passed = false;
    details.push(`missing value unexpectedly ${JSON.stringify(missingValue)}`);
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
