/**
 * T-X014 — Approval wait survives restart: resume wait; no slot hold.
 *
 * An ACCEPTED_PENDING / WAITING_APPROVAL operation must rehydrate after
 * process restart(s) as still waiting (resume wait) — never auto-promoted to
 * VERIFIED and never converted into a worker slot hold. Apply attempt count
 * must not grow solely because of restart. Slot lease stays released while
 * waiting. Corrupt durable wait-manifest bytes must not invent WAITING_APPROVAL,
 * apply counts, slot holds, or auto-verify. Pure domain. Temporal remains
 * NOT_WIRED. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 * ChatGPT Ads ACCESS_BLOCKED.
 */

export const APPROVAL_WAIT_RELATED_CASE_IDS = ["T-X014"] as const;

/** Live Temporal / durable-runtime wiring — always NOT_WIRED for fixture proofs. */
export const APPROVAL_WAIT_TEMPORAL_WIRING = "NOT_WIRED" as const;

export type ApprovalWaitTemporalWiring =
  typeof APPROVAL_WAIT_TEMPORAL_WIRING;

export const ApprovalWaitPhase = {
  WAITING_APPROVAL: "WAITING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  /** Forbidden post-restart without independent verify — never invent this. */
  AUTO_VERIFIED: "AUTO_VERIFIED",
} as const;

export type ApprovalWaitPhaseValue =
  (typeof ApprovalWaitPhase)[keyof typeof ApprovalWaitPhase];

/** Worker/concurrency slot lease while waiting for approval. */
export const ApprovalWaitSlotLease = {
  RELEASED: "released",
  HELD: "held",
} as const;

export type ApprovalWaitSlotLeaseValue =
  (typeof ApprovalWaitSlotLease)[keyof typeof ApprovalWaitSlotLease];

/** Integrity of the durable approval-wait manifest on disk. */
export const ApprovalWaitManifestIntegrity = {
  OK: "OK",
  CORRUPT_JSON: "CORRUPT_JSON",
  TRUNCATED: "TRUNCATED",
  MISSING_REQUIRED_FIELDS: "MISSING_REQUIRED_FIELDS",
  CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
  WRONG_SCHEMA: "WRONG_SCHEMA",
} as const;

export type ApprovalWaitManifestIntegrityValue =
  (typeof ApprovalWaitManifestIntegrity)[keyof typeof ApprovalWaitManifestIntegrity];

/** Schema id required on durable wait manifests (fixture-only). */
export const APPROVAL_WAIT_MANIFEST_SCHEMA = "approval-wait-v1" as const;

export type ApprovalWaitDurableManifest = {
  schema: typeof APPROVAL_WAIT_MANIFEST_SCHEMA;
  operationId: string;
  jobId: string;
  phase: ApprovalWaitPhaseValue;
  waitIdentityKey: string;
  applyAttemptCount: number;
  slotLease: ApprovalWaitSlotLeaseValue;
  /** Optional integrity checksum of canonical payload (excluding checksum itself). */
  checksum?: string;
};

export type ApprovalWaitSnapshot = {
  operationId: string;
  jobId: string;
  /** Pre-restart phase — must be WAITING_APPROVAL for T-X014. */
  phaseBeforeRestart: ApprovalWaitPhaseValue;
  /** Post-restart rehydrated phase. */
  phaseAfterRestart: ApprovalWaitPhaseValue;
  /**
   * @deprecated Prefer slotLease. True when lease is held.
   * Kept for callers that still pass the boolean.
   */
  holdsWorkerSlot: boolean;
  /** Explicit slot lease — must be released while waiting. */
  slotLease: ApprovalWaitSlotLeaseValue;
  /** Apply attempt count before restart. */
  applyAttemptCountBeforeRestart: number;
  /** Apply attempt count after restart — must equal before (no duplicate apply). */
  applyAttemptCountAfterRestart: number;
  /** How many process restarts this snapshot survived (1+). */
  restartCount: number;
  /**
   * Stable wait identity (e.g. business idempotency key) before restart.
   * Must match afterRestart — wait must not be reinvented.
   */
  waitIdentityKeyBeforeRestart: string;
  /** Stable wait identity after restart. */
  waitIdentityKeyAfterRestart: string;
  /**
   * Observed durable-manifest integrity after restart. When corrupt, resume
   * must be refused — never invent WAITING_APPROVAL from bad bytes.
   */
  manifestIntegrity?: ApprovalWaitManifestIntegrityValue;
  fixtureOnly: true;
};

