/**
 * T-X023 — Eventual consistency false not-found: no unsafe retry.
 *
 * A temporary empty CRM read must not trigger a new lead create when a
 * local correlated write/receipt already exists. Bound the consistency
 * window, inspect correlated receipts, then reconcile once visible.
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE. Live Zoho stays NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * liveProviderSuccessClaimed is always false (ACCEPTED ≠ VERIFIED).
 */

import type { CanaryRemoteReceipt } from "./monitoring.js";
import {
  ProbeVerdict,
  ReconciliationStatus,
  reconcileCanaryIntent,
  type CanaryIntent,
  type ReconciliationResult,
} from "./monitoring.js";

/** Related acceptance case — single-case mapping (do not invent past T-X073). */
export const CRM_EVENTUAL_CONSISTENCY_RELATED_CASE_IDS = ["T-X023"] as const;

/** Live Zoho CRM wiring — always NOT_WIRED for fixture soak. */
export const CRM_LIVE_ZOHO_WIRING = "NOT_WIRED" as const;

/** Soft-skip ChatGPT Ads connect trio — never ACCESS_ALLOWED from this path. */
export const CRM_CHATGPT_ADS_ACCESS = "ACCESS_BLOCKED" as const;

/** Fixture path never claims live/sandbox external effects. */
export const CRM_EXTERNAL_EFFECTS = "NONE" as const;

/** Only receipt source label accepted for fixture visibility (trim-normalized match). */
export const CRM_FIXTURE_RECEIPT_SOURCE = "fixture_crm" as const;

/** Default eventual-consistency window for fixture CRM lead reads (30s). */
export const DEFAULT_CRM_CONSISTENCY_WINDOW_MS = 30_000;

/** Decision actions after an empty / lagging CRM read. */
export const CrmEmptyReadAction = {
  /** Local write exists; still inside window — wait, do not create. */
  BOUND_WAIT: "BOUND_WAIT",
  /** Local write exists; inspect receipts / outbox — create forbidden. */
  REFUSE_CREATE: "REFUSE_CREATE",
  /** Remote finally visible — reconcile matched; still no create. */
  RECONCILE: "RECONCILE",
  /** Window exceeded and still empty — escalate missing; never invent create. */
  ESCALATE_MISSING: "ESCALATE_MISSING",
  /** Live VERIFIED / live Zoho wire claims refused — fixture ACCEPTED only. */
  LIVE_CLAIM_REFUSED: "LIVE_CLAIM_REFUSED",
} as const;

export type CrmEmptyReadActionValue =
  (typeof CrmEmptyReadAction)[keyof typeof CrmEmptyReadAction];

export type CrmEmptyReadSituation =
  | "visible_receipt"
  | "local_empty_within_window"
  | "local_empty_after_window"
  | "local_nonempty_no_visible"
  | "no_local_empty_within_window"
  | "no_local_empty_after_window"
  | "no_local_nonempty";

export type DecideCrmLeadRetryAfterEmptyReadInput = {
  correlationId: string;
  /** Durable local write / outbox / provider ack for this correlation. */
  localWriteReceiptPresent: boolean;
  /** Remote CRM get-by-correlation returned empty / not-found. */
  remoteReadEmpty: boolean;
  /** Elapsed ms since local write (or first empty observation). */
  elapsedMs: number;
  /** Bound wait window before escalating missing. */
  consistencyWindowMs: number;
  /** Correlated remote receipts already observed (may be empty under lag). */
  correlatedReceipts: readonly CanaryRemoteReceipt[];
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — sandbox VERIFIED claims also refused (ACCEPTED ≠ VERIFIED). */
  claimSandboxVerified?: boolean;
  /** Forbidden — live Zoho provider stays NOT_WIRED. */
  requestLiveZohoWire?: boolean;
  /** Forbidden — soft-skip Ads; ACCESS_ALLOWED never granted from this path. */
  requestChatgptAdsAccess?: boolean | "ACCESS_ALLOWED" | "ACCESS_BLOCKED";
  /** Forbidden — fixture path always externalEffects NONE. */
  claimExternalEffects?: "NONE" | "LIVE" | string;
  /** Forbidden — liveProviderSuccessClaimed stays false on fixture path. */
  claimLiveProviderSuccess?: boolean;
  /** When set, only receipts with this moduleId count as visible. */
  expectedModuleId?: string;
};

