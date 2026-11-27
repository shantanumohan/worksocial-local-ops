/**
 * Mission workflow store — enqueue-before-ack, leases, retry categories, review wait.
 * Temporal cluster is NOT_WIRED until bound; LOCAL_DURABLE uses Postgres;
 * TEMPORAL means a live local Temporal frontend is connected.
 */

import type { PgQueryable } from "./pg/client.js";

export type MissionPhase =
  | "enqueued"
  | "leased"
  | "effect_pending"
  | "review_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

export type MissionRetryCategory =
  | "transient"
  | "policy"
  | "unknown_remote"
  | "fatal"
  | "none";

export type MissionTemporalWiring =
  | "NOT_WIRED"
  | "LOCAL_DURABLE"
  | "FIXTURE"
  | "TEMPORAL";

export type MissionWorkflowRecord = {
  workflowId: string;
  jobId: string;
  operationId: string | null;
  phase: MissionPhase;
  retryCategory: MissionRetryCategory | null;
  attemptCount: number;
  leaseHolder: string | null;
  leaseExpiresAtIso: string | null;
  reviewRequired: boolean;
  reviewToken: string | null;
  lastError: string | null;
  temporalWiring: MissionTemporalWiring;
  temporalRunId: string | null;
  envelopeJson: Record<string, unknown>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type MissionWorkflowInsert = {
  workflowId: string;
  jobId: string;
  reviewRequired?: boolean;
  temporalWiring?: MissionTemporalWiring;
  envelopeJson?: Record<string, unknown>;
  /** Logical clock for deadline arithmetic (defaults to wall clock). */
  nowIso?: string;
};

export type MissionWorkflowStore = {
  /** Idempotent by workflowId — returns existing compatible row on retry. */
  enqueue(input: MissionWorkflowInsert): Promise<MissionWorkflowRecord>;
  get(workflowId: string): Promise<MissionWorkflowRecord | undefined>;
  claimLease(input: {
    workflowId: string;
    holder: string;
    leaseExpiresAtIso: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord | null>;
  /**
   * Persist intended operation_id (+ effect keys) while still leased,
   * before provider apply — enables restart recovery without a second apply.
   */
  bindOperationWhileLeased(input: {
    workflowId: string;
    operationId: string;
    holder: string;
    nowIso: string;
    payloadDigest: string;
    businessIdempotencyKey: string;
  }): Promise<MissionWorkflowRecord>;
  /** Fenced transition leased → effect_pending (requires active holder lease). */
  markEffectPending(input: {
    workflowId: string;
    operationId: string;
    holder: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  /** Recovery helper: leased/effect_pending → effect_pending without lease fence. */
  recoverEffectPending(input: {
    workflowId: string;
    operationId: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  enterReviewWait(input: {
    workflowId: string;
    reviewToken: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  completeReview(input: {
    workflowId: string;
    reviewToken: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  succeed(workflowId: string, nowIso: string): Promise<MissionWorkflowRecord>;
  fail(input: {
    workflowId: string;
    retryCategory: MissionRetryCategory;
    lastError: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  listByPhase(phase: MissionPhase): Promise<MissionWorkflowRecord[]>;
};

function rowToMission(row: Record<string, unknown>): MissionWorkflowRecord {
  return {
    workflowId: String(row.workflow_id),
    jobId: String(row.job_id),
    operationId: row.operation_id == null ? null : String(row.operation_id),
    phase: row.phase as MissionPhase,
    retryCategory:
      row.retry_category == null
        ? null
        : (row.retry_category as MissionRetryCategory),
    attemptCount: Number(row.attempt_count),
    leaseHolder: row.lease_holder == null ? null : String(row.lease_holder),
    leaseExpiresAtIso:
      row.lease_expires_at == null
        ? null
        : new Date(String(row.lease_expires_at)).toISOString(),
    reviewRequired: Boolean(row.review_required),
    reviewToken: row.review_token == null ? null : String(row.review_token),
    lastError: row.last_error == null ? null : String(row.last_error),
    temporalWiring: row.temporal_wiring as MissionTemporalWiring,
    temporalRunId:
      row.temporal_run_id == null ? null : String(row.temporal_run_id),
    envelopeJson:
      typeof row.envelope_json === "object" && row.envelope_json !== null
        ? (row.envelope_json as Record<string, unknown>)
        : {},
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    updatedAtIso: new Date(String(row.updated_at)).toISOString(),
  };
}

/** T-X024 related case — fixture ACCEPTED only; never invent past T-X073. */
export const OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS = [
  "T-X024",
] as const;

/**
 * Fixture honesty for T-X024 old-fence proofs (edge deepen O4).
 * ACCEPTED ≠ VERIFIED; Temporal NOT_WIRED; Ads soft-skip; externalEffects NONE.
 */
export const OLD_FENCE_HONESTY = {
  liveTemporalWiring: "NOT_WIRED",
  chatgptAdsAccess: "ACCESS_BLOCKED",
  softSkipAdsCases: ["T-F07", "T-US-013", "T-US-014"],
  liveProviderSuccessClaimed: false,
  externalEffects: "NONE",
  acceptedNotVerified: true,
} as const;

/**
 * Why a holder may or may not commit under the mission lease fence.
 * Distinct causes keep expired ≠ wrong_holder (hillclimb O2).
 * wrong_holder is checked before expiry so mismatched holders never
 * report as expired (edge honesty O4).
 */
export type MissionLeaseFenceCause =
  | "active"
  | "expired"
  | "wrong_holder"
  | "no_holder";

/**
 * Classify lease fence state for `holder` at `nowIso`.
 * Exact expiry (`nowIso === leaseExpiresAtIso`) → `expired`.
 * Null `leaseExpiresAtIso` stays `active` for the matching holder.
 */
export function classifyMissionLeaseFence(
  record: MissionWorkflowRecord,
  holder: string,
  nowIso: string,
): MissionLeaseFenceCause {
  if (record.leaseHolder == null) return "no_holder";
  if (record.leaseHolder !== holder) return "wrong_holder";
  if (
    record.leaseExpiresAtIso &&
    Date.parse(record.leaseExpiresAtIso) <= Date.parse(nowIso)
  ) {
    return "expired";
  }
  return "active";
}

/**
 * True when `holder` still owns an unexpired lease on `record`.
 * Exact expiry (`nowIso === leaseExpiresAtIso`) is inactive — enables
 * T-X024 reassignment at the boundary without a live Temporal clock.
 */
export function isMissionLeaseActive(
  record: MissionWorkflowRecord,
  holder: string,
  nowIso: string,
): boolean {
  return classifyMissionLeaseFence(record, holder, nowIso) === "active";
}

/**
 * Lease-fence deny message with classified cause (T-X024 O3).
 * Keeps expired ≠ wrong_holder visible on the throw path.
 */
export function missionLeaseFenceFailedMessage(
  workflowId: string,
  cause: MissionLeaseFenceCause,
): string {
  return `Lease fence failed for ${workflowId} (fenceCause=${cause})`;
}

const FENCE_CAUSE_VALUES: readonly MissionLeaseFenceCause[] = [
  "active",
  "expired",
  "wrong_holder",
  "no_holder",
] as const;

/**
 * Parse `fenceCause=` from a lease-fence deny message (T-X024 O6).
 * Round-trips with `missionLeaseFenceFailedMessage`; null when absent/unknown.
 */
export function parseMissionLeaseFenceCause(
  message: string,
): MissionLeaseFenceCause | null {
  const match = /fenceCause=([a-z_]+)/.exec(message);
  if (!match) return null;
  const cause = match[1] as MissionLeaseFenceCause;
  return (FENCE_CAUSE_VALUES as readonly string[]).includes(cause)
    ? cause
    : null;
}

/**
 * Fixture soak may only claim FIXTURE temporal wiring (T-X024 O5).
 * TEMPORAL / LOCAL_DURABLE / bare NOT_WIRED-as-store-row → LIVE_TEMPORAL_CLAIM_REFUSED.
 */
export type FixtureTemporalWiringDecision = {
  allowed: boolean;
  code: "FIXTURE_OK" | "LIVE_TEMPORAL_CLAIM_REFUSED";
  temporalWiring: MissionTemporalWiring;
  liveTemporalWiring: typeof OLD_FENCE_HONESTY.liveTemporalWiring;
  externalEffects: typeof OLD_FENCE_HONESTY.externalEffects;
  acceptedNotVerified: typeof OLD_FENCE_HONESTY.acceptedNotVerified;
  chatgptAdsAccess: typeof OLD_FENCE_HONESTY.chatgptAdsAccess;
};

export function evaluateFixtureTemporalWiring(
  wiring: MissionTemporalWiring,
): FixtureTemporalWiringDecision {
  const honesty = {
    liveTemporalWiring: OLD_FENCE_HONESTY.liveTemporalWiring,
    externalEffects: OLD_FENCE_HONESTY.externalEffects,
    acceptedNotVerified: OLD_FENCE_HONESTY.acceptedNotVerified,
    chatgptAdsAccess: OLD_FENCE_HONESTY.chatgptAdsAccess,
  } as const;
  if (wiring === "FIXTURE") {
    return {
      allowed: true,
      code: "FIXTURE_OK",
      temporalWiring: wiring,
      ...honesty,
    };
  }
  return {
    allowed: false,
    code: "LIVE_TEMPORAL_CLAIM_REFUSED",
    temporalWiring: wiring,
    ...honesty,
  };
}

/**
 * Fixture acceptance label gate (T-X024 O6).
 * ACCEPTED is the only allowed fixture label — VERIFIED (and any other
 * upgrade) → VERIFIED_CLAIM_REFUSED. ACCEPTED ≠ VERIFIED.
 */
export type OldFenceAcceptanceLabelDecision = {
  allowed: boolean;
  code: "ACCEPTED_OK" | "VERIFIED_CLAIM_REFUSED";
  label: string;
  acceptedNotVerified: typeof OLD_FENCE_HONESTY.acceptedNotVerified;
  externalEffects: typeof OLD_FENCE_HONESTY.externalEffects;
  liveTemporalWiring: typeof OLD_FENCE_HONESTY.liveTemporalWiring;
};

export function evaluateOldFenceAcceptanceLabel(
  label: string,
): OldFenceAcceptanceLabelDecision {
  const honesty = {
    acceptedNotVerified: OLD_FENCE_HONESTY.acceptedNotVerified,
    externalEffects: OLD_FENCE_HONESTY.externalEffects,
    liveTemporalWiring: OLD_FENCE_HONESTY.liveTemporalWiring,
  } as const;
  if (label === "ACCEPTED") {
    return { allowed: true, code: "ACCEPTED_OK", label, ...honesty };
  }
  return {
    allowed: false,
    code: "VERIFIED_CLAIM_REFUSED",
    label,
    ...honesty,
  };
}

/**
 * Fixture external-effects gate (T-X024 O7).
 * Only `NONE` is allowed — any other claim → EXTERNAL_EFFECTS_CLAIM_REFUSED.
 */
export type OldFenceExternalEffectsDecision = {
  allowed: boolean;
  code: "EXTERNAL_EFFECTS_NONE_OK" | "EXTERNAL_EFFECTS_CLAIM_REFUSED";
  claim: string;
  externalEffects: typeof OLD_FENCE_HONESTY.externalEffects;
  acceptedNotVerified: typeof OLD_FENCE_HONESTY.acceptedNotVerified;
};

export function evaluateOldFenceExternalEffects(
  claim: string,
): OldFenceExternalEffectsDecision {
  const honesty = {
    externalEffects: OLD_FENCE_HONESTY.externalEffects,
    acceptedNotVerified: OLD_FENCE_HONESTY.acceptedNotVerified,
  } as const;
  if (claim === "NONE") {
    return {
      allowed: true,
      code: "EXTERNAL_EFFECTS_NONE_OK",
      claim,
      ...honesty,
    };
  }
  return {
    allowed: false,
    code: "EXTERNAL_EFFECTS_CLAIM_REFUSED",
    claim,
    ...honesty,
  };
}

/**
 * Fixture live-provider-success gate (T-X024 O7).
 * `true` → LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED (fixture never claims live apply).
 */
export type OldFenceLiveProviderSuccessDecision = {
  allowed: boolean;
  code: "LIVE_PROVIDER_SUCCESS_NONE_OK" | "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED";
  claimed: boolean;
  liveProviderSuccessClaimed: typeof OLD_FENCE_HONESTY.liveProviderSuccessClaimed;
  externalEffects: typeof OLD_FENCE_HONESTY.externalEffects;
};

export function evaluateOldFenceLiveProviderSuccess(
  claimed: boolean,
): OldFenceLiveProviderSuccessDecision {
  const honesty = {
    liveProviderSuccessClaimed: OLD_FENCE_HONESTY.liveProviderSuccessClaimed,
    externalEffects: OLD_FENCE_HONESTY.externalEffects,
  } as const;
  if (claimed === false) {
    return {
      allowed: true,
      code: "LIVE_PROVIDER_SUCCESS_NONE_OK",
      claimed,
      ...honesty,
    };
  }
  return {
    allowed: false,
    code: "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED",
    claimed,
    ...honesty,
  };
}

/**
 * Fixture ChatGPT Ads access gate (T-X024 O8).
 * Only `ACCESS_BLOCKED` is allowed — any open/live claim → CHATGPT_ADS_ACCESS_CLAIM_REFUSED.
 */
export type OldFenceChatgptAdsAccessDecision = {
  allowed: boolean;
  code:
    | "CHATGPT_ADS_ACCESS_BLOCKED_OK"
    | "CHATGPT_ADS_ACCESS_CLAIM_REFUSED";
  access: string;
  chatgptAdsAccess: typeof OLD_FENCE_HONESTY.chatgptAdsAccess;
  softSkipAdsCases: typeof OLD_FENCE_HONESTY.softSkipAdsCases;
};

export function evaluateOldFenceChatgptAdsAccess(
  access: string,
): OldFenceChatgptAdsAccessDecision {
  const honesty = {
    chatgptAdsAccess: OLD_FENCE_HONESTY.chatgptAdsAccess,
    softSkipAdsCases: OLD_FENCE_HONESTY.softSkipAdsCases,
  } as const;
  if (access === "ACCESS_BLOCKED") {
    return {
      allowed: true,
      code: "CHATGPT_ADS_ACCESS_BLOCKED_OK",
      access,
      ...honesty,
    };
  }
  return {
    allowed: false,
    code: "CHATGPT_ADS_ACCESS_CLAIM_REFUSED",
    access,
    ...honesty,
  };
}

/**
 * Soft-skip Ads case gate (T-X024 O8).
 * T-F07 / T-US-013 / T-US-014 → SOFT_SKIP_ADS_OK (do not build).
 * Any other caseId → NOT_SOFT_SKIP_ADS_CASE.
 */
export type OldFenceSoftSkipAdsCaseDecision = {
  softSkip: boolean;
  code: "SOFT_SKIP_ADS_OK" | "NOT_SOFT_SKIP_ADS_CASE";
  caseId: string;
  softSkipAdsCases: typeof OLD_FENCE_HONESTY.softSkipAdsCases;
};

export function evaluateOldFenceSoftSkipAdsCase(
  caseId: string,
): OldFenceSoftSkipAdsCaseDecision {
  const softSkip = (
    OLD_FENCE_HONESTY.softSkipAdsCases as readonly string[]
  ).includes(caseId);
  return {
    softSkip,
    code: softSkip ? "SOFT_SKIP_ADS_OK" : "NOT_SOFT_SKIP_ADS_CASE",
    caseId,
    softSkipAdsCases: OLD_FENCE_HONESTY.softSkipAdsCases,
  };
}

/** Catalog ceiling for T-X* invent guard (never invent past T-X073). */
export const OLD_FENCE_CATALOG_CEILING = 73 as const;

/**
 * Related-case gate (T-X024 O9).
 * Exactly `["T-X024"]` → RELATED_CASES_OK; any other set → RELATED_CASES_CLAIM_REFUSED.
 */
export type OldFenceRelatedCaseIdsDecision = {
  allowed: boolean;
  code: "RELATED_CASES_OK" | "RELATED_CASES_CLAIM_REFUSED";
  relatedCaseIds: readonly string[];
};

export function evaluateOldFenceRelatedCaseIds(
  relatedCaseIds: readonly string[],
): OldFenceRelatedCaseIdsDecision {
  const expected = [...OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS];
  const ok =
    relatedCaseIds.length === expected.length &&
    relatedCaseIds.every((id, i) => id === expected[i]);
  return {
    allowed: ok,
    code: ok ? "RELATED_CASES_OK" : "RELATED_CASES_CLAIM_REFUSED",
    relatedCaseIds,
  };
}

/**
 * Catalog case-id gate (T-X024 O9).
 * T-X024 → CATALOG_CASE_OK; invent past T-X073 → CATALOG_CEILING_REFUSED;
 * other IDs → CATALOG_CASE_REFUSED.
 */
export type OldFenceCatalogCaseDecision = {
  allowed: boolean;
  code: "CATALOG_CASE_OK" | "CATALOG_CEILING_REFUSED" | "CATALOG_CASE_REFUSED";
  caseId: string;
  catalogCeiling: typeof OLD_FENCE_CATALOG_CEILING;
};

export function evaluateOldFenceCatalogCaseId(
  caseId: string,
): OldFenceCatalogCaseDecision {
  const ceiling = OLD_FENCE_CATALOG_CEILING;
  const match = /^T-X(\d+)$/.exec(caseId);
  if (match) {
    const n = Number(match[1]);
    if (n > ceiling) {
      return {
        allowed: false,
        code: "CATALOG_CEILING_REFUSED",
        caseId,
        catalogCeiling: ceiling,
      };
    }
  }
  if (caseId === "T-X024") {
    return {
      allowed: true,
      code: "CATALOG_CASE_OK",
      caseId,
      catalogCeiling: ceiling,
    };
  }
  return {
    allowed: false,
    code: "CATALOG_CASE_REFUSED",
    caseId,
    catalogCeiling: ceiling,
  };
}

/**
 * acceptedNotVerified boolean gate (T-X024 O10).
 * Only `true` is allowed — `false` collapses ACCEPTED into VERIFIED → refused.
 */
export type OldFenceAcceptedNotVerifiedDecision = {
  allowed: boolean;
  code: "ACCEPTED_NOT_VERIFIED_OK" | "ACCEPTED_EQUALS_VERIFIED_CLAIM_REFUSED";
  flag: boolean;
  acceptedNotVerified: typeof OLD_FENCE_HONESTY.acceptedNotVerified;
  liveTemporalWiring: typeof OLD_FENCE_HONESTY.liveTemporalWiring;
};

export function evaluateOldFenceAcceptedNotVerified(
  flag: boolean,
): OldFenceAcceptedNotVerifiedDecision {
  const honesty = {
    acceptedNotVerified: OLD_FENCE_HONESTY.acceptedNotVerified,
    liveTemporalWiring: OLD_FENCE_HONESTY.liveTemporalWiring,
  } as const;
  if (flag === true) {
    return {
      allowed: true,
      code: "ACCEPTED_NOT_VERIFIED_OK",
      flag,
      ...honesty,
    };
  }
  return {
    allowed: false,
    code: "ACCEPTED_EQUALS_VERIFIED_CLAIM_REFUSED",
    flag,
    ...honesty,
  };
}

/**
 * Live Temporal wiring honesty gate (T-X024 O10).
 * Only `"NOT_WIRED"` is allowed on the live claim — distinct from store-row
 * `evaluateFixtureTemporalWiring` (`FIXTURE_OK` vs `LIVE_TEMPORAL_CLAIM_REFUSED`).
 */
export type OldFenceLiveTemporalNotWiredDecision = {
  allowed: boolean;
  code: "LIVE_TEMPORAL_NOT_WIRED_OK" | "LIVE_TEMPORAL_WIRED_CLAIM_REFUSED";
  claim: string;
  liveTemporalWiring: typeof OLD_FENCE_HONESTY.liveTemporalWiring;
  acceptedNotVerified: typeof OLD_FENCE_HONESTY.acceptedNotVerified;
};

export function evaluateOldFenceLiveTemporalNotWired(
  claim: string,
): OldFenceLiveTemporalNotWiredDecision {
  const honesty = {
    liveTemporalWiring: OLD_FENCE_HONESTY.liveTemporalWiring,
    acceptedNotVerified: OLD_FENCE_HONESTY.acceptedNotVerified,
  } as const;
  if (claim === "NOT_WIRED") {
    return {
      allowed: true,
      code: "LIVE_TEMPORAL_NOT_WIRED_OK",
      claim,
      ...honesty,
    };
  }
  return {
    allowed: false,
    code: "LIVE_TEMPORAL_WIRED_CLAIM_REFUSED",
    claim,
    ...honesty,
  };
}

/**
 * Assigned case-id gate (T-X024 O11).
 * Only `T-X024` is allowed for slot-O hillclimb — other IDs (even ≤T-X073)
 * → `ASSIGNED_CASE_REFUSED` (distinct from catalog ceiling).
 */
export type OldFenceAssignedCaseDecision = {
  allowed: boolean;
  code: "ASSIGNED_CASE_OK" | "ASSIGNED_CASE_REFUSED";
  caseId: string;
  assignedCaseId: "T-X024";
};

export function evaluateOldFenceAssignedCaseId(
  caseId: string,
): OldFenceAssignedCaseDecision {
  const assignedCaseId = "T-X024" as const;
  const ok = caseId === assignedCaseId;
  return {
    allowed: ok,
    code: ok ? "ASSIGNED_CASE_OK" : "ASSIGNED_CASE_REFUSED",
    caseId,
    assignedCaseId,
  };
}

/** AA-209 Cohort-2 slot O: squash-merge only when sequencer names this PR. */
export type OldFenceCohort2MergeHoldDecision = {
  allowed: boolean;
  code: "COHORT2_MERGE_HOLD_OK" | "COHORT2_MERGE_AUTHORIZED_REFUSED";
  mergeAuthorized: boolean;
  assignedCaseId: "T-X024";
  cohort: "2";
};

export function evaluateOldFenceCohort2MergeHold(
  mergeAuthorized: boolean,
): OldFenceCohort2MergeHoldDecision {
  const meta = {
    assignedCaseId: "T-X024" as const,
    cohort: "2" as const,
  };
  if (mergeAuthorized === false) {
    return {
      allowed: true,
      code: "COHORT2_MERGE_HOLD_OK",
      mergeAuthorized,
      ...meta,
    };
  }
  return {
    allowed: false,
    code: "COHORT2_MERGE_AUTHORIZED_REFUSED",
    mergeAuthorized,
    ...meta,
  };
}

/** Stable honesty detail line for soak evidence (O4–O11). */
export function formatOldFenceHonestyDetail(
  relatedCaseIds: readonly string[] = OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
): string {
  return `relatedCases=${relatedCaseIds.join(",")} liveTemporalWiring=${OLD_FENCE_HONESTY.liveTemporalWiring} chatgptAdsAccess=${OLD_FENCE_HONESTY.chatgptAdsAccess} softSkipAds=${OLD_FENCE_HONESTY.softSkipAdsCases.join(",")} liveProviderSuccessClaimed=${OLD_FENCE_HONESTY.liveProviderSuccessClaimed} externalEffects=${OLD_FENCE_HONESTY.externalEffects} acceptedNotVerified=${OLD_FENCE_HONESTY.acceptedNotVerified}`;
}

export function createMemoryMissionWorkflowStore(): MissionWorkflowStore {
  const byId = new Map<string, MissionWorkflowRecord>();

  return {
    async enqueue(input) {
      const existing = byId.get(input.workflowId);
      if (existing) {
        if (existing.jobId !== input.jobId) {
          throw new Error(
            `Workflow ${input.workflowId} already enqueued with a different job`,
          );
        }
        return existing;
      }
      const stamp = input.nowIso ?? new Date().toISOString();
      const record: MissionWorkflowRecord = {
        workflowId: input.workflowId,
        jobId: input.jobId,
        operationId: null,
        phase: "enqueued",
        retryCategory: null,
        attemptCount: 0,
        leaseHolder: null,
        leaseExpiresAtIso: null,
        reviewRequired: input.reviewRequired ?? false,
        reviewToken: null,
        lastError: null,
        temporalWiring: input.temporalWiring ?? "LOCAL_DURABLE",
        temporalRunId: null,
        envelopeJson: input.envelopeJson ?? {},
        createdAtIso: stamp,
        updatedAtIso: stamp,
      };
      byId.set(record.workflowId, record);
      return record;
    },

    async get(workflowId) {
      return byId.get(workflowId);
    },

    async claimLease(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) return null;
      if (existing.phase !== "enqueued" && existing.phase !== "leased") {
        return null;
      }
      if (
        existing.phase === "leased" &&
        existing.leaseExpiresAtIso &&
        Date.parse(existing.leaseExpiresAtIso) > Date.parse(input.nowIso) &&
        existing.leaseHolder !== input.holder
      ) {
        return null;
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "leased",
        leaseHolder: input.holder,
        leaseExpiresAtIso: input.leaseExpiresAtIso,
        attemptCount: existing.attemptCount + 1,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async bindOperationWhileLeased(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "leased") {
        throw new Error(
          `Workflow ${input.workflowId} must be leased to bind operation`,
        );
      }
      if (!isMissionLeaseActive(existing, input.holder, input.nowIso)) {
        const cause = classifyMissionLeaseFence(
          existing,
          input.holder,
          input.nowIso,
        );
        throw new Error(
          missionLeaseFenceFailedMessage(input.workflowId, cause),
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        operationId: input.operationId,
        envelopeJson: {
          ...existing.envelopeJson,
          boundPayloadDigest: input.payloadDigest,
          boundBusinessIdempotencyKey: input.businessIdempotencyKey,
        },
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async markEffectPending(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "leased") {
        throw new Error(
          `Workflow ${input.workflowId} must be leased to mark effect_pending`,
        );
      }
      if (!isMissionLeaseActive(existing, input.holder, input.nowIso)) {
        const cause = classifyMissionLeaseFence(
          existing,
          input.holder,
          input.nowIso,
        );
        throw new Error(
          missionLeaseFenceFailedMessage(input.workflowId, cause),
        );
      }
      if (
        existing.operationId &&
        existing.operationId !== input.operationId
      ) {
        throw new Error(
          `Operation mismatch for ${input.workflowId}: bound=${existing.operationId}`,
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "effect_pending",
        operationId: input.operationId,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async recoverEffectPending(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "leased" && existing.phase !== "effect_pending") {
        throw new Error(
          `Cannot recover effect_pending from phase ${existing.phase}`,
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "effect_pending",
        operationId: input.operationId,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async enterReviewWait(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "effect_pending" || !existing.reviewRequired) {
        throw new Error(
          `Workflow ${input.workflowId} cannot enter review_wait from ${existing.phase}`,
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "review_wait",
        reviewToken: input.reviewToken,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async completeReview(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "review_wait") {
        throw new Error(`Workflow ${input.workflowId} is not in review_wait`);
      }
      if (existing.reviewToken !== input.reviewToken) {
        throw new Error(`Invalid review token for ${input.workflowId}`);
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "effect_pending",
        reviewToken: null,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async succeed(workflowId, nowIso) {
      const existing = byId.get(workflowId);
      if (!existing) throw new Error(`Unknown workflow ${workflowId}`);
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "succeeded",
        retryCategory: "none",
        leaseHolder: null,
        leaseExpiresAtIso: null,
        updatedAtIso: nowIso,
      };
      byId.set(workflowId, updated);
      return updated;
    },

    async fail(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "failed",
        retryCategory: input.retryCategory,
        lastError: input.lastError,
        leaseHolder: null,
        leaseExpiresAtIso: null,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async listByPhase(phase) {
      return [...byId.values()].filter((m) => m.phase === phase);
    },
  };
}

export function createPgMissionWorkflowStore(
  db: PgQueryable,
): MissionWorkflowStore {
  return {
    async enqueue(input) {
      const stamp = input.nowIso ?? new Date().toISOString();
      const result = await db.query(
        `INSERT INTO core.mission_workflows (
           workflow_id, job_id, phase, review_required, temporal_wiring, envelope_json,
           created_at, updated_at
         ) VALUES ($1,$2,'enqueued',$3,$4,$5::jsonb,$6::timestamptz,$6::timestamptz)
         ON CONFLICT (workflow_id) DO NOTHING
         RETURNING *`,
        [
          input.workflowId,
          input.jobId,
          input.reviewRequired ?? false,
          input.temporalWiring ?? "LOCAL_DURABLE",
          JSON.stringify(input.envelopeJson ?? {}),
          stamp,
        ],
      );
      if (result.rows[0]) {
        return rowToMission(result.rows[0] as Record<string, unknown>);
      }
      const existing = await db.query(
        `SELECT * FROM core.mission_workflows WHERE workflow_id = $1`,
        [input.workflowId],
      );
      if (!existing.rows[0]) {
        throw new Error(`Workflow enqueue failed for ${input.workflowId}`);
      }
      const mission = rowToMission(existing.rows[0] as Record<string, unknown>);
      if (mission.jobId !== input.jobId) {
        throw new Error(
          `Workflow ${input.workflowId} already enqueued with a different job`,
        );
      }
      return mission;
    },

    async get(workflowId) {
      const result = await db.query(
        `SELECT * FROM core.mission_workflows WHERE workflow_id = $1`,
        [workflowId],
      );
      return result.rows[0]
        ? rowToMission(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async claimLease(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'leased',
             lease_holder = $2,
             lease_expires_at = $3::timestamptz,
             attempt_count = attempt_count + 1,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
           AND (
             phase = 'enqueued'
             OR (
               phase = 'leased'
               AND (
                 lease_expires_at IS NULL
                 OR lease_expires_at <= $4::timestamptz
                 OR lease_holder = $2
               )
             )
           )
         RETURNING *`,
        [
          input.workflowId,
          input.holder,
          input.leaseExpiresAtIso,
          input.nowIso,
        ],
      );
      return result.rows[0]
        ? rowToMission(result.rows[0] as Record<string, unknown>)
        : null;
    },

    async bindOperationWhileLeased(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET operation_id = $2,
             envelope_json = envelope_json || $5::jsonb,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
           AND phase = 'leased'
           AND lease_holder = $3
           AND (lease_expires_at IS NULL OR lease_expires_at > $4::timestamptz)
         RETURNING *`,
        [
          input.workflowId,
          input.operationId,
          input.holder,
          input.nowIso,
          JSON.stringify({
            boundPayloadDigest: input.payloadDigest,
            boundBusinessIdempotencyKey: input.businessIdempotencyKey,
          }),
        ],
      );
      if (!result.rows[0]) {
        throw new Error(
          `bindOperationWhileLeased failed for ${input.workflowId} (lease/phase fence)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async markEffectPending(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'effect_pending',
             operation_id = $2,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
           AND phase = 'leased'
           AND lease_holder = $3
           AND (lease_expires_at IS NULL OR lease_expires_at > $4::timestamptz)
           AND (operation_id IS NULL OR operation_id = $2)
         RETURNING *`,
        [input.workflowId, input.operationId, input.holder, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `markEffectPending failed for ${input.workflowId} (lease/phase fence)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async recoverEffectPending(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'effect_pending',
             operation_id = $2,
             updated_at = $3::timestamptz
         WHERE workflow_id = $1
           AND phase IN ('leased', 'effect_pending')
         RETURNING *`,
        [input.workflowId, input.operationId, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `recoverEffectPending failed for ${input.workflowId}`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async enterReviewWait(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'review_wait',
             review_token = $2,
             updated_at = $3::timestamptz
         WHERE workflow_id = $1
           AND phase = 'effect_pending'
           AND review_required = true
         RETURNING *`,
        [input.workflowId, input.reviewToken, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `enterReviewWait failed for ${input.workflowId} (phase/reviewRequired)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async completeReview(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'effect_pending',
             review_token = NULL,
             updated_at = $3::timestamptz
         WHERE workflow_id = $1
           AND phase = 'review_wait'
           AND review_token = $2
         RETURNING *`,
        [input.workflowId, input.reviewToken, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `Review complete failed for ${input.workflowId} (token/phase mismatch)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async succeed(workflowId, nowIso) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'succeeded',
             retry_category = 'none',
             lease_holder = NULL,
             lease_expires_at = NULL,
             updated_at = $2::timestamptz
         WHERE workflow_id = $1
         RETURNING *`,
        [workflowId, nowIso],
      );
      if (!result.rows[0]) throw new Error(`Unknown workflow ${workflowId}`);
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async fail(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'failed',
             retry_category = $2,
             last_error = $3,
             lease_holder = NULL,
             lease_expires_at = NULL,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
         RETURNING *`,
        [
          input.workflowId,
          input.retryCategory,
          input.lastError,
          input.nowIso,
        ],
      );
      if (!result.rows[0]) throw new Error(`Unknown workflow ${input.workflowId}`);
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async listByPhase(phase) {
      const result = await db.query(
        `SELECT * FROM core.mission_workflows WHERE phase = $1 ORDER BY created_at`,
        [phase],
      );
      return result.rows.map((row) =>
        rowToMission(row as Record<string, unknown>),
      );
    },
  };
}