export type ApprovalWaitHonestyCode =
  | "RESUME_WAIT_NO_SLOT"
  | "SLOT_HOLD_WHILE_WAITING_REFUSED"
  | "SLOT_LEASE_REACQUIRE_REFUSED"
  | "AUTO_VERIFY_ON_RESTART_REFUSED"
  | "PROMOTE_WITHOUT_INDEPENDENT_VERIFY_REFUSED"
  | "EXPIRE_WAIT_ON_RESTART_REFUSED"
  | "WALL_CLOCK_EXPIRE_REFUSED"
  | "INVENT_APPROVED_ON_RESTART_REFUSED"
  | "INVENT_REJECTED_ON_RESTART_REFUSED"
  | "CANCEL_WAIT_ON_RESTART_REFUSED"
  | "WAIT_IDENTITY_MISMATCH"
  | "PHASE_NOT_WAITING"
  | "APPLY_COUNT_GREW_ON_RESTART"
  | "APPLY_COUNT_DECREASED_ON_RESTART"
  | "CORRUPT_WAIT_MANIFEST"
  | "MISSING_WAIT_MANIFEST"
  | "INVALID_SNAPSHOT"
  | "LIVE_TEMPORAL_CLAIM_REFUSED"
  | "JOB_CONTINUITY_MISMATCH";

export type ApprovalWaitHonestyDecision = {
  allowed: boolean;
  code: ApprovalWaitHonestyCode;
  reasons: string[];
  /** Resume wait without holding a worker slot. */
  resumeWait: boolean;
  holdsWorkerSlot: boolean;
  slotLease: ApprovalWaitSlotLeaseValue;
  restartCount: number;
  externalEffects: "NONE";
  temporalWiring: ApprovalWaitTemporalWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  fixtureOnly: true;
};

function honesty(
  restartCount: number,
  slotLease: ApprovalWaitSlotLeaseValue,
): Pick<
  ApprovalWaitHonestyDecision,
  | "externalEffects"
  | "temporalWiring"
  | "liveProviderSuccessClaimed"
  | "chatgptAdsAccess"
  | "fixtureOnly"
  | "restartCount"
  | "slotLease"
> {
  return {
    externalEffects: "NONE",
    temporalWiring: APPROVAL_WAIT_TEMPORAL_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
    fixtureOnly: true,
    restartCount,
    slotLease,
  };
}

function normalizeSlotLease(
  snapshot: ApprovalWaitSnapshot,
): ApprovalWaitSlotLeaseValue {
  if (snapshot.slotLease === ApprovalWaitSlotLease.HELD || snapshot.holdsWorkerSlot) {
    return ApprovalWaitSlotLease.HELD;
  }
  return ApprovalWaitSlotLease.RELEASED;
}

function isCorruptManifestIntegrity(
  integrity: ApprovalWaitManifestIntegrityValue | undefined,
): boolean {
  return (
    integrity !== undefined &&
    integrity !== ApprovalWaitManifestIntegrity.OK
  );
}

/** Refuse wait keys that are whitespace/zero-width/soft-hyphen only — no durable identity. */
function waitIdentityKeyHasVisibleContent(key: string): boolean {
  const stripped = key
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "")
    .trim();
  return stripped.length > 0;
}

/**
 * Inspect raw durable approval-wait manifest bytes. Truncated / unparseable /
 * incomplete / checksum-mismatched / wrong-schema payloads are CORRUPT — never
 * invent WAITING_APPROVAL from them.
 */