const HONESTY = {
  liveZohoWiring: CRM_LIVE_ZOHO_WIRING,
  chatgptAdsAccess: CRM_CHATGPT_ADS_ACCESS,
  externalEffects: CRM_EXTERNAL_EFFECTS,
  liveProviderSuccessClaimed: false as const,
};

export type DecideCrmLeadRetryAfterEmptyReadResult = {
  action: CrmEmptyReadActionValue;
  /** Always false for T-X023 pass paths — false not-found ≠ create. */
  createLead: false;
  reason: string;
  withinConsistencyWindow: boolean;
  situation: CrmEmptyReadSituation;
  /** Live Zoho remains NOT_WIRED for fixture soak. */
  liveZohoWiring: typeof CRM_LIVE_ZOHO_WIRING;
  /** Soft-skip Ads — ACCESS_BLOCKED on every decision. */
  chatgptAdsAccess: typeof CRM_CHATGPT_ADS_ACCESS;
  externalEffects: typeof CRM_EXTERNAL_EFFECTS;
  /** Never claim live provider success from fixture path. */
  liveProviderSuccessClaimed: false;
};

/**
 * Clamp consistency timing to finite non-negative ms. NaN/Infinity → 0
 * so non-finite inputs cannot invent a silent within-window PASS.
 */
export function sanitizeCrmConsistencyTiming(input: {
  elapsedMs: number;
  consistencyWindowMs: number;
}): { elapsedMs: number; consistencyWindowMs: number } {
  const finiteOrZero = (n: number): number =>
    Number.isFinite(n) ? Math.max(0, n) : 0;
  return {
    elapsedMs: finiteOrZero(input.elapsedMs),
    consistencyWindowMs: finiteOrZero(input.consistencyWindowMs),
  };
}

/**
 * Clamp write-attempt counts to finite non-negative integers. NaN/Infinity/
 * negative → 0 so non-finite inputs cannot invent a silent create path.
 */
export function sanitizeCrmWriteAttemptCount(priorWriteAttemptCount: number): number {
  if (!Number.isFinite(priorWriteAttemptCount)) return 0;
  return Math.max(0, Math.trunc(priorWriteAttemptCount));
}

/**
 * True when elapsed is still inside the consistency window (inclusive edge).
 * `elapsedMs === consistencyWindowMs` remains within — escalate only after.
 * Non-finite values sanitize to 0 first.
 */
export function isWithinCrmConsistencyWindow(
  elapsedMs: number,
  consistencyWindowMs: number,
): boolean {
  const timing = sanitizeCrmConsistencyTiming({
    elapsedMs,
    consistencyWindowMs,
  });
  return timing.elapsedMs <= timing.consistencyWindowMs;
}

/**
 * Normalize correlation id for visibility matching. Blank/whitespace-only
 * ids never count as a durable correlation — refuse silent RECONCILE.
 */
export function normalizeCrmCorrelationId(correlationId: string): string {
  return correlationId.trim();
}

/**
 * Durable CRM record id — null/undefined/blank/whitespace are not durable.
 * Empty-string recordId must not authorize RECONCILE (false visibility).
 */
export function isDurableCrmRecordId(
  recordId: string | null | undefined,
): boolean {
  return typeof recordId === "string" && recordId.trim().length > 0;
}

/**
 * observedAtIso must be non-blank and parse as a finite instant — whitespace-only
 * or garbage timestamps never authorize RECONCILE (false durability).
 */
export function isDurableCrmObservedAtIso(
  observedAtIso: string | null | undefined,
): boolean {
  if (typeof observedAtIso !== "string") return false;
  const trimmed = observedAtIso.trim();
  if (!trimmed) return false;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed);
}

/** CRM module id must be non-blank — empty module never counts as fixture-visible. */
export function isDurableCrmModuleId(
  moduleId: string | null | undefined,
): boolean {
  return typeof moduleId === "string" && moduleId.trim().length > 0;
}

