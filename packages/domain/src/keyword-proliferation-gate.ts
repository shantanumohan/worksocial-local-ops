/**
 * T-US-028 — Prefer one useful page update over keyword proliferation.
 *
 * Offline fixture gate (failure/gate family): when demand suggests many
 * keyword-targeted thin pages, refuse proliferation and prefer a single
 * useful update to an existing verified editable page. Preserves blocked
 * inputs, records the blocking decision, current state, and recovery path
 * (collapse to one page update). Live CMS/provider adapters stay NOT_WIRED.
 * Distinct from T-US-027 (demand→page improvement release receipt +
 * experiment window). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type ProposedKeywordPage = {
  proposedPageId: string;
  /** Target keyword / thin-page slug. */
  keywordSlug: string;
  /** Thin page body / outline — empty = incomplete proposal. */
  thinOutline: string;
};

export type PreferredUsefulPageUpdate = {
  pageId: string;
  pagePath: string;
  /** Page must already be verified editable. */
  editableVerified: boolean;
  /** Single useful revision summary (not a swarm of thin pages). */
  usefulUpdateSummary: string;
};

export type KeywordProliferationGateInput = {
  /** Demand / intent label that motivated the proposals. */
  demandLabel: string;
  /** Many thin keyword pages — refused when length > 1 (or any when proliferation requested). */
  proposedKeywordPages: readonly ProposedKeywordPage[];
  /** The one useful page update that should be preferred. */
  preferredUpdate: PreferredUsefulPageUpdate | null;
  /** Explicit request to proliferate keyword pages — must refuse. */
  requestKeywordProliferation: boolean;
  /** Attempt to claim success despite proliferation — must refuse. */
  claimSuccessDespiteProliferation: boolean;
  /** Request live CMS/provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type KeywordProliferationGateDecision =
  | {
      allowed: true;
      code: "ONE_USEFUL_PAGE_UPDATE_PREFERRED";
      proliferationRefused: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        demandLabel: string;
        preferredPageId: string;
        preferredPagePath: string;
        usefulUpdateSummary: string;
        refusedProposedPageIds: string[];
        blockingDecision: "KEYWORD_PROLIFERATION_REFUSED";
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DEMAND_LABEL_REQUIRED"
        | "PREFERRED_UPDATE_INCOMPLETE"
        | "KEYWORD_PROLIFERATION_REFUSED"
        | "FALSE_SUCCESS_CLAIM_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      proliferationRefused: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        demandLabel: string;
        refusedProposedPageIds: string[];
        blockingDecision: string;
        currentState: "BLOCKED";
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const KEYWORD_PROLIFERATION_GATE_RELATED_CASE_IDS = [
  "T-US-028",
] as const;

function preservedInputCount(
  input: KeywordProliferationGateInput,
): number {
  return (
    input.proposedKeywordPages.length +
    (input.preferredUpdate ? 1 : 0) +
    (input.demandLabel.trim() ? 1 : 0)
  );
}

function refusedProposedPageIds(
  pages: readonly ProposedKeywordPage[],
): string[] {
  return pages.map((p) => p.proposedPageId);
}

/**
 * Evaluate the keyword-proliferation vs one-useful-update gate offline.
 * Proliferation and false success claims are refused; live stays NOT_WIRED.
 */
export function evaluateKeywordProliferationGate(
  input: KeywordProliferationGateInput,
): KeywordProliferationGateDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
  };

  const preserved = preservedInputCount(input);
  const refusedIds = refusedProposedPageIds(input.proposedKeywordPages);

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      proliferationRefused: true,
      ...base,
      evidence: {
        demandLabel: input.demandLabel,
        refusedProposedPageIds: refusedIds,
        blockingDecision: "LIVE_PROVIDER_WIRING_NOT_WIRED",
        currentState: "BLOCKED",
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
        preservedInputCount: preserved,
      },
      reasons: [
        "Live keyword-proliferation / page-update CMS apply remains NOT_WIRED — refuse live wiring (T-US-028)",
      ],
    };
  }

  if (!input.demandLabel.trim()) {
    return {
      allowed: false,
      code: "DEMAND_LABEL_REQUIRED",
      proliferationRefused: true,
      ...base,
      evidence: {
        demandLabel: "",
        refusedProposedPageIds: refusedIds,
        blockingDecision: "DEMAND_LABEL_REQUIRED",
        currentState: "BLOCKED",
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
        preservedInputCount: preserved,
      },
      reasons: [
        "Demand label required before preferring one useful page update (T-US-028)",
      ],
    };
  }

  const proliferating =
    input.requestKeywordProliferation ||
    input.proposedKeywordPages.length > 1;

  if (proliferating) {
    if (input.claimSuccessDespiteProliferation) {
      return {
        allowed: false,
        code: "FALSE_SUCCESS_CLAIM_REFUSED",
        proliferationRefused: true,
        ...base,
        evidence: {
          demandLabel: input.demandLabel,
          refusedProposedPageIds: refusedIds,
          blockingDecision: "FALSE_SUCCESS_CLAIM_REFUSED",
          currentState: "BLOCKED",
          recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
          preservedInputCount: preserved,
        },
        reasons: [
          `Refused false success claim for keyword proliferation (${input.proposedKeywordPages.length} proposed thin pages) (T-US-028)`,
        ],
      };
    }
    return {
      allowed: false,
      code: "KEYWORD_PROLIFERATION_REFUSED",
      proliferationRefused: true,
      ...base,
      evidence: {
        demandLabel: input.demandLabel,
        refusedProposedPageIds: refusedIds,
        blockingDecision: "KEYWORD_PROLIFERATION_REFUSED",
        currentState: "BLOCKED",
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
        preservedInputCount: preserved,
      },
      reasons: [
        `Keyword proliferation refused — ${input.proposedKeywordPages.length} thin keyword page(s) blocked; prefer one useful page update (T-US-028)`,
        `Preserved inputs=${preserved}; recoveryPath=COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE`,
      ],
    };
  }

  if (input.claimSuccessDespiteProliferation) {
    return {
      allowed: false,
      code: "FALSE_SUCCESS_CLAIM_REFUSED",
      proliferationRefused: true,
      ...base,
      evidence: {
        demandLabel: input.demandLabel,
        refusedProposedPageIds: refusedIds,
        blockingDecision: "FALSE_SUCCESS_CLAIM_REFUSED",
        currentState: "BLOCKED",
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
        preservedInputCount: preserved,
      },
      reasons: [
        "claimSuccessDespiteProliferation is incoherent when not proliferating — refuse (T-US-028)",
      ],
    };
  }

  const preferred = input.preferredUpdate;
  if (
    !preferred ||
    !preferred.pageId.trim() ||
    !preferred.pagePath.trim() ||
    !preferred.editableVerified ||
    !preferred.usefulUpdateSummary.trim()
  ) {
    return {
      allowed: false,
      code: "PREFERRED_UPDATE_INCOMPLETE",
      proliferationRefused: true,
      ...base,
      evidence: {
        demandLabel: input.demandLabel,
        refusedProposedPageIds: refusedIds,
        blockingDecision: "PREFERRED_UPDATE_INCOMPLETE",
        currentState: "BLOCKED",
        recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
        preservedInputCount: preserved,
      },
      reasons: [
        "One useful page update requires verified editable pageId/path and usefulUpdateSummary (T-US-028)",
      ],
    };
  }

  return {
    allowed: true,
    code: "ONE_USEFUL_PAGE_UPDATE_PREFERRED",
    proliferationRefused: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      demandLabel: input.demandLabel,
      preferredPageId: preferred.pageId,
      preferredPagePath: preferred.pagePath,
      usefulUpdateSummary: preferred.usefulUpdateSummary,
      refusedProposedPageIds: refusedIds,
      blockingDecision: "KEYWORD_PROLIFERATION_REFUSED",
      recoveryPath: "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
      preservedInputCount: preserved,
    },
    reasons: [
      `Preferred one useful update on ${preferred.pageId} (${preferred.pagePath}) for demand "${input.demandLabel}"`,
      `Proliferation refused; refusedProposedPageIds=[${refusedIds.join(", ") || "(none)"}]`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