export function inspectApprovalWaitDurableManifest(input: {
  raw: string | null | undefined;
  expectedChecksum?: string;
}): {
  integrity: ApprovalWaitManifestIntegrityValue;
  parsed: ApprovalWaitDurableManifest | null;
  reasons: string[];
} {
  const raw = input.raw;
  if (raw === null || raw === undefined) {
    return {
      integrity: ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS,
      parsed: null,
      reasons: ["Durable wait-manifest missing (null/undefined)"],
    };
  }
  const trimmed = String(raw);
  if (trimmed.length > 0 && trimmed.charCodeAt(0) === 0xfeff) {
    return {
      integrity: ApprovalWaitManifestIntegrity.CORRUPT_JSON,
      parsed: null,
      reasons: [
        "Durable wait-manifest has UTF-8 BOM prefix — refuse parse/invent (T-X014)",
      ],
    };
  }
  if (!trimmed.trim()) {
    return {
      integrity: ApprovalWaitManifestIntegrity.TRUNCATED,
      parsed: null,
      reasons: ["Durable wait-manifest empty/truncated"],
    };
  }
  // Truncated JSON often ends mid-token without closing braces.
  const openBraces = (trimmed.match(/\{/g) ?? []).length;
  const closeBraces = (trimmed.match(/\}/g) ?? []).length;
  const unbalanced = openBraces !== closeBraces;

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(trimmed) as unknown;
  } catch {
    if (unbalanced || !trimmed.trimEnd().endsWith("}")) {
      return {
        integrity: ApprovalWaitManifestIntegrity.TRUNCATED,
        parsed: null,
        reasons: ["Durable wait-manifest appears truncated (unbalanced/incomplete JSON)"],
      };
    }
    return {
      integrity: ApprovalWaitManifestIntegrity.CORRUPT_JSON,
      parsed: null,
      reasons: ["Durable wait-manifest JSON.parse failed"],
    };
  }

  if (
    parsedUnknown === null ||
    typeof parsedUnknown !== "object" ||
    Array.isArray(parsedUnknown)
  ) {
    return {
      integrity: ApprovalWaitManifestIntegrity.CORRUPT_JSON,
      parsed: null,
      reasons: ["Durable wait-manifest root must be a JSON object"],
    };
  }

  const obj = parsedUnknown as Record<string, unknown>;
  if (obj.schema !== APPROVAL_WAIT_MANIFEST_SCHEMA) {
    return {
      integrity: ApprovalWaitManifestIntegrity.WRONG_SCHEMA,
      parsed: null,
      reasons: [
        `schema must be ${APPROVAL_WAIT_MANIFEST_SCHEMA}; got ${String(obj.schema)}`,
      ],
    };
  }

  const operationId = String(obj.operationId ?? "").trim();
  const jobId = String(obj.jobId ?? "").trim();
  const waitIdentityKey = String(obj.waitIdentityKey ?? "").trim();
  if (
    !waitIdentityKeyHasVisibleContent(waitIdentityKey) ||
    !waitIdentityKeyHasVisibleContent(operationId) ||
    !waitIdentityKeyHasVisibleContent(jobId)
  ) {
    return {
      integrity: ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS,
      parsed: null,
      reasons: [
        "Durable wait-manifest ids must have visible content — refuse invisible-only operationId/jobId/waitIdentityKey (T-X014)",
      ],
    };
  }
  const phase = obj.phase;
  const slotLease = obj.slotLease;
  const applyAttemptCount = obj.applyAttemptCount;

  if (
    !operationId ||
    !jobId ||
    !waitIdentityKey ||
    (phase !== ApprovalWaitPhase.WAITING_APPROVAL &&
      phase !== ApprovalWaitPhase.APPROVED &&
      phase !== ApprovalWaitPhase.REJECTED &&
      phase !== ApprovalWaitPhase.AUTO_VERIFIED) ||
    (slotLease !== ApprovalWaitSlotLease.RELEASED &&
      slotLease !== ApprovalWaitSlotLease.HELD) ||
    !Number.isInteger(applyAttemptCount) ||
    (applyAttemptCount as number) < 1
  ) {
    return {
      integrity: ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS,
      parsed: null,
      reasons: [
        "Durable wait-manifest missing required fields (operationId/jobId/phase/waitIdentityKey/applyAttemptCount/slotLease)",
      ],
    };
  }

  const checksum =
    typeof obj.checksum === "string" ? obj.checksum.trim() : undefined;
  if (
    input.expectedChecksum !== undefined &&
    input.expectedChecksum.trim() !== "" &&
    checksum !== input.expectedChecksum.trim()
  ) {
    return {
      integrity: ApprovalWaitManifestIntegrity.CHECKSUM_MISMATCH,
      parsed: null,
      reasons: [
        `checksum mismatch: expected=${input.expectedChecksum.trim()} got=${checksum ?? "(absent)"}`,
      ],
    };
  }

  const manifest: ApprovalWaitDurableManifest = {
    schema: APPROVAL_WAIT_MANIFEST_SCHEMA,
    operationId,
    jobId,
    phase: phase as ApprovalWaitPhaseValue,
    waitIdentityKey,
    applyAttemptCount: applyAttemptCount as number,
    slotLease: slotLease as ApprovalWaitSlotLeaseValue,
    ...(checksum ? { checksum } : {}),
  };

  return {
    integrity: ApprovalWaitManifestIntegrity.OK,
    parsed: manifest,
    reasons: ["Durable wait-manifest integrity OK"],
  };
}

/**
 * Corrupt durable wait-manifest honesty: never invent WAITING_APPROVAL,
 * apply counts, slot holds, or auto-verify from corrupt bytes.
 */
