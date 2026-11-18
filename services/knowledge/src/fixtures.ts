/**
 * Fixture demand / fact adapters for R1-06.
 * No live SERP or Trends API — offline sample observations only.
 */

import {
  CollectionMethod,
  DemandSignalKind,
  SupportLabel,
  type DemandObservation,
  type EvidenceLink,
  type FactRecord,
} from "@worksocial/domain";
import { registerDemandObservation, registerFact } from "@worksocial/domain";

export const FIXTURE_DEMAND_SOURCE = "fixture_demand" as const;

export function fixtureEvidence(
  evidenceId: string,
  summary: string,
  nowIso: string,
): EvidenceLink {
  return {
    evidenceId,
    sourceRef: `fixture://knowledge/${evidenceId}`,
    collectionMethod: CollectionMethod.FIXTURE,
    summary,
    observedAtIso: nowIso,
    fixtureOnly: true,
  };
}

/** Seed a small honest fixture corpus for console demos. */
export function buildFixtureKnowledgeSeed(nowIso: string): {
  facts: FactRecord[];
  demandSignals: DemandObservation[];
} {
  const hours = registerFact({
    factId: "fixture-fact-hours",
    statement: "WorkSocial Jersey City weekday lobby hours end at 22:00 local",
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [
      fixtureEvidence("ev-hours", "Owner-declared hours fixture", nowIso),
    ],
    provenance: {
      registeredBy: "fixture",
      collectionMethod: CollectionMethod.OWNER_DECLARED,
      sourceSystem: "fixture_owner",
      observedAtIso: nowIso,
      modelGenerated: false,
    },
    createdAtIso: nowIso,
  });

  const hypothesis = registerFact({
    factId: "fixture-fact-hypothesis",
    statement: "Prospects increasingly ask about rooftop AV packages",
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [],
    provenance: {
      registeredBy: "fixture",
      collectionMethod: CollectionMethod.MODEL_GENERATED,
      sourceSystem: "fixture_model",
      observedAtIso: nowIso,
      modelGenerated: true,
    },
    createdAtIso: nowIso,
  });

  const facts: FactRecord[] = [];
  if (hours.ok) facts.push(hours.fact);
  if (hypothesis.ok) facts.push(hypothesis.fact);

  const demandSignals: DemandObservation[] = [
    registerDemandObservation({
      observationId: "fixture-trend-daypass",
      kind: DemandSignalKind.TREND,
      queryOrTopic: "day pass meeting room jersey city",
      normalizedIntent: "day_pass_meeting_room",
      geography: "US-NJ",
      device: "desktop",
      language: "en",
      searchSurface: "web",
      collectionMethod: CollectionMethod.FIXTURE,
      sourceSystem: FIXTURE_DEMAND_SOURCE,
      evidenceLinks: [
        fixtureEvidence("ev-trend-daypass", "Fixture trend cluster", nowIso),
      ],
      requestedLabel: SupportLabel.SUPPORTED,
      sampleSize: 40,
      rawValue: 1.4,
      normalizedValue: 1.4,
      unit: "relative_interest_index",
      missingDataState: "complete",
      comparabilityGroup: "fixture-week-over-week",
      observedAtIso: nowIso,
      coveredPeriodStartIso: "2026-11-01T00:00:00.000Z",
      coveredPeriodEndIso: "2026-11-14T23:59:59.000Z",
      createdAtIso: nowIso,
      fixtureOnly: true,
    }),
    registerDemandObservation({
      observationId: "fixture-faq-parking",
      kind: DemandSignalKind.FAQ,
      queryOrTopic: "Is parking included with a day pass?",
      normalizedIntent: "parking_inclusion",
      collectionMethod: CollectionMethod.FIXTURE,
      sourceSystem: FIXTURE_DEMAND_SOURCE,
      evidenceLinks: [
        fixtureEvidence("ev-faq-parking", "Fixture FAQ from de-identified inquiries", nowIso),
      ],
      requestedLabel: SupportLabel.SUPPORTED,
      sampleSize: 8,
      missingDataState: "complete",
      observedAtIso: nowIso,
      createdAtIso: nowIso,
      fixtureOnly: true,
    }),
    registerDemandObservation({
      observationId: "fixture-rank-omitted",
      kind: DemandSignalKind.RANK,
      queryOrTopic: "coworking near exchange place",
      collectionMethod: CollectionMethod.PLATFORM_EXPORT,
      sourceSystem: "search_console_fixture",
      missingDataState: "omitted",
      requestedLabel: SupportLabel.SUPPORTED,
      observedAtIso: nowIso,
      createdAtIso: nowIso,
      fixtureOnly: true,
      notes: ["Search Console omission demo"],
    }),
    registerDemandObservation({
      observationId: "fixture-rank-manual",
      kind: DemandSignalKind.RANK,
      queryOrTopic: "WorkSocial Jersey City ChatGPT mention",
      collectionMethod: CollectionMethod.MANUAL_SAMPLE,
      sourceSystem: "chatgpt_manual_sample",
      sampleSize: 2,
      requestedLabel: SupportLabel.SUPPORTED,
      observedAtIso: nowIso,
      createdAtIso: nowIso,
      fixtureOnly: true,
    }),
  ];

  return { facts, demandSignals };
}
