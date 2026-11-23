/**
 * T-US-050 — Owner brief groups root cause; actionable.
 *
 * Offline fixture gate (failure/gate family): the owner morning brief must
 * group repeated incident signals by root cause and attach an actionable next
 * step to each group. Ungrouped notification floods and non-actionable groups
 * are refused. Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod
 * VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-049 (daily owner review operating knowledge / F25 happy
 * path) and T-X068 (thirty alerts one outage platform coalesce).
 */

export type BriefActionKind =
  | "ACKNOWLEDGE"
  | "ASSIGN"
  | "REPAIR"
  | "ESCALATE"
  | "OBSERVE"
  | "HOLD";

export type IncidentSignal = {
  signalId: string;
  /** Shared key that defines the root-cause group. */
  rootCauseKey: string;
  summary: string;
};

export type BriefGroupAction = {
  kind: BriefActionKind;
  /** Human-readable next step the owner can take. */
  summary: string;
};

export type OwnerBriefGroup = {
  rootCauseKey: string;
  title: string;
  /** Count of signals folded into this group. */
  signalCount: number;
  action: BriefGroupAction | null;
};

export type OwnerBriefRootCauseInput = {
  briefId: string;
  signals: readonly IncidentSignal[];
  /** Proposed brief grouping presented to the owner. */
  groups: readonly OwnerBriefGroup[];
  /**
   * Attempt to emit one notification per signal without grouping — refused
   * when multiple signals share a root cause.
   */
  emitUngroupedFlood: boolean;
  /**
   * Present groups while deliberately omitting actionable next steps —
   * refused.
   */
  omitActionOnGroup: boolean;
  /** Claim the brief is live-verified — must refuse offline. */
  claimLiveVerifiedBrief: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the brief surface — refuse. */
  attemptProductionWrite: boolean;
};