export function evaluateApprovalWaitCorruptManifest(input: {
  rawManifest: string | null | undefined;
  expectedChecksum?: string;
  /** Forbidden — invent WAITING_APPROVAL despite corrupt bytes. */
  inventWaitingApprovalFromCorrupt?: boolean;
  /** Forbidden — invent an applyAttemptCount from corrupt bytes. */
  inventApplyCountFromCorrupt?: number;
  /** Forbidden — hold a worker slot after corrupt rehydrate. */
  forceSlotHoldFromCorrupt?: boolean;
  /** Forbidden — auto-verify after reading corrupt manifest. */
  autoVerifyFromCorrupt?: boolean;
  claimLiveVerified?: boolean;
}): ApprovalWaitHonestyDecision {
  const inspected = inspectApprovalWaitDurableManifest({
    raw: input.rawManifest,
    ...(input.expectedChecksum !== undefined
      ? { expectedChecksum: input.expectedChecksum }
      : {}),
  });

  if (input.claimLiveVerified === true) {
    return {
      allowed: false,
      code: "LIVE_TEMPORAL_CLAIM_REFUSED",
      reasons: [
        "Live VERIFIED claims forbidden on corrupt-manifest path (T-X014)",
        "temporalWiring=NOT_WIRED",
      ],
      resumeWait: false,
      holdsWorkerSlot: false,
      ...honesty(0, ApprovalWaitSlotLease.RELEASED),
    };
  }

  if (inspected.integrity === ApprovalWaitManifestIntegrity.OK) {
    const parsed = inspected.parsed;
    if (
      input.inventWaitingApprovalFromCorrupt === true ||
      input.inventApplyCountFromCorrupt !== undefined ||
      input.forceSlotHoldFromCorrupt === true ||
      input.autoVerifyFromCorrupt === true
    ) {
      if (
        input.inventWaitingApprovalFromCorrupt === true &&
        parsed &&
        parsed.phase !== ApprovalWaitPhase.WAITING_APPROVAL
      ) {
        return {
          allowed: false,
          code: "CORRUPT_WAIT_MANIFEST",
          reasons: [
            "Refuse invent WAITING_APPROVAL from manifest whose durable phase is not WAITING_APPROVAL (T-X014)",
            `phase=${parsed.phase}`,
          ],
          resumeWait: false,
          holdsWorkerSlot: false,
          ...honesty(
            0,
            parsed.slotLease ?? ApprovalWaitSlotLease.RELEASED,
          ),
        };
      }
      return {
        allowed: false,
        code: "CORRUPT_WAIT_MANIFEST",
        reasons: [
          "Forbidden invent flags on intact durable wait-manifest — no override of durable bytes (T-X014)",
        ],
        resumeWait: false,
        holdsWorkerSlot: input.forceSlotHoldFromCorrupt === true,
        ...honesty(
          0,
          input.forceSlotHoldFromCorrupt === true
            ? ApprovalWaitSlotLease.HELD
            : (parsed?.slotLease ?? ApprovalWaitSlotLease.RELEASED),
        ),
      };
    }
    return {
      allowed: true,
      code: "RESUME_WAIT_NO_SLOT",
      reasons: [
        "Durable wait-manifest integrity OK — may resume only via survives-restart evaluator (T-X014)",
        ...inspected.reasons,
      ],
      resumeWait: parsed?.phase === ApprovalWaitPhase.WAITING_APPROVAL,
      holdsWorkerSlot: false,
      ...honesty(
        0,
        parsed?.slotLease ?? ApprovalWaitSlotLease.RELEASED,
      ),
    };
  }

  const missing =
    inspected.integrity === ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS;
  const refuseCode = missing ? "MISSING_WAIT_MANIFEST" : "CORRUPT_WAIT_MANIFEST";

  // Corrupt/missing path — refuse all invents.
  if (
    input.inventWaitingApprovalFromCorrupt === true ||
    input.inventApplyCountFromCorrupt !== undefined ||
    input.forceSlotHoldFromCorrupt === true ||
    input.autoVerifyFromCorrupt === true
  ) {
    return {
      allowed: false,
      code: refuseCode,
      reasons: [
        missing
          ? `Missing wait-manifest (${inspected.integrity}) — refuse invent WAITING_APPROVAL / applyCount / slot hold / auto-verify (T-X014)`
          : `Corrupt wait-manifest (${inspected.integrity}) — refuse invent WAITING_APPROVAL / applyCount / slot hold / auto-verify (T-X014)`,
        ...inspected.reasons,
        "ACCEPTED≠VERIFIED externalEffects=NONE temporalWiring=NOT_WIRED",
      ],
      resumeWait: false,
      holdsWorkerSlot: input.forceSlotHoldFromCorrupt === true,
      ...honesty(
        0,
        input.forceSlotHoldFromCorrupt === true
          ? ApprovalWaitSlotLease.HELD
          : ApprovalWaitSlotLease.RELEASED,
      ),
    };
  }

  return {
    allowed: false,
    code: refuseCode,
    reasons: [
      missing
        ? `Missing wait-manifest (${inspected.integrity}) — do not invent WAITING_APPROVAL from absent durable store (T-X014)`
        : `Corrupt wait-manifest (${inspected.integrity}) — do not resume from bad durable bytes (T-X014)`,
      ...inspected.reasons,
      "Never invent WAITING_APPROVAL, applyAttemptCount, slot lease, or VERIFIED from missing/corrupt manifest",
    ],
    resumeWait: false,
    holdsWorkerSlot: false,
    ...honesty(0, ApprovalWaitSlotLease.RELEASED),
  };
}

/**
 * Evaluate whether an approval-wait snapshot honestly survives restart:
 * resume WAITING_APPROVAL, slot lease released, never auto-verify,
 * applyAttemptCount must not grow solely because of restart.
 * Corrupt durable manifests refuse resume.
 */
