/**
 * External human edit during staging (T-X025).
 *
 * Agent stages a change against a pinned base revision. While the change is
 * STAGED_PENDING, an external human edit bumps the page revision/digest.
 * Conflict must be retained — blind overwrite of human fields is forbidden.
 * Independent verify stays MISMATCH / CONFLICT_RETAINED; never invents VERIFIED.
 *
 * Pure domain. External effects: NONE. No network / Temporal / credentials.
 */

import { digestFields, type StagingPageFields } from "./owner-staging.js";

export const EXTERNAL_HUMAN_EDIT_STAGING_RELATED_CASE_IDS = ["T-X025"] as const;

export const StagingConflictStatus = {
  NONE: "NONE",
  STAGED_PENDING: "STAGED_PENDING",
  CONFLICT_RETAINED: "CONFLICT_RETAINED",
} as const;

export type StagingConflictStatusValue =
  (typeof StagingConflictStatus)[keyof typeof StagingConflictStatus];

export const StagingVerifyOutcome = {
  MATCHED_PENDING_ONLY: "MATCHED_PENDING_ONLY",
  MISMATCH: "MISMATCH",
  CONFLICT_RETAINED: "CONFLICT_RETAINED",
} as const;

export type StagingVerifyOutcomeValue =
  (typeof StagingVerifyOutcome)[keyof typeof StagingVerifyOutcome];

export type StagingPageLedger = {
  pageId: string;
  fields: StagingPageFields;
  revision: string;
  contentDigest: string;
  updatedAtIso: string;
};

