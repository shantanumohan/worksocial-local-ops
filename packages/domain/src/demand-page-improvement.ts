/**
 * T-US-027 — Demand → page improvement (F14/SC-07) — release receipt and
 * experiment window.
 *
 * Offline fixture gate: read observations + verified editable page exist;
 * match intent to page; create a visibility mission with plan + content
 * brief; capture exact revision diff; run independent QA; release under
 * policy with release receipt + experiment window (or block with a clear
 * reason). Keyword proliferation (many thin keyword pages) is refused —
 * prefer one useful page update (T-US-028 territory). Live CMS/provider
 * adapters stay NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type DemandPageObservation = {
  observationId: string;
  /** Recurring question or trend label. */
  demandLabel: string;
  sourceKind: "TREND" | "RECURRING_QUESTION" | "SEARCH_QUERY";
};

export type IntentPageMatch = {
  intentId: string;
  pageId: string;
  pagePath: string;
  /** Page must already be verified editable before improvement. */
  editableVerified: boolean;
  matchConfidence: "HIGH" | "MEDIUM" | "LOW";
};

export type VisibilityMissionPlan = {
  missionId: string;
  taskPlanId: string;
  contentBriefId: string;
  /** Source-backed brief — empty = incomplete. */
  briefSummary: string;
};

export type RevisionDiff = {
  revisionId: string;
  /** Unified or structured diff text for the exact revision. */
  exactDiff: string;
  changedPathCount: number;
};

export type IndependentQaBundle = {
  qaBundleId: string;
  qualityPassed: boolean;
  customerJourneyPassed: boolean;
};

export type ExperimentWindow = {
  experimentId: string;
  startsAtIso: string;
  endsAtIso: string;
};