export function evaluateApprovalWaitSurvivesRestart(input: {
  snapshot: ApprovalWaitSnapshot;
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — Temporal stays NOT_WIRED. */
  requestTemporalWire?: boolean;
  /** Forbidden — invent a worker slot hold while waiting for approval. */
  forceSlotHoldWhileWaiting?: boolean;
  /** Forbidden — reacquire a released slot lease during wait. */
  reacquireSlotLeaseWhileWaiting?: boolean;
  /** Forbidden — promote to VERIFIED/APPROVED without independent verify. */
  promoteWithoutIndependentVerify?: boolean;
  /** Forbidden — treat restart/wall-clock alone as wait expiry. */
  expireWaitOnRestartAlone?: boolean;
  /** Forbidden — treat wall-clock advance alone as wait expiry (no owner decision). */
  wallClockAdvanceAlone?: boolean;
  /** Forbidden — invent APPROVED phase solely because of restart. */
  inventApprovedOnRestart?: boolean;
  /** Forbidden — invent REJECTED phase solely because of restart. */
  inventRejectedOnRestart?: boolean;
  /** Forbidden — cancel/clear the wait solely because of restart. */
  cancelWaitOnRestartAlone?: boolean;
}): ApprovalWaitHonestyDecision {
  const rawRestartCount = input.snapshot.restartCount;
  if (
    !Number.isFinite(rawRestartCount) ||
    !Number.isInteger(rawRestartCount)
  ) {
    const slotLeaseEarly = normalizeSlotLease(input.snapshot);
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "restartCount must be a finite integer ≥1 — refuse NaN/Infinity/float invent (T-X014)",
        `got=${String(rawRestartCount)}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLeaseEarly === ApprovalWaitSlotLease.HELD,
      ...honesty(0, slotLeaseEarly),
    };
  }
  const restartCount = Math.max(0, rawRestartCount);
  const slotLease = normalizeSlotLease(input.snapshot);

  if (
    input.snapshot.manifestIntegrity ===
    ApprovalWaitManifestIntegrity.MISSING_REQUIRED_FIELDS
  ) {
    return {
      allowed: false,
      code: "MISSING_WAIT_MANIFEST",
      reasons: [
        "Durable wait-manifest missing — refuse invent WAITING_APPROVAL / applyCount / slot hold (T-X014)",
        "Never invent resume wait from absent durable store",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (isCorruptManifestIntegrity(input.snapshot.manifestIntegrity)) {
    return {
      allowed: false,
      code: "CORRUPT_WAIT_MANIFEST",
      reasons: [
        `Observed durable wait-manifest integrity=${input.snapshot.manifestIntegrity} — refuse resume invent (T-X014)`,
        "Never invent WAITING_APPROVAL / applyCount / slot hold from corrupt manifest",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  const operationId = String(input.snapshot.operationId ?? "").trim();
  const jobId = String(input.snapshot.jobId ?? "").trim();
  if (!operationId || !jobId) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: ["operationId and jobId are required for approval-wait honesty (T-X014)"],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }
  if (
    !waitIdentityKeyHasVisibleContent(operationId) ||
    !waitIdentityKeyHasVisibleContent(jobId)
  ) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "operationId/jobId must contain visible characters — refuse invisible-only ids (T-X014)",
        `operationId=${JSON.stringify(operationId)} jobId=${JSON.stringify(jobId)}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  const waitBefore = String(
    input.snapshot.waitIdentityKeyBeforeRestart ?? "",
  ).trim();
  const waitAfter = String(
    input.snapshot.waitIdentityKeyAfterRestart ?? "",
  ).trim();
  if (!waitBefore || !waitAfter) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "waitIdentityKey before/after restart is required (T-X014 wait continuity)",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }
  if (
    !waitIdentityKeyHasVisibleContent(waitBefore) ||
    !waitIdentityKeyHasVisibleContent(waitAfter)
  ) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "waitIdentityKey must contain visible characters — refuse zero-width/soft-hyphen-only identity (T-X014)",
        `before=${JSON.stringify(waitBefore)} after=${JSON.stringify(waitAfter)}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }
  if (waitBefore !== waitAfter) {
    return {
      allowed: false,
      code: "WAIT_IDENTITY_MISMATCH",
      reasons: [
        "Wait identity key must continue across restart — do not reinvent the wait (T-X014)",
        `before=${waitBefore} after=${waitAfter}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.claimLiveVerified === true || input.requestTemporalWire === true) {
    return {
      allowed: false,
      code: "LIVE_TEMPORAL_CLAIM_REFUSED",
      reasons: [
        input.claimLiveVerified === true
          ? "Live VERIFIED claims forbidden — fixture ACCEPTED only (T-X014)"
          : "Temporal wiring remains NOT_WIRED — refuse live Temporal wire (T-X014)",
        "ACCEPTED≠VERIFIED chatgptAdsAccess=ACCESS_BLOCKED",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.promoteWithoutIndependentVerify === true) {
    return {
      allowed: false,
      code: "PROMOTE_WITHOUT_INDEPENDENT_VERIFY_REFUSED",
      reasons: [
        "Cannot promote approval wait without independent verify (T-X014)",
        "ACCEPTED_PENDING ≠ VERIFIED — resume wait after restart",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.expireWaitOnRestartAlone === true) {
    return {
      allowed: false,
      code: "EXPIRE_WAIT_ON_RESTART_REFUSED",
      reasons: [
        "Restart/wall-clock alone must not expire approval wait (T-X014)",
        "Resume WAITING_APPROVAL until owner decision or independent verify path",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.wallClockAdvanceAlone === true) {
    return {
      allowed: false,
      code: "WALL_CLOCK_EXPIRE_REFUSED",
      reasons: [
        "Wall-clock advance alone must not expire approval wait (T-X014)",
        "Resume WAITING_APPROVAL until owner decision or independent verify path",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.inventApprovedOnRestart === true) {
    return {
      allowed: false,
      code: "INVENT_APPROVED_ON_RESTART_REFUSED",
      reasons: [
        "Cannot invent APPROVED solely because of restart (T-X014)",
        "Resume WAITING_APPROVAL — ACCEPTED_PENDING ≠ VERIFIED/APPROVED",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.inventRejectedOnRestart === true) {
    return {
      allowed: false,
      code: "INVENT_REJECTED_ON_RESTART_REFUSED",
      reasons: [
        "Cannot invent REJECTED solely because of restart (T-X014)",
        "Resume WAITING_APPROVAL until owner decision — restart is not a reject",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (input.cancelWaitOnRestartAlone === true) {
    return {
      allowed: false,
      code: "CANCEL_WAIT_ON_RESTART_REFUSED",
      reasons: [
        "Cannot cancel/clear approval wait solely because of restart (T-X014)",
        "Resume WAITING_APPROVAL — wait identity continues across restart",
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  const { snapshot } = input;

  if (
    snapshot.phaseBeforeRestart !== ApprovalWaitPhase.WAITING_APPROVAL ||
    snapshot.phaseAfterRestart !== ApprovalWaitPhase.WAITING_APPROVAL
  ) {
    if (
      snapshot.phaseAfterRestart === ApprovalWaitPhase.AUTO_VERIFIED ||
      snapshot.phaseAfterRestart === ApprovalWaitPhase.APPROVED
    ) {
      return {
        allowed: false,
        code: "AUTO_VERIFY_ON_RESTART_REFUSED",
        reasons: [
          "Restart must not auto-promote approval wait to VERIFIED/APPROVED (T-X014)",
          "Resume wait until independent verify; ACCEPTED_PENDING ≠ VERIFIED",
        ],
        resumeWait: false,
        holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
        ...honesty(restartCount, slotLease),
      };
    }
    if (snapshot.phaseAfterRestart === ApprovalWaitPhase.REJECTED) {
      return {
        allowed: false,
        code: "INVENT_REJECTED_ON_RESTART_REFUSED",
        reasons: [
          "Restart must not invent REJECTED from WAITING_APPROVAL (T-X014)",
          "Resume wait until owner decision",
        ],
        resumeWait: false,
        holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
        ...honesty(restartCount, slotLease),
      };
    }
    return {
      allowed: false,
      code: "PHASE_NOT_WAITING",
      reasons: [
        `Approval wait requires WAITING_APPROVAL before/after restart; got ${snapshot.phaseBeforeRestart}→${snapshot.phaseAfterRestart}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: slotLease === ApprovalWaitSlotLease.HELD,
      ...honesty(restartCount, slotLease),
    };
  }

  if (
    slotLease === ApprovalWaitSlotLease.HELD ||
    input.forceSlotHoldWhileWaiting === true
  ) {
    return {
      allowed: false,
      code: "SLOT_HOLD_WHILE_WAITING_REFUSED",
      reasons: [
        "Approval wait must not hold a worker/concurrency slot (T-X014)",
        "Resume wait; no slot hold — release capacity while ACCEPTED_PENDING",
      ],
      resumeWait: true,
      holdsWorkerSlot: true,
      ...honesty(restartCount, ApprovalWaitSlotLease.HELD),
    };
  }

  if (input.reacquireSlotLeaseWhileWaiting === true) {
    return {
      allowed: false,
      code: "SLOT_LEASE_REACQUIRE_REFUSED",
      reasons: [
        "Cannot reacquire worker slot lease while still WAITING_APPROVAL (T-X014)",
        "slotLease must stay released across restart(s)",
      ],
      resumeWait: true,
      holdsWorkerSlot: true,
      ...honesty(restartCount, ApprovalWaitSlotLease.HELD),
    };
  }

  if (restartCount < 1) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: ["restartCount must be ≥1 for survives-restart honesty (T-X014)"],
      resumeWait: false,
      holdsWorkerSlot: false,
      ...honesty(restartCount, slotLease),
    };
  }

  if (
    !Number.isInteger(snapshot.applyAttemptCountBeforeRestart) ||
    !Number.isInteger(snapshot.applyAttemptCountAfterRestart) ||
    snapshot.applyAttemptCountBeforeRestart < 1 ||
    snapshot.applyAttemptCountAfterRestart < 1
  ) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "applyAttemptCount before/after must be integers ≥1 (no lost accept / no float invent)",
      ],
      resumeWait: false,
      holdsWorkerSlot: false,
      ...honesty(restartCount, slotLease),
    };
  }

  if (
    snapshot.applyAttemptCountAfterRestart >
    snapshot.applyAttemptCountBeforeRestart
  ) {
    return {
      allowed: false,
      code: "APPLY_COUNT_GREW_ON_RESTART",
      reasons: [
        "Apply attempt count must not grow solely because of restart (T-X014)",
        `before=${snapshot.applyAttemptCountBeforeRestart} after=${snapshot.applyAttemptCountAfterRestart}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: false,
      ...honesty(restartCount, slotLease),
    };
  }

  if (
    snapshot.applyAttemptCountAfterRestart <
    snapshot.applyAttemptCountBeforeRestart
  ) {
    return {
      allowed: false,
      code: "APPLY_COUNT_DECREASED_ON_RESTART",
      reasons: [
        "Apply attempt count must not decrease solely because of restart — no lost accept invent (T-X014)",
        `before=${snapshot.applyAttemptCountBeforeRestart} after=${snapshot.applyAttemptCountAfterRestart}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: false,
      ...honesty(restartCount, slotLease),
    };
  }

  return {
    allowed: true,
    code: "RESUME_WAIT_NO_SLOT",
    reasons: [
      `WAITING_APPROVAL rehydrated after ${restartCount} restart(s) — resume wait (T-X014)`,
      "slotLease=released — no slot hold while awaiting approval",
      `applyAttemptCount unchanged (${snapshot.applyAttemptCountAfterRestart})`,
      `waitIdentityKey continued (${waitAfter})`,
      "temporalWiring=NOT_WIRED ACCEPTED≠VERIFIED externalEffects=NONE",
    ],
    resumeWait: true,
    holdsWorkerSlot: false,
    ...honesty(restartCount, ApprovalWaitSlotLease.RELEASED),
  };
}

/**
 * Multi-restart survival: every hop stays WAITING_APPROVAL with released
 * slot lease, stable apply attempt count, and continuous wait identity.
 */
export function evaluateApprovalWaitAcrossRestarts(input: {
  operationId: string;
  jobId: string;
  waitIdentityKey: string;
  /** Ordered phases: index 0 = pre-first-restart; last = after final restart. */
  phases: readonly ApprovalWaitPhaseValue[];
  applyAttemptCounts: readonly number[];
  slotLeaseAfterEachRestart: readonly ApprovalWaitSlotLeaseValue[];
  claimLiveVerified?: boolean;
}): ApprovalWaitHonestyDecision {
  const restartCount = Math.max(0, input.phases.length - 1);
  if (
    input.phases.length < 2 ||
    input.applyAttemptCounts.length !== input.phases.length ||
    input.slotLeaseAfterEachRestart.length !== restartCount
  ) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "Multi-restart chain requires phases(N≥2), matching applyAttemptCounts, and slotLeaseAfterEachRestart(N-1)",
      ],
      resumeWait: false,
      holdsWorkerSlot: false,
      ...honesty(restartCount, ApprovalWaitSlotLease.RELEASED),
    };
  }

  // Fold chain into successive single-restart evaluations.
  for (let i = 0; i < restartCount; i += 1) {
    const step = evaluateApprovalWaitSurvivesRestart({
      snapshot: {
        operationId: input.operationId,
        jobId: input.jobId,
        phaseBeforeRestart: input.phases[i]!,
        phaseAfterRestart: input.phases[i + 1]!,
        holdsWorkerSlot:
          input.slotLeaseAfterEachRestart[i] === ApprovalWaitSlotLease.HELD,
        slotLease: input.slotLeaseAfterEachRestart[i]!,
        applyAttemptCountBeforeRestart: input.applyAttemptCounts[i]!,
        applyAttemptCountAfterRestart: input.applyAttemptCounts[i + 1]!,
        restartCount: i + 1,
        waitIdentityKeyBeforeRestart: input.waitIdentityKey,
        waitIdentityKeyAfterRestart: input.waitIdentityKey,
        fixtureOnly: true,
      },
      ...(input.claimLiveVerified === true
        ? { claimLiveVerified: true as const }
        : {}),
    });
    if (!step.allowed) {
      return {
        ...step,
        reasons: [
          `Multi-restart hop ${i + 1}/${restartCount} failed: ${step.code}`,
          ...step.reasons,
        ],
        restartCount,
      };
    }
  }

  return {
    allowed: true,
    code: "RESUME_WAIT_NO_SLOT",
    reasons: [
      `Survived ${restartCount} restart(s) still WAITING_APPROVAL — resume wait; slot lease released (T-X014)`,
      "temporalWiring=NOT_WIRED ACCEPTED≠VERIFIED",
    ],
    resumeWait: true,
    holdsWorkerSlot: false,
    ...honesty(restartCount, ApprovalWaitSlotLease.RELEASED),
  };
}

/**
 * Job continuity across restart: same jobId retained; WAITING_APPROVAL both
 * before and after; never invent a second job or a slot hold.
 */
export function evaluateApprovalWaitJobContinuity(input: {
  operationId: string;
  jobIdBeforeRestart: string;
  jobIdAfterRestart: string;
  jobCreatedAfterRestart: boolean;
  phaseBeforeRestart: ApprovalWaitPhaseValue;
  phaseAfterRestart: ApprovalWaitPhaseValue;
  holdsWorkerSlot: boolean;
  slotLease?: ApprovalWaitSlotLeaseValue;
  waitIdentityKeyBeforeRestart: string;
  waitIdentityKeyAfterRestart: string;
  claimLiveVerified?: boolean;
}): ApprovalWaitHonestyDecision {
  const slotLease =
    input.slotLease ??
    (input.holdsWorkerSlot
      ? ApprovalWaitSlotLease.HELD
      : ApprovalWaitSlotLease.RELEASED);

  if (input.claimLiveVerified === true) {
    return {
      allowed: false,
      code: "LIVE_TEMPORAL_CLAIM_REFUSED",
      reasons: [
        "Live VERIFIED claims forbidden on job continuity path (T-X014)",
        "temporalWiring=NOT_WIRED",
      ],
      resumeWait: false,
      holdsWorkerSlot: input.holdsWorkerSlot,
      ...honesty(1, slotLease),
    };
  }

  if (
    !String(input.operationId ?? "").trim() ||
    !String(input.jobIdBeforeRestart ?? "").trim()
  ) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: ["operationId and jobIdBeforeRestart required (T-X014)"],
      resumeWait: false,
      holdsWorkerSlot: input.holdsWorkerSlot,
      ...honesty(1, slotLease),
    };
  }

  const waitBefore = String(input.waitIdentityKeyBeforeRestart ?? "").trim();
  const waitAfter = String(input.waitIdentityKeyAfterRestart ?? "").trim();
  if (
    !waitBefore ||
    !waitAfter ||
    !waitIdentityKeyHasVisibleContent(waitBefore) ||
    !waitIdentityKeyHasVisibleContent(waitAfter)
  ) {
    return {
      allowed: false,
      code: "INVALID_SNAPSHOT",
      reasons: [
        "Job continuity requires visible waitIdentityKey — refuse invisible-only key (T-X014)",
        `before=${JSON.stringify(waitBefore || "(empty)")} after=${JSON.stringify(waitAfter || "(empty)")}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: input.holdsWorkerSlot,
      ...honesty(1, slotLease),
    };
  }
  if (waitBefore !== waitAfter) {
    return {
      allowed: false,
      code: "WAIT_IDENTITY_MISMATCH",
      reasons: [
        "Job continuity requires the same wait identity key across restart (T-X014)",
        `before=${waitBefore} after=${waitAfter}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: input.holdsWorkerSlot,
      ...honesty(1, slotLease),
    };
  }

  if (
    input.jobCreatedAfterRestart === true ||
    input.jobIdBeforeRestart !== input.jobIdAfterRestart
  ) {
    return {
      allowed: false,
      code: "JOB_CONTINUITY_MISMATCH",
      reasons: [
        "Job must continue with same jobId after restart — no duplicate job invent (T-X014)",
        `before=${input.jobIdBeforeRestart} after=${input.jobIdAfterRestart} created=${input.jobCreatedAfterRestart}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: input.holdsWorkerSlot,
      ...honesty(1, slotLease),
    };
  }

  if (
    input.phaseBeforeRestart !== ApprovalWaitPhase.WAITING_APPROVAL ||
    input.phaseAfterRestart !== ApprovalWaitPhase.WAITING_APPROVAL
  ) {
    return {
      allowed: false,
      code: "PHASE_NOT_WAITING",
      reasons: [
        `Job continuity requires WAITING_APPROVAL before/after restart; got ${input.phaseBeforeRestart}→${input.phaseAfterRestart}`,
      ],
      resumeWait: false,
      holdsWorkerSlot: input.holdsWorkerSlot,
      ...honesty(1, slotLease),
    };
  }

  if (slotLease === ApprovalWaitSlotLease.HELD || input.holdsWorkerSlot) {
    return {
      allowed: false,
      code: "SLOT_HOLD_WHILE_WAITING_REFUSED",
      reasons: [
        "Continued approval-wait job must not hold a worker slot (T-X014)",
      ],
      resumeWait: true,
      holdsWorkerSlot: true,
      ...honesty(1, ApprovalWaitSlotLease.HELD),
    };
  }

  return {
    allowed: true,
    code: "RESUME_WAIT_NO_SLOT",
    reasons: [
      `Job ${input.jobIdAfterRestart} continued for ${input.operationId} — resume wait; no slot hold`,
      "phaseBeforeRestart=WAITING_APPROVAL phaseAfterRestart=WAITING_APPROVAL",
      "slotLease=released temporalWiring=NOT_WIRED ACCEPTED≠VERIFIED",
    ],
    resumeWait: true,
    holdsWorkerSlot: false,
    ...honesty(1, ApprovalWaitSlotLease.RELEASED),
  };
}