/**
 * Fixture CRM source label — trim-normalized exact match only.
 * live_zoho / padded aliases / wrong case never count as fixture-visible.
 */
export function isFixtureCrmReceiptSource(
  source: string | null | undefined,
): boolean {
  return (
    typeof source === "string" &&
    source.trim() === CRM_FIXTURE_RECEIPT_SOURCE
  );
}

/**
 * A receipt is "visible" for this correlation only when:
 * - correlationId matches (non-blank after trim, case-sensitive)
 * - fieldSnapshot.ws_correlation_id trim-matches the same correlation
 * - fieldSnapshot.ws_synthetic === "true"
 * - recordId, receiptId, observedAtIso, and moduleId are durable (non-blank),
 *   synthetic===true, source==="fixture_crm"
 * Optional expectedModuleId must match when provided.
 * Non-fixture / live_zoho / blank / mismatched receipts never authorize
 * RECONCILE or a create.
 */
export function crmReceiptVisibleForCorrelation(
  correlationId: string,
  receipts: readonly CanaryRemoteReceipt[],
  expectedModuleId?: string,
): boolean {
  const corr = normalizeCrmCorrelationId(correlationId);
  if (!corr) {
    return false;
  }
  const expectedModule = expectedModuleId?.trim() || undefined;
  return receipts.some((r) => {
    if (r.fieldSnapshot == null || typeof r.fieldSnapshot !== "object") {
      return false;
    }
    const snapCorr = normalizeCrmCorrelationId(
      r.fieldSnapshot.ws_correlation_id ?? "",
    );
    const snapSynthetic = (r.fieldSnapshot.ws_synthetic ?? "").trim();
    return (
      normalizeCrmCorrelationId(r.correlationId) === corr &&
      snapCorr === corr &&
      snapSynthetic === "true" &&
      isDurableCrmRecordId(r.recordId) &&
      isDurableCrmRecordId(r.receiptId) &&
      isDurableCrmObservedAtIso(r.observedAtIso) &&
      isDurableCrmModuleId(r.moduleId) &&
      r.synthetic === true &&
      isFixtureCrmReceiptSource(r.source) &&
      (expectedModule === undefined ||
        (typeof r.moduleId === "string" &&
          r.moduleId.trim() === expectedModule))
    );
  });
}

/**
 * Classify the empty-read / lag situation before deciding. Pure; no I/O.
 */
export function classifyCrmEmptyReadSituation(input: {
  correlationId: string;
  localWriteReceiptPresent: boolean;
  remoteReadEmpty: boolean;
  elapsedMs: number;
  consistencyWindowMs: number;
  correlatedReceipts: readonly CanaryRemoteReceipt[];
  expectedModuleId?: string;
}): CrmEmptyReadSituation {
  if (
    crmReceiptVisibleForCorrelation(
      input.correlationId,
      input.correlatedReceipts,
      input.expectedModuleId,
    )
  ) {
    return "visible_receipt";
  }
  const within = isWithinCrmConsistencyWindow(
    input.elapsedMs,
    input.consistencyWindowMs,
  );
  if (input.localWriteReceiptPresent) {
    if (input.remoteReadEmpty && within) return "local_empty_within_window";
    if (input.remoteReadEmpty && !within) return "local_empty_after_window";
    return "local_nonempty_no_visible";
  }
  if (input.remoteReadEmpty && within) return "no_local_empty_within_window";
  if (input.remoteReadEmpty && !within) return "no_local_empty_after_window";
  return "no_local_nonempty";
}

/**
 * Decide CRM lead retry after an empty remote read.
 * Never authorizes a second create when a local write already exists.
 */
