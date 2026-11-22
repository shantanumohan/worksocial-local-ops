/**
 * Fixture proof for T-US-027 — Demand → page improvement (release receipt +
 * experiment window). Observation IDs, intent-to-page match, visibility
 * mission + content brief, exact revision diff, independent QA, release
 * receipt + experiment window. Keyword proliferation refused; live NOT_WIRED.
 * Distinct from T-US-025 / T-US-026 / T-US-028. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateDemandPageImprovement,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-027 fixture ACCEPTED.
 */
export function proofDemandPageImprovementReleaseReceipt(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const endsAt = new Date(Date.parse(nowIso) + 14 * 86_400_000).toISOString();

  const ready = evaluateDemandPageImprovement({
    observations: [
      {
        observationId: "obs-us027-trend",
        demandLabel: "private office acoustic privacy",
        sourceKind: "TREND",
      },
      {
        observationId: "obs-us027-question",
        demandLabel: "how quiet are phone booths",
        sourceKind: "RECURRING_QUESTION",
      },
    ],
    intentMatch: {
      intentId: "intent-acoustic-faq",
      pageId: "page-acoustic-guide",
      pagePath: "/guides/acoustic-privacy",
      editableVerified: true,
      matchConfidence: "HIGH",
    },
    mission: {
      missionId: "mission-us027",
      taskPlanId: "plan-us027",
      contentBriefId: "brief-us027",
      briefSummary:
        "Source-backed acoustic privacy FAQ update for recurring demand",
    },
    revision: {
      revisionId: "rev-us027",
      exactDiff:
        "--- a/guides/acoustic-privacy.md\n+++ b/guides/acoustic-privacy.md\n@@\n+Measured booth attenuation\n",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-us027",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "rcpt-release-us027",
    experimentWindow: {
      experimentId: "exp-us027",
      startsAtIso: nowIso,
      endsAtIso: endsAt,
    },
    requestKeywordProliferation: false,
    requestLiveProviderWiring: false,
  });
  if (
    ready.allowed &&
    ready.code === "DEMAND_PAGE_IMPROVEMENT_RELEASED" &&
    ready.releaseReceiptRecorded &&
    ready.experimentWindowRecorded &&
    ready.liveProviderWiring === "NOT_WIRED" &&
    ready.externalEffects === "NONE" &&
    ready.evidence.releaseReceiptId === "rcpt-release-us027" &&
    ready.evidence.experimentId === "exp-us027" &&
    ready.evidence.observationIds.length === 2 &&
    ready.evidence.exactDiff.includes("Measured booth attenuation")
  ) {
    details.push(
      "Ready → DEMAND_PAGE_IMPROVEMENT_RELEASED; observations matched; release receipt + experiment window; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Ready unexpectedly ${JSON.stringify(ready)}`);
  }

  const proliferation = evaluateDemandPageImprovement({
    observations: [
      {
        observationId: "obs-us027-trend",
        demandLabel: "private office acoustic privacy",
        sourceKind: "TREND",
      },
    ],
    intentMatch: {
      intentId: "intent-acoustic-faq",
      pageId: "page-acoustic-guide",
      pagePath: "/guides/acoustic-privacy",
      editableVerified: true,
      matchConfidence: "HIGH",
    },
    mission: {
      missionId: "mission-us027",
      taskPlanId: "plan-us027",
      contentBriefId: "brief-us027",
      briefSummary: "ok",
    },
    revision: {
      revisionId: "rev-us027",
      exactDiff: "+x",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-us027",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "rcpt-release-us027",
    experimentWindow: {
      experimentId: "exp-us027",
      startsAtIso: nowIso,
      endsAtIso: endsAt,
    },
    requestKeywordProliferation: true,
    requestLiveProviderWiring: false,
  });
  if (
    !proliferation.allowed &&
    proliferation.code === "KEYWORD_PROLIFERATION_REFUSED"
  ) {
    details.push("requestKeywordProliferation → KEYWORD_PROLIFERATION_REFUSED");
  } else {
    passed = false;
    details.push(
      `Keyword proliferation unexpectedly ${JSON.stringify(proliferation)}`,
    );
  }

  const live = evaluateDemandPageImprovement({
    observations: [
      {
        observationId: "obs-us027-trend",
        demandLabel: "private office acoustic privacy",
        sourceKind: "TREND",
      },
    ],
    intentMatch: {
      intentId: "intent-acoustic-faq",
      pageId: "page-acoustic-guide",
      pagePath: "/guides/acoustic-privacy",
      editableVerified: true,
      matchConfidence: "HIGH",
    },
    mission: {
      missionId: "mission-us027",
      taskPlanId: "plan-us027",
      contentBriefId: "brief-us027",
      briefSummary: "ok",
    },
    revision: {
      revisionId: "rev-us027",
      exactDiff: "+x",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-us027",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "rcpt-release-us027",
    experimentWindow: {
      experimentId: "exp-us027",
      startsAtIso: nowIso,
      endsAtIso: endsAt,
    },
    requestKeywordProliferation: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  const blocked = evaluateDemandPageImprovement({
    observations: [],
    intentMatch: {
      intentId: "intent-acoustic-faq",
      pageId: "page-acoustic-guide",
      pagePath: "/guides/acoustic-privacy",
      editableVerified: true,
      matchConfidence: "HIGH",
    },
    mission: {
      missionId: "mission-us027",
      taskPlanId: "plan-us027",
      contentBriefId: "brief-us027",
      briefSummary: "ok",
    },
    revision: {
      revisionId: "rev-us027",
      exactDiff: "+x",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-us027",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "rcpt-release-us027",
    experimentWindow: {
      experimentId: "exp-us027",
      startsAtIso: nowIso,
      endsAtIso: endsAt,
    },
    requestKeywordProliferation: false,
    requestLiveProviderWiring: false,
  });
  if (!blocked.allowed && blocked.code === "OBSERVATIONS_REQUIRED") {
    details.push("Missing observations → OBSERVATIONS_REQUIRED (clear block)");
  } else {
    passed = false;
    details.push(`Missing observations unexpectedly ${JSON.stringify(blocked)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-025 (workstream launch), T-US-026 (missed schedule coalesce), and T-US-028 (keyword proliferation gate)",
  );

  return {
    proofId: `proof-demand-page-${randomUUID()}`,
    kind: SoakProofKind.DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-demand-page-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
