/**
 * Fixture proof for T-US-010 / T-X033 — omitted/missing GSC rows are UNKNOWN
 * demand, never invent zero. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  SoakProofKind,
  classifyGscDemand,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-010 + T-X033 fixture ACCEPTED.
 */
export function proofGscOmittedRowsUnknownNotZero(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Omitted row → UNKNOWN demand, not zero.
  const omitted = classifyGscDemand({
    query: "quiet desks jersey city",
    clicks: null,
    impressions: null,
    omitted: true,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    omitted.demandLabel === "unknown" &&
    omitted.clicks.kind === "missing" &&
    omitted.impressions.kind === "missing" &&
    /UNKNOWN|not zero/i.test(omitted.reasons.join(" "))
  ) {
    details.push("Omitted GSC row → UNKNOWN demand (not zero)");
  } else {
    passed = false;
    details.push(`Omitted classification unexpectedly ${JSON.stringify(omitted)}`);
  }

  // Incomplete row (null clicks) also UNKNOWN — never invent 0.
  const incomplete = classifyGscDemand({
    query: "coworking near me",
    clicks: null,
    impressions: 100,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    incomplete.demandLabel === "unknown" &&
    incomplete.clicks.kind === "missing"
  ) {
    details.push("Incomplete GSC clicks → UNKNOWN (not invented zero)");
  } else {
    passed = false;
    details.push(
      `Incomplete classification unexpectedly ${JSON.stringify(incomplete)}`,
    );
  }

  // Positive control: complete fixture row stays fixture-labeled measured path.
  const complete = classifyGscDemand({
    query: "day pass",
    clicks: 42,
    impressions: 910,
    omitted: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    complete.demandLabel === "fixture" &&
    complete.clicks.kind === "measured" &&
    complete.clicks.value === 42
  ) {
    details.push("Complete fixture row → fixture demandLabel with measured clicks");
  } else {
    passed = false;
    details.push(`Complete classification unexpectedly ${JSON.stringify(complete)}`);
  }

  // NOT_WIRED stays unavailable — distinct from omitted-unknown.
  const notWired = classifyGscDemand({
    query: "day pass",
    clicks: 0,
    impressions: 0,
    omitted: false,
    environment: AnalyticsEnvironment.NOT_WIRED,
  });
  if (notWired.demandLabel === "unavailable") {
    details.push("NOT_WIRED GSC → unavailable (distinct from omitted UNKNOWN)");
  } else {
    passed = false;
    details.push(
      `NOT_WIRED classification unexpectedly ${JSON.stringify(notWired)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-gsc-omitted-${randomUUID()}`,
    kind: SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-gsc-omitted-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
