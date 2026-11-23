/**
 * Fixture proof for T-US-037 — Analyze and hypothesis; portable analysis artifact.
 * Definition → hypothesis → redacted decision brief; LIVE refused. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  SoakProofKind,
  createAnalysisDefinition,
  createAnalysisHypothesis,
  createDecisionBrief,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-037 fixture ACCEPTED.
 */
export function proofPortableAnalysisArtifact(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const definition = createAnalysisDefinition({
    definitionId: `def-us037-${randomUUID().slice(0, 8)}`,
    siteId: "site-fixture-us037",
    periodStartIso: "2026-11-01T00:00:00.000Z",
    periodEndIso: "2026-11-14T00:00:00.000Z",
    comparisonLabel: "prior_14d",
    reportingTimezone: "America/New_York",
    environment: AnalyticsEnvironment.FIXTURE,
    createdAtIso: nowIso,
  });
  if (definition.environment === AnalyticsEnvironment.FIXTURE) {
    details.push("Fixture analysis definition created (FIXTURE env)");
  } else {
    passed = false;
    details.push(`Definition env unexpectedly ${definition.environment}`);
  }

  try {
    createAnalysisDefinition({
      definitionId: `def-live-${randomUUID().slice(0, 8)}`,
      siteId: "site-live",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T00:00:00.000Z",
      comparisonLabel: "prior",
      reportingTimezone: "UTC",
      environment: AnalyticsEnvironment.LIVE,
      createdAtIso: nowIso,
    });
    passed = false;
    details.push("LIVE analysis definition unexpectedly allowed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/NOT_WIRED/i.test(msg)) {
      details.push("LIVE analysis definition refused (transport NOT_WIRED)");
    } else {
      passed = false;
      details.push(`LIVE refuse unexpected: ${msg}`);
    }
  }

  const incomplete = createAnalysisHypothesis({
    hypothesisId: `h-incomplete-${randomUUID().slice(0, 8)}`,
    definitionId: definition.definitionId,
    statement: "",
    primaryOutcome: "bookings",
    baseline: "2/week",
    comparison: "4/week",
    observationWindowDays: 14,
    createdAtIso: nowIso,
  });
  if (!incomplete.ok && incomplete.code === "INCOMPLETE_HYPOTHESIS") {
    details.push("Incomplete hypothesis → INCOMPLETE_HYPOTHESIS");
  } else {
    passed = false;
    details.push(`Incomplete hypothesis unexpectedly ${JSON.stringify(incomplete)}`);
  }

  const liveHyp = createAnalysisHypothesis({
    hypothesisId: `h-live-${randomUUID().slice(0, 8)}`,
    definitionId: definition.definitionId,
    statement: "Live lift claim",
    primaryOutcome: "bookings",
    baseline: "2/week",
    comparison: "4/week",
    observationWindowDays: 14,
    environment: AnalyticsEnvironment.LIVE,
    createdAtIso: nowIso,
  });
  if (!liveHyp.ok && liveHyp.code === "LIVE_REFUSED") {
    details.push("LIVE hypothesis persistence refused");
  } else {
    passed = false;
    details.push(`LIVE hypothesis unexpectedly ${JSON.stringify(liveHyp)}`);
  }

  const hyp = createAnalysisHypothesis({
    hypothesisId: `h-us037-${randomUUID().slice(0, 8)}`,
    definitionId: definition.definitionId,
    statement: "Clearer CTA lifts CRM-verified bookings",
    primaryOutcome: "CRM-verified bookings",
    baseline: "2/week",
    comparison: "4/week",
    observationWindowDays: 14,
    environment: AnalyticsEnvironment.FIXTURE,
    createdAtIso: nowIso,
  });
  if (!hyp.ok) {
    passed = false;
    details.push(`Fixture hypothesis unexpectedly ${JSON.stringify(hyp)}`);
  } else {
    details.push("Fixture hypothesis created with complete fields");

    const brief = createDecisionBrief({
      briefId: `brief-us037-${randomUUID().slice(0, 8)}`,
      definitionId: definition.definitionId,
      hypothesisId: hyp.hypothesis.hypothesisId,
      title: "Fixture F19 analysis brief",
      summary: "Supported by fixture GSC/GA4 observations only",
      sourceCaveats: ["FIXTURE ≠ LIVE", "No live Ads mutation"],
      proposedActions: ["Hold live spend", "Continue fixture observation window"],
      environment: AnalyticsEnvironment.FIXTURE,
      createdAtIso: nowIso,
    });

    if (brief.redacted !== true) {
      passed = false;
      details.push("Decision brief must be redacted=true for portable share");
    } else {
      details.push("Decision brief redacted=true");
    }

    const portable = {
      definition,
      hypothesis: hyp.hypothesis,
      brief,
    };
    let roundTrip: typeof portable;
    try {
      roundTrip = JSON.parse(JSON.stringify(portable)) as typeof portable;
    } catch (err) {
      passed = false;
      details.push(
        `Portable JSON serialize failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      roundTrip = portable;
    }

    if (
      roundTrip.definition.definitionId === definition.definitionId &&
      roundTrip.hypothesis.hypothesisId === hyp.hypothesis.hypothesisId &&
      roundTrip.brief.briefId === brief.briefId &&
      roundTrip.brief.redacted === true &&
      Array.isArray(roundTrip.brief.sourceCaveats) &&
      roundTrip.brief.sourceCaveats.includes("FIXTURE ≠ LIVE")
    ) {
      details.push(
        "Portable analysis artifact JSON round-trip preserves definition/hypothesis/brief",
      );
    } else {
      passed = false;
      details.push("Portable artifact round-trip lost required fields");
    }
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-portable-analysis-${randomUUID()}`,
    kind: SoakProofKind.PORTABLE_ANALYSIS_ARTIFACT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us037-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