export type DemandPageImprovementInput = {
  observations: readonly DemandPageObservation[];
  intentMatch: IntentPageMatch;
  mission: VisibilityMissionPlan;
  revision: RevisionDiff;
  qa: IndependentQaBundle;
  /** Owner/policy reviewed before release. */
  policyReviewed: boolean;
  releaseReceiptId: string | null;
  experimentWindow: ExperimentWindow | null;
  /**
   * Attempt to spawn many keyword-targeted thin pages instead of one useful
   * update — must refuse (T-US-028 territory).
   */
  requestKeywordProliferation: boolean;
  /** Request live CMS/provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type DemandPageImprovementDecision =
  | {
      allowed: true;
      code: "DEMAND_PAGE_IMPROVEMENT_RELEASED";
      releaseReceiptRecorded: true;
      experimentWindowRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        observationIds: string[];
        intentId: string;
        pageId: string;
        pagePath: string;
        missionId: string;
        taskPlanId: string;
        contentBriefId: string;
        revisionId: string;
        exactDiff: string;
        qaBundleId: string;
        releaseReceiptId: string;
        experimentId: string;
        experimentStartsAtIso: string;
        experimentEndsAtIso: string;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "OBSERVATIONS_REQUIRED"
        | "INTENT_PAGE_MATCH_INCOMPLETE"
        | "MISSION_PLAN_INCOMPLETE"
        | "REVISION_DIFF_INCOMPLETE"
        | "QA_BUNDLE_INCOMPLETE"
        | "POLICY_RELEASE_REQUIRED"
        | "EXPERIMENT_WINDOW_REQUIRED"
        | "KEYWORD_PROLIFERATION_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      releaseReceiptRecorded: false;
      experimentWindowRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const DEMAND_PAGE_IMPROVEMENT_RELATED_CASE_IDS = ["T-US-027"] as const;

/**
 * Evaluate the F14 demand → page improvement path offline.
 * Produces observation / intent-page / mission / diff / QA / release receipt /
 * experiment window evidence; live stays NOT_WIRED; keyword proliferation refused.
 */
export function evaluateDemandPageImprovement(
  input: DemandPageImprovementInput,
): DemandPageImprovementDecision {
  const base = {
    releaseReceiptRecorded: false as const,
    experimentWindowRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      reasons: [
        "Live demand→page improvement CMS/provider apply remains NOT_WIRED — refuse live wiring (T-US-027)",
      ],
    };
  }

  if (input.requestKeywordProliferation) {
    return {
      allowed: false,
      code: "KEYWORD_PROLIFERATION_REFUSED",
      ...base,
      reasons: [
        "Keyword proliferation refused — prefer one useful page update over many thin keyword pages (T-US-027); proliferation gate is T-US-028",
      ],
    };
  }

  if (input.observations.length === 0) {
    return {
      allowed: false,
      code: "OBSERVATIONS_REQUIRED",
      ...base,
      reasons: [
        "Demand→page improvement requires at least one observation ID (T-US-027)",
      ],
    };
  }
  for (const obs of input.observations) {
    if (!obs.observationId.trim() || !obs.demandLabel.trim()) {
      return {
        allowed: false,
        code: "OBSERVATIONS_REQUIRED",
        ...base,
        reasons: [
          "Each observation requires observationId and demandLabel (T-US-027)",
        ],
      };
    }
  }

  const match = input.intentMatch;
  if (
    !match.intentId.trim() ||
    !match.pageId.trim() ||
    !match.pagePath.trim() ||
    !match.editableVerified ||
    match.matchConfidence === "LOW"
  ) {
    return {
      allowed: false,
      code: "INTENT_PAGE_MATCH_INCOMPLETE",
      ...base,
      reasons: [
        "Intent-to-page match requires intentId, verified editable page, path, and non-LOW confidence (T-US-027)",
      ],
    };
  }

  const mission = input.mission;
  if (
    !mission.missionId.trim() ||
    !mission.taskPlanId.trim() ||
    !mission.contentBriefId.trim() ||
    !mission.briefSummary.trim()
  ) {
    return {
      allowed: false,
      code: "MISSION_PLAN_INCOMPLETE",
      ...base,
      reasons: [
        "Visibility mission requires missionId, taskPlanId, contentBriefId, and briefSummary (T-US-027)",
      ],
    };
  }

  const revision = input.revision;
  if (
    !revision.revisionId.trim() ||
    !revision.exactDiff.trim() ||
    !Number.isFinite(revision.changedPathCount) ||
    revision.changedPathCount < 1
  ) {
    return {
      allowed: false,
      code: "REVISION_DIFF_INCOMPLETE",
      ...base,
      reasons: [
        "Exact revision diff requires revisionId, non-empty exactDiff, and changedPathCount>=1 (T-US-027)",
      ],
    };
  }

  const qa = input.qa;
  if (
    !qa.qaBundleId.trim() ||
    !qa.qualityPassed ||
    !qa.customerJourneyPassed
  ) {
    return {
      allowed: false,
      code: "QA_BUNDLE_INCOMPLETE",
      ...base,
      reasons: [
        "Independent QA bundle requires qaBundleId and passing quality + customer-journey tests (T-US-027)",
      ],
    };
  }

  if (!input.policyReviewed || !input.releaseReceiptId?.trim()) {
    return {
      allowed: false,
      code: "POLICY_RELEASE_REQUIRED",
      ...base,
      reasons: [
        "Policy review and release receipt are required to release the page improvement (T-US-027)",
      ],
    };
  }

  const window = input.experimentWindow;
  if (
    !window ||
    !window.experimentId.trim() ||
    !window.startsAtIso.trim() ||
    !window.endsAtIso.trim()
  ) {
    return {
      allowed: false,
      code: "EXPERIMENT_WINDOW_REQUIRED",
      ...base,
      reasons: [
        "Experiment window requires experimentId, startsAtIso, and endsAtIso (T-US-027)",
      ],
    };
  }
  const startMs = Date.parse(window.startsAtIso);
  const endMs = Date.parse(window.endsAtIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      allowed: false,
      code: "EXPERIMENT_WINDOW_REQUIRED",
      ...base,
      reasons: [
        "Experiment window endsAtIso must be after startsAtIso (T-US-027)",
      ],
    };
  }

  return {
    allowed: true,
    code: "DEMAND_PAGE_IMPROVEMENT_RELEASED",
    releaseReceiptRecorded: true,
    experimentWindowRecorded: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      observationIds: input.observations.map((o) => o.observationId),
      intentId: match.intentId,
      pageId: match.pageId,
      pagePath: match.pagePath,
      missionId: mission.missionId,
      taskPlanId: mission.taskPlanId,
      contentBriefId: mission.contentBriefId,
      revisionId: revision.revisionId,
      exactDiff: revision.exactDiff,
      qaBundleId: qa.qaBundleId,
      releaseReceiptId: input.releaseReceiptId!,
      experimentId: window.experimentId,
      experimentStartsAtIso: window.startsAtIso,
      experimentEndsAtIso: window.endsAtIso,
    },
    reasons: [
      `Demand observations [${input.observations.map((o) => o.observationId).join(", ")}] matched intent ${match.intentId} → page ${match.pageId}`,
      `Visibility mission ${mission.missionId} with brief ${mission.contentBriefId}; revision ${revision.revisionId}`,
      `Independent QA ${qa.qaBundleId} passed; release receipt ${input.releaseReceiptId}; experiment ${window.experimentId}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