export type StagedAgentChange = {
  changeId: string;
  pageId: string;
  /** Base revision the agent intended to edit. */
  expectedBaseRevision: string;
  desiredFields: StagingPageFields;
  desiredDigest: string;
  status: StagingConflictStatusValue;
  /** Human page digest retained when conflict is detected. */
  humanObservedDigest: string | null;
  humanObservedRevision: string | null;
  recoveryNote: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ExternalEditStagingState = {
  page: StagingPageLedger;
  change: StagedAgentChange | null;
  agentOverwriteAttempts: number;
  /** Live Temporal/CMS transport stays NOT_WIRED for fixture evidence (T-X025). */
  liveTemporalWiring: "NOT_WIRED";
  /** Never invent live provider success from fixture ACCEPTED. */
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

/** Live Temporal/CMS staging transport stays NOT_WIRED (T-X025). */
export function externalHumanEditLiveWiringStatus(): "NOT_WIRED" {
  return "NOT_WIRED";
}

function nextRevision(prev: string): string {
  const n = Number.parseInt(prev.replace(/^rev-/, ""), 10);
  if (Number.isFinite(n)) {
    return `rev-${n + 1}`;
  }
  return `${prev}-next`;
}

export function createExternalEditStagingState(input: {
  pageId: string;
  fields: StagingPageFields;
  revision: string;
  nowIso: string;
}): ExternalEditStagingState {
  if (!input.pageId.trim()) {
    throw new Error("pageId is required");
  }
  if (!input.revision.trim()) {
    throw new Error("revision is required");
  }
  return {
    page: {
      pageId: input.pageId,
      fields: { ...input.fields },
      revision: input.revision,
      contentDigest: digestFields(input.fields),
      updatedAtIso: input.nowIso,
    },
    change: null,
    agentOverwriteAttempts: 0,
    liveTemporalWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

/**
 * Stage an agent change when the page still matches the expected base revision.
 * Applies desired fields to the page ledger and leaves status STAGED_PENDING
 * (acceptance ≠ verified).
 */
export function stageAgentChangeAgainstBase(
  state: ExternalEditStagingState,
  input: {
    changeId: string;
    expectedBaseRevision: string;
    desiredFields: StagingPageFields;
    nowIso: string;
  },
):
  | { ok: true; state: ExternalEditStagingState }
  | {
      ok: false;
      code: "BASE_REVISION_MISMATCH" | "CHANGE_ALREADY_OPEN";
      reason: string;
      state: ExternalEditStagingState;
    } {
  if (state.change !== null) {
    return {
      ok: false,
      code: "CHANGE_ALREADY_OPEN",
      reason: "A staged change is already open — resolve conflict before restaging",
      state,
    };
  }
  if (state.page.revision !== input.expectedBaseRevision) {
    return {
      ok: false,
      code: "BASE_REVISION_MISMATCH",
      reason: `Expected base ${input.expectedBaseRevision}; page is ${state.page.revision}`,
      state,
    };
  }
  const desiredDigest = digestFields(input.desiredFields);
  const revision = nextRevision(state.page.revision);
  const change: StagedAgentChange = {
    changeId: input.changeId,
    pageId: state.page.pageId,
    expectedBaseRevision: input.expectedBaseRevision,
    desiredFields: { ...input.desiredFields },
    desiredDigest,
    status: StagingConflictStatus.STAGED_PENDING,
    humanObservedDigest: null,
    humanObservedRevision: null,
    recoveryNote: null,
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
  return {
    ok: true,
    state: {
      ...state,
      page: {
        ...state.page,
        fields: { ...input.desiredFields },
        revision,
        contentDigest: desiredDigest,
        updatedAtIso: input.nowIso,
      },
      change,
      liveTemporalWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    },
  };
}

/**
 * External human edit while a staged change may be open.
 * Bumps page revision/digest. If a STAGED_PENDING change exists, status becomes
 * CONFLICT_RETAINED with human observations retained (never silently cleared).
 */
export function applyExternalHumanEdit(
  state: ExternalEditStagingState,
  input: {
    fields: StagingPageFields;
    nowIso: string;
  },
): ExternalEditStagingState {
  const humanDigest = digestFields(input.fields);
  const revision = nextRevision(state.page.revision);
  const page: StagingPageLedger = {
    ...state.page,
    fields: { ...input.fields },
    revision,
    contentDigest: humanDigest,
    updatedAtIso: input.nowIso,
  };

  if (
    state.change &&
    (state.change.status === StagingConflictStatus.STAGED_PENDING ||
      state.change.status === StagingConflictStatus.CONFLICT_RETAINED)
  ) {
    const change: StagedAgentChange = {
      ...state.change,
      status: StagingConflictStatus.CONFLICT_RETAINED,
      humanObservedDigest: humanDigest,
      humanObservedRevision: revision,
      recoveryNote:
        "External human edit during staging — conflict retained; do not overwrite",
      updatedAtIso: input.nowIso,
    };
    return {
      ...state,
      page,
      change,
      liveTemporalWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }

  return {
    ...state,
    page,
    liveTemporalWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

/**
 * Blind overwrite of human fields with the agent's desired payload is forbidden
 * once a conflict is retained (or base no longer matches).
 */
export function attemptBlindAgentOverwrite(
  state: ExternalEditStagingState,
  input: {
    nowIso: string;
    /** Request live Temporal apply — must stay NOT_WIRED offline. */
    requestLiveTemporalWiring?: boolean;
  },
):
  | { ok: true; state: ExternalEditStagingState }
  | {
      ok: false;
      code:
        | "OVERWRITE_FORBIDDEN"
        | "NO_OPEN_CHANGE"
        | "LIVE_TEMPORAL_WIRING_NOT_WIRED";
      reason: string;
      state: ExternalEditStagingState;
      liveTemporalWiring: "NOT_WIRED";
      liveProviderSuccessClaimed: false;
      externalEffects: "NONE";
    } {
  const attempts = state.agentOverwriteAttempts + 1;
  const nextState: ExternalEditStagingState = {
    ...state,
    agentOverwriteAttempts: attempts,
    liveTemporalWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
  const honesty = {
    liveTemporalWiring: "NOT_WIRED" as const,
    liveProviderSuccessClaimed: false as const,
    externalEffects: "NONE" as const,
  };

  if (input.requestLiveTemporalWiring) {
    return {
      ok: false,
      code: "LIVE_TEMPORAL_WIRING_NOT_WIRED",
      reason:
        "Live Temporal/CMS staging remains NOT_WIRED — refuse live overwrite (T-X025)",
      state: nextState,
      ...honesty,
    };
  }

  if (!state.change) {
    return {
      ok: false,
      code: "NO_OPEN_CHANGE",
      reason: "No open staged change to overwrite",
      state: nextState,
      ...honesty,
    };
  }

  const pageDiffersFromDesired =
    state.page.contentDigest !== state.change.desiredDigest;
  const conflictAlready =
    state.change.status === StagingConflictStatus.CONFLICT_RETAINED;

  if (conflictAlready || pageDiffersFromDesired) {
    // Retain conflict — page stays on human (or drifted) fields.
    const retained: StagedAgentChange = {
      ...state.change,
      status: StagingConflictStatus.CONFLICT_RETAINED,
      humanObservedDigest:
        state.change.humanObservedDigest ?? state.page.contentDigest,
      humanObservedRevision:
        state.change.humanObservedRevision ?? state.page.revision,
      recoveryNote:
        state.change.recoveryNote ??
        "External human edit during staging — conflict retained; do not overwrite",
      updatedAtIso: input.nowIso,
    };
    return {
      ok: false,
      code: "OVERWRITE_FORBIDDEN",
      reason: conflictAlready
        ? "Blind overwrite forbidden while CONFLICT_RETAINED — human edit must be preserved"
        : "Blind overwrite forbidden — page digest drifted from staged desired",
      state: {
        ...nextState,
        change: retained,
        // Page must still reflect human/drifted fields (not agent desired).
        page: state.page,
      },
      ...honesty,
    };
  }

  // STAGED_PENDING and page still matches desired — refuse "blind" force path;
  // callers must use independent verify (ACCEPTED ≠ VERIFIED).
  return {
    ok: false,
    code: "OVERWRITE_FORBIDDEN",
    reason:
      "Blind overwrite path forbidden — use independent verify, not force-apply",
    state: nextState,
    ...honesty,
  };
}

/**
 * Refuse elevating MATCHED_PENDING_ONLY / CONFLICT_RETAINED to live VERIFIED.
 * Fixture ACCEPTED never invents VERIFIED (T-X025).
 */
export function refuseClaimedVerifiedStaging(
  state: ExternalEditStagingState,
  input: { claimedVerified: boolean; nowIso: string },
): {
  ok: false;
  code: "CLAIMED_VERIFIED_REFUSED";
  reason: string;
  verifiedClaimed: false;
  liveTemporalWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
  state: ExternalEditStagingState;
} {
  const reason = input.claimedVerified
    ? state.change?.status === StagingConflictStatus.CONFLICT_RETAINED
      ? "CLAIMED_VERIFIED_REFUSED — CONFLICT_RETAINED cannot elevate to VERIFIED (ACCEPTED≠VERIFIED)"
      : "CLAIMED_VERIFIED_REFUSED — STAGED_PENDING / MATCHED_PENDING_ONLY is fixture ACCEPTED only, not VERIFIED"
    : "CLAIMED_VERIFIED_REFUSED — verifiedClaimed stays false; no live elevation path";
  return {
    ok: false,
    code: "CLAIMED_VERIFIED_REFUSED",
    reason,
    verifiedClaimed: false,
    liveTemporalWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
    state: {
      ...state,
      liveTemporalWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    },
  };
}

/**
 * Independent verify after staging / conflict.
 * Never invents VERIFIED when conflict is retained or digests diverge.
 */
export function independentVerifyStagingChange(
  state: ExternalEditStagingState,
  input: { nowIso: string },
): {
  outcome: StagingVerifyOutcomeValue;
  matched: boolean;
  verifiedClaimed: false;
  liveTemporalWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
  details: string[];
  state: ExternalEditStagingState;
} {
  const honesty = {
    verifiedClaimed: false as const,
    liveTemporalWiring: "NOT_WIRED" as const,
    liveProviderSuccessClaimed: false as const,
    externalEffects: "NONE" as const,
  };

  if (!state.change) {
    return {
      outcome: StagingVerifyOutcome.MISMATCH,
      matched: false,
      details: ["No staged change to verify"],
      state,
      ...honesty,
    };
  }

  if (state.change.status === StagingConflictStatus.CONFLICT_RETAINED) {
    const details = [
      "CONFLICT_RETAINED — external human edit during staging",
      `desiredDigest=${state.change.desiredDigest}`,
      `humanObservedDigest=${state.change.humanObservedDigest ?? state.page.contentDigest}`,
      `humanObservedRevision=${state.change.humanObservedRevision ?? state.page.revision}`,
      "verifiedClaimed=false",
      "liveTemporalWiring=NOT_WIRED",
    ];
    const change: StagedAgentChange = {
      ...state.change,
      status: StagingConflictStatus.CONFLICT_RETAINED,
      updatedAtIso: input.nowIso,
      recoveryNote:
        state.change.recoveryNote ??
        "Conflict retained after independent verify — not VERIFIED",
    };
    return {
      outcome: StagingVerifyOutcome.CONFLICT_RETAINED,
      matched: false,
      details,
      state: {
        ...state,
        change,
        liveTemporalWiring: "NOT_WIRED",
        liveProviderSuccessClaimed: false,
        externalEffects: "NONE",
      },
      ...honesty,
    };
  }

  const matched = state.page.contentDigest === state.change.desiredDigest;
  if (!matched) {
    const change: StagedAgentChange = {
      ...state.change,
      status: StagingConflictStatus.CONFLICT_RETAINED,
      humanObservedDigest: state.page.contentDigest,
      humanObservedRevision: state.page.revision,
      recoveryNote:
        "Independent verify mismatch — conflict retained; not VERIFIED",
      updatedAtIso: input.nowIso,
    };
    return {
      outcome: StagingVerifyOutcome.MISMATCH,
      matched: false,
      details: [
        "Independent verify mismatch",
        `desiredDigest=${state.change.desiredDigest}`,
        `observedDigest=${state.page.contentDigest}`,
      ],
      state: {
        ...state,
        change,
        liveTemporalWiring: "NOT_WIRED",
        liveProviderSuccessClaimed: false,
        externalEffects: "NONE",
      },
      ...honesty,
    };
  }

  // Digests match while still STAGED_PENDING — fixture acceptance of match only.
  // Never elevates to live VERIFIED.
  return {
    outcome: StagingVerifyOutcome.MATCHED_PENDING_ONLY,
    matched: true,
    details: [
      "Independent read matched desired fields while STAGED_PENDING",
      "verifiedClaimed=false (ACCEPTED ≠ VERIFIED)",
      "liveTemporalWiring=NOT_WIRED",
    ],
    state: {
      ...state,
      change: { ...state.change, updatedAtIso: input.nowIso },
      liveTemporalWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    },
    ...honesty,
  };
}