export function decideCrmLeadRetryAfterEmptyRead(
  input: DecideCrmLeadRetryAfterEmptyReadInput,
): DecideCrmLeadRetryAfterEmptyReadResult {
  const adsRequested =
    input.requestChatgptAdsAccess === true ||
    input.requestChatgptAdsAccess === "ACCESS_ALLOWED";
  const externalEffectsClaimed =
    input.claimExternalEffects !== undefined &&
    input.claimExternalEffects !== "NONE";
  const liveProviderSuccessClaimed = input.claimLiveProviderSuccess === true;
  const sandboxVerifiedClaimed = input.claimSandboxVerified === true;
  if (
    input.claimLiveVerified === true ||
    sandboxVerifiedClaimed ||
    input.requestLiveZohoWire === true ||
    adsRequested ||
    externalEffectsClaimed ||
    liveProviderSuccessClaimed
  ) {
    return {
      action: CrmEmptyReadAction.LIVE_CLAIM_REFUSED,
      createLead: false,
      reason: liveProviderSuccessClaimed
        ? "claimLiveProviderSuccess refused — liveProviderSuccessClaimed=false on fixture path (T-X023); ACCEPTED≠VERIFIED"
        : externalEffectsClaimed
          ? "claimExternalEffects≠NONE refused — fixture path externalEffects=NONE only (T-X023); ACCEPTED≠VERIFIED"
          : adsRequested
            ? "ChatGPT Ads ACCESS_ALLOWED refused — soft-skip Ads trio; ACCESS_BLOCKED (T-X023); ACCEPTED≠VERIFIED"
            : sandboxVerifiedClaimed
              ? "claimSandboxVerified refused — fixture ACCEPTED only; ACCEPTED≠sandbox/prod VERIFIED (T-X023)"
              : "Live VERIFIED / live Zoho wire claims refused — fixture ACCEPTED only (T-X023); liveZohoWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      withinConsistencyWindow: isWithinCrmConsistencyWindow(
        input.elapsedMs,
        input.consistencyWindowMs,
      ),
      situation: classifyCrmEmptyReadSituation(input),
      ...HONESTY,
    };
  }

  const within = isWithinCrmConsistencyWindow(
    input.elapsedMs,
    input.consistencyWindowMs,
  );
  const situation = classifyCrmEmptyReadSituation(input);

  switch (situation) {
    case "visible_receipt":
      return {
        action: CrmEmptyReadAction.RECONCILE,
        createLead: false,
        reason:
          "Correlated CRM receipt visible — reconcile; refuse second create",
        withinConsistencyWindow: within,
        situation,
        ...HONESTY,
      };
    case "local_empty_within_window":
      return {
        action: CrmEmptyReadAction.BOUND_WAIT,
        createLead: false,
        reason:
          "Local write present; empty remote within consistency window — BOUND_WAIT (false not-found)",
        withinConsistencyWindow: true,
        situation,
        ...HONESTY,
      };
    case "local_empty_after_window":
      return {
        action: CrmEmptyReadAction.ESCALATE_MISSING,
        createLead: false,
        reason:
          "Local write present; empty remote after window — ESCALATE_MISSING (still no create)",
        withinConsistencyWindow: false,
        situation,
        ...HONESTY,
      };
    case "local_nonempty_no_visible":
      return {
        action: CrmEmptyReadAction.REFUSE_CREATE,
        createLead: false,
        reason:
          "Local write/outbox present — REFUSE_CREATE even if remote still lagging",
        withinConsistencyWindow: within,
        situation,
        ...HONESTY,
      };
    case "no_local_empty_within_window":
      return {
        action: CrmEmptyReadAction.BOUND_WAIT,
        createLead: false,
        reason:
          "No local write yet; empty remote within window — BOUND_WAIT (no speculative create)",
        withinConsistencyWindow: true,
        situation,
        ...HONESTY,
      };
    case "no_local_empty_after_window":
      return {
        action: CrmEmptyReadAction.ESCALATE_MISSING,
        createLead: false,
        reason:
          "Empty remote without local write after window — ESCALATE_MISSING (no create)",
        withinConsistencyWindow: false,
        situation,
        ...HONESTY,
      };
    case "no_local_nonempty":
      return {
        action: CrmEmptyReadAction.ESCALATE_MISSING,
        createLead: false,
        reason:
          "No local write and no visible correlated receipt — ESCALATE_MISSING (no create)",
        withinConsistencyWindow: within,
        situation,
        ...HONESTY,
      };
  }
}

/**
 * Counterfactual: trusting an empty EC read as durable not-found would
 * authorize an unsafe create. Used only to document the forbidden path.
 */