export type OwnerBriefRootCauseDecision =
  | {
      allowed: true;
      code: "OWNER_BRIEF_ROOT_CAUSE_GROUPED_ACTIONABLE";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        briefId: string;
        rawSignalCount: number;
        groupCount: number;
        actionableGroupCount: number;
        maxSignalsInGroup: number;
        groupingReducedNoise: boolean;
        ungroupedFlood: false;
        briefVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState: "BRIEF_GROUPED_ACTIONABLE";
        recoveryPath: "KEEP_ROOT_CAUSE_GROUPS_WITH_ACTIONS";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "BRIEF_IDENTITY_REQUIRED"
        | "SIGNALS_REQUIRED"
        | "UNGROUPED_FLOOD_REFUSED"
        | "NON_ACTIONABLE_GROUP_REFUSED"
        | "GROUPING_MISMATCH"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_BRIEF_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        briefId: string | null;
        rawSignalCount: number;
        groupCount: number;
        actionableGroupCount: number;
        maxSignalsInGroup: number;
        groupingReducedNoise: boolean;
        ungroupedFlood: boolean;
        briefVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_GROUPED_BRIEF"
          | "AWAITING_ACTIONABLE_GROUPS";
        recoveryPath:
          | "GROUP_BY_ROOT_CAUSE"
          | "ATTACH_ACTIONABLE_NEXT_STEP"
          | "COMPLETE_BRIEF_IDENTITY";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const OWNER_BRIEF_ROOT_CAUSE_RELATED_CASE_IDS = [
  "T-US-050",
  "T-F25",
] as const;

function preservedInputCount(input: OwnerBriefRootCauseInput): number {
  return (
    (input.briefId.trim() ? 1 : 0) +
    (input.signals.length > 0 ? 1 : 0) +
    (input.groups.length > 0 ? 1 : 0)
  );
}

function countByRootCause(
  signals: readonly IncidentSignal[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of signals) {
    const key = s.rootCauseKey.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/**
 * Evaluate owner-brief root-cause grouping offline.
 * Happy path → OWNER_BRIEF_ROOT_CAUSE_GROUPED_ACTIONABLE; live stays
 * NOT_WIRED; ungrouped floods and non-actionable groups refused.
 */
export function evaluateOwnerBriefRootCause(
  input: OwnerBriefRootCauseInput,
): OwnerBriefRootCauseDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const byCause = countByRootCause(input.signals);
  const rawSignalCount = input.signals.length;
  const groupCount = input.groups.length;
  const actionableGroupCount = input.groups.filter(
    (g) =>
      g.action !== null &&
      Boolean(g.action.kind) &&
      Boolean(g.action.summary.trim()),
  ).length;
  const maxSignalsInGroup = input.groups.reduce(
    (max, g) => Math.max(max, g.signalCount),
    0,
  );
  const expectedDistinct = byCause.size;
  const groupingReducedNoise =
    rawSignalCount > 0 && groupCount < rawSignalCount && groupCount > 0;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_GROUPED_BRIEF"
      | "AWAITING_ACTIONABLE_GROUPS",
    recoveryPath:
      | "GROUP_BY_ROOT_CAUSE"
      | "ATTACH_ACTIONABLE_NEXT_STEP"
      | "COMPLETE_BRIEF_IDENTITY",
    ungroupedFlood: boolean,
  ): NonNullable<
    Extract<OwnerBriefRootCauseDecision, { allowed: false }>["evidence"]
  > => ({
    briefId: input.briefId.trim() || null,
    rawSignalCount,
    groupCount,
    actionableGroupCount,
    maxSignalsInGroup,
    groupingReducedNoise,
    ungroupedFlood,
    briefVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live owner-brief provider wiring remains NOT_WIRED — refuse live wiring (T-US-050)",
      ],
    };
  }

  if (input.claimLiveVerifiedBrief) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_BRIEF_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified owner brief claim offline (T-US-050) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptProductionWrite) {
    return {
      allowed: false,
      code: "PRODUCTION_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_WRITE_FROM_OWNER_BRIEF_REFUSED",
        "BLOCKED",
        "COMPLETE_BRIEF_IDENTITY",
        false,
      ),
      reasons: [
        "Owner brief must not perform production writes offline (T-US-050)",
      ],
    };
  }

  if (!input.briefId.trim()) {
    return {
      allowed: false,
      code: "BRIEF_IDENTITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BRIEF_ID_MISSING",
        "BLOCKED",
        "COMPLETE_BRIEF_IDENTITY",
        false,
      ),
      reasons: ["Owner brief requires a briefId (T-US-050)"],
    };
  }

  if (rawSignalCount === 0) {
    return {
      allowed: false,
      code: "SIGNALS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "NO_INCIDENT_SIGNALS",
        "AWAITING_GROUPED_BRIEF",
        "GROUP_BY_ROOT_CAUSE",
        false,
      ),
      reasons: [
        "Owner brief root-cause gate requires incident signals to group (T-US-050)",
      ],
    };
  }

  for (const s of input.signals) {
    if (!s.signalId.trim() || !s.rootCauseKey.trim() || !s.summary.trim()) {
      return {
        allowed: false,
        code: "SIGNALS_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "SIGNAL_FIELDS_INCOMPLETE",
          "AWAITING_GROUPED_BRIEF",
          "GROUP_BY_ROOT_CAUSE",
          false,
        ),
        reasons: [
          "Each incident signal needs signalId, rootCauseKey, and summary (T-US-050)",
        ],
      };
    }
  }

  const hasDuplicateRootCause = [...byCause.values()].some((n) => n > 1);

  if (input.emitUngroupedFlood && hasDuplicateRootCause) {
    return {
      allowed: false,
      code: "UNGROUPED_FLOOD_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "UNGROUPED_NOTIFICATION_FLOOD",
        "AWAITING_GROUPED_BRIEF",
        "GROUP_BY_ROOT_CAUSE",
        true,
      ),
      reasons: [
        "Refuse ungrouped notification flood when multiple signals share a root cause (T-US-050) — distinct from T-X068 platform alert coalesce",
      ],
    };
  }

  // Groups must cover exactly the distinct root causes with matching counts.
  if (groupCount !== expectedDistinct) {
    return {
      allowed: false,
      code: "GROUPING_MISMATCH",
      ...base,
      evidence: blockedEvidence(
        "GROUP_COUNT_DOES_NOT_MATCH_DISTINCT_ROOT_CAUSES",
        "AWAITING_GROUPED_BRIEF",
        "GROUP_BY_ROOT_CAUSE",
        false,
      ),
      reasons: [
        `Owner brief must present one group per distinct root cause (expected ${expectedDistinct}, got ${groupCount}) (T-US-050)`,
      ],
    };
  }

  const seenKeys = new Set<string>();
  for (const g of input.groups) {
    const key = g.rootCauseKey.trim();
    if (!key || !g.title.trim() || g.signalCount < 1) {
      return {
        allowed: false,
        code: "GROUPING_MISMATCH",
        ...base,
        evidence: blockedEvidence(
          "GROUP_FIELDS_INCOMPLETE",
          "AWAITING_GROUPED_BRIEF",
          "GROUP_BY_ROOT_CAUSE",
          false,
        ),
        reasons: [
          "Each brief group needs rootCauseKey, title, and signalCount ≥ 1 (T-US-050)",
        ],
      };
    }
    if (seenKeys.has(key)) {
      return {
        allowed: false,
        code: "GROUPING_MISMATCH",
        ...base,
        evidence: blockedEvidence(
          "DUPLICATE_GROUP_ROOT_CAUSE_KEY",
          "AWAITING_GROUPED_BRIEF",
          "GROUP_BY_ROOT_CAUSE",
          false,
        ),
        reasons: [
          "Brief groups must not duplicate the same rootCauseKey (T-US-050)",
        ],
      };
    }
    seenKeys.add(key);
    const expectedCount = byCause.get(key);
    if (expectedCount === undefined || expectedCount !== g.signalCount) {
      return {
        allowed: false,
        code: "GROUPING_MISMATCH",
        ...base,
        evidence: blockedEvidence(
          "GROUP_SIGNAL_COUNT_MISMATCH",
          "AWAITING_GROUPED_BRIEF",
          "GROUP_BY_ROOT_CAUSE",
          false,
        ),
        reasons: [
          `Group ${key} signalCount must match incident signals (expected ${expectedCount ?? 0}, got ${g.signalCount}) (T-US-050)`,
        ],
      };
    }
  }

  if (input.omitActionOnGroup || actionableGroupCount !== groupCount) {
    return {
      allowed: false,
      code: "NON_ACTIONABLE_GROUP_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "GROUP_MISSING_ACTIONABLE_NEXT_STEP",
        "AWAITING_ACTIONABLE_GROUPS",
        "ATTACH_ACTIONABLE_NEXT_STEP",
        false,
      ),
      reasons: [
        "Every root-cause group in the owner brief must include an actionable next step (T-US-050)",
      ],
    };
  }

  return {
    allowed: true,
    code: "OWNER_BRIEF_ROOT_CAUSE_GROUPED_ACTIONABLE",
    ...base,
    evidence: {
      briefId: input.briefId.trim(),
      rawSignalCount,
      groupCount,
      actionableGroupCount,
      maxSignalsInGroup,
      groupingReducedNoise: groupingReducedNoise || !hasDuplicateRootCause,
      ungroupedFlood: false,
      briefVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "OWNER_BRIEF_GROUPED",
      currentState: "BRIEF_GROUPED_ACTIONABLE",
      recoveryPath: "KEEP_ROOT_CAUSE_GROUPS_WITH_ACTIONS",
      preservedInputCount: preserved,
    },
    reasons: [
      "Owner brief grouped incident signals by root cause with actionable next steps (T-US-050); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