export function counterfactualUnsafeCreateOnEmptyRead(input: {
  remoteReadEmpty: boolean;
  localWriteReceiptPresent: boolean;
}): {
  wouldCreateLead: boolean;
  forbidden: true;
  reason: string;
  createLead: false;
  liveZohoWiring: typeof CRM_LIVE_ZOHO_WIRING;
  chatgptAdsAccess: typeof CRM_CHATGPT_ADS_ACCESS;
  externalEffects: "NONE";
  liveProviderSuccessClaimed: false;
} {
  const would =
    input.remoteReadEmpty === true && input.localWriteReceiptPresent === true;
  return {
    wouldCreateLead: would,
    forbidden: true,
    reason: would
      ? "Counterfactual: empty EC read + local write would create a duplicate lead"
      : "Counterfactual create not triggered",
    createLead: false,
    ...HONESTY,
  };
}

/**
 * Explicit refuse of a second create — never flips createLead regardless of
 * empty-read pressure. Additive guard for soak/proof call sites.
 */
export function refuseUnsafeSecondCrmCreate(input: {
  localWriteReceiptPresent: boolean;
  remoteReadEmpty: boolean;
  priorWriteAttemptCount: number;
}): {
  createLead: false;
  writeAttemptCountUnchanged: true;
  priorWriteAttemptCount: number;
  refused: true;
  liveZohoWiring: typeof CRM_LIVE_ZOHO_WIRING;
  chatgptAdsAccess: typeof CRM_CHATGPT_ADS_ACCESS;
  externalEffects: "NONE";
  liveProviderSuccessClaimed: false;
  reason: string;
} {
  const priorWriteAttemptCount = sanitizeCrmWriteAttemptCount(
    input.priorWriteAttemptCount,
  );
  return {
    createLead: false,
    writeAttemptCountUnchanged: true,
    priorWriteAttemptCount,
    refused: true,
    ...HONESTY,
    reason: input.localWriteReceiptPresent
      ? "Local write already present — refuseUnsafeSecondCrmCreate (false not-found ≠ create)"
      : input.remoteReadEmpty
        ? "Empty remote alone never authorizes create — refuseUnsafeSecondCrmCreate"
        : "refuseUnsafeSecondCrmCreate — createLead stays false",
  };
}

/**
 * After lag clears, reconcile the canary intent against visible receipts.
 * Pass requires MATCHED + blocksRetry false + create still refused.
 */
export function reconcileAfterConsistencyVisibility(input: {
  intent: CanaryIntent;
  receipts: readonly CanaryRemoteReceipt[];
  expectedModuleId: string;
}): {
  reconcile: ReconciliationResult;
  createLead: false;
  matched: boolean;
  liveZohoWiring: typeof CRM_LIVE_ZOHO_WIRING;
  chatgptAdsAccess: typeof CRM_CHATGPT_ADS_ACCESS;
  externalEffects: "NONE";
  liveProviderSuccessClaimed: false;
} {
  const corr = normalizeCrmCorrelationId(input.intent.correlationId);
  if (!corr) {
    // Blank correlation cannot MATCHED — refuse create; leave reconcile unmatched.
    const reconcile = reconcileCanaryIntent({
      intent: input.intent,
      receipts: [],
      expectedModuleId: input.expectedModuleId,
    });
    return {
      reconcile,
      createLead: false,
      matched: false,
      ...HONESTY,
    };
  }
  // Only fixture-visible receipts may enter reconcile — drop live/bad-snapshot noise.
  const visibleReceipts = input.receipts.filter((r) =>
    crmReceiptVisibleForCorrelation(corr, [r], input.expectedModuleId),
  );
  const reconcile = reconcileCanaryIntent({
    intent: input.intent,
    receipts: visibleReceipts,
    expectedModuleId: input.expectedModuleId,
  });
  const matched =
    reconcile.status === ReconciliationStatus.MATCHED &&
    reconcile.verdict === ProbeVerdict.SUCCESS &&
    reconcile.blocksRetry === false;
  return {
    reconcile,
    createLead: false,
    matched,
    ...HONESTY,
  };
}
