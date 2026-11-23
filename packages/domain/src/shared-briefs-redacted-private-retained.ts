/**
 * T-US-059 — Shared briefs redacted; private evidence retained.
 *
 * Offline fixture gate (cross-cutting privacy family): a shareable decision
 * brief must be redacted (no private fields) while the corresponding private
 * evidence stays retained in a private vault — not discarded and not shipped
 * into the shared export. Unredacted shared briefs, private fields in shared
 * packages, discarded private evidence, and private evidence leaked into the
 * shared export are refused. Live provider wiring stays NOT_WIRED. Pure
 * domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 *
 * Distinct from T-US-050 (owner brief root-cause actionable), T-US-053
 * (secrets never in browser assets), and soak `redactEvidenceSummary`
 * (string scrub helper only).
 */

export const BriefAudience = {
  SHARED: "shared",
  PRIVATE: "private",
} as const;

export type BriefAudienceValue =
  (typeof BriefAudience)[keyof typeof BriefAudience];

export const PrivateFieldKind = {
  RAW_PII: "raw_pii",
  CUSTOMER_CONTACT: "customer_contact",
  INTERNAL_EVIDENCE_REF: "internal_evidence_ref",
  CREDENTIAL_HINT: "credential_hint",
  UNREDACTED_QUOTE: "unredacted_quote",
} as const;

export type PrivateFieldKindValue =
  (typeof PrivateFieldKind)[keyof typeof PrivateFieldKind];

export const PrivateEvidenceRetentionStore = {
  PRIVATE_VAULT: "private_vault",
  SHARED_EXPORT: "shared_export",
  DISCARDED: "discarded",
} as const;

export type PrivateEvidenceRetentionStoreValue =
  (typeof PrivateEvidenceRetentionStore)[keyof typeof PrivateEvidenceRetentionStore];

export type SharedBriefSample = {
  briefId: string;
  audience: BriefAudienceValue;
  /** Shared briefs must be redacted before export. */
  redacted: boolean;
  /**
   * Declared private field kinds still present in the brief body
   * (fixture oracle). Empty for a clean shared brief.
   */
  privateFieldKinds: readonly PrivateFieldKindValue[];
};

export type PrivateEvidenceSample = {
  evidenceId: string;
  /** True when private evidence remains available after share. */
  retained: boolean;
  retentionStore: PrivateEvidenceRetentionStoreValue;
  /** Raw PII may exist only inside the private vault. */
  containsRawPii: boolean;
};

export type SharedBriefsRedactedPrivateRetainedInput = {
  shareId: string;
  brief: SharedBriefSample;
  privateEvidence: PrivateEvidenceSample;
  /** Attempt to export an unredacted shared brief — must refuse. */
  attemptShareUnredactedBrief: boolean;
  /** Attempt to discard private evidence when sharing — must refuse. */
  attemptDiscardPrivateEvidenceOnShare: boolean;
  /** Claim the share path is live-verified — must refuse offline. */
  claimLiveVerifiedShare: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type SharedBriefsRedactedPrivateRetainedDecision =
  | {
      allowed: true;
      code: "SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        shareId: string;
        briefId: string;
        evidenceId: string;
        sharedBriefRedacted: true;
        privateFieldCountInSharedBrief: 0;
        privateEvidenceRetained: true;
        privateEvidenceStore: "private_vault";
        shareVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "SHARED_REDACTED_PRIVATE_RETAINED";
        currentState: "SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED";
        recoveryPath: "KEEP_SHARED_REDACTED_PRIVATE_VAULTED";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SHARE_PACKAGE_REQUIRED"
        | "UNREDACTED_SHARED_BRIEF_REFUSED"
        | "PRIVATE_FIELDS_IN_SHARED_BRIEF_REFUSED"
        | "PRIVATE_EVIDENCE_NOT_RETAINED_REFUSED"
        | "PRIVATE_EVIDENCE_IN_SHARED_EXPORT_REFUSED"
        | "DISCARD_PRIVATE_EVIDENCE_ON_SHARE_REFUSED"
        | "FALSE_LIVE_VERIFIED_SHARE_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        shareId: string | null;
        briefId: string | null;
        evidenceId: string | null;
        sharedBriefRedacted: boolean;
        privateFieldCountInSharedBrief: number;
        privateEvidenceRetained: boolean;
        privateEvidenceStore: PrivateEvidenceRetentionStoreValue | null;
        shareVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_SHARE_PACKAGE"
          | "AWAITING_REDACTED_SHARED_BRIEF"
          | "AWAITING_PRIVATE_EVIDENCE_RETENTION";
        recoveryPath:
          | "PROVIDE_SHARE_PACKAGE"
          | "REDACT_SHARED_BRIEF"
          | "RETAIN_PRIVATE_EVIDENCE_IN_VAULT"
          | "KEEP_PRIVATE_OUT_OF_SHARED_EXPORT";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED_RELATED_CASE_IDS = [
  "T-US-059",
] as const;

function preservedInputCount(
  input: SharedBriefsRedactedPrivateRetainedInput,
): number {
  return (
    (input.shareId.trim() ? 1 : 0) +
    (input.brief.briefId.trim() ? 1 : 0) +
    (input.privateEvidence.evidenceId.trim() ? 1 : 0)
  );
}

/**
 * Evaluate the T-US-059 shared-briefs-redacted / private-evidence-retained
 * path offline. Clean shared brief + vaulted private evidence →
 * SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED; live stays NOT_WIRED.
 */
export function evaluateSharedBriefsRedactedPrivateRetained(
  input: SharedBriefsRedactedPrivateRetainedInput,
): SharedBriefsRedactedPrivateRetainedDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const privateFieldCount = input.brief.privateFieldKinds.length;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_SHARE_PACKAGE"
      | "AWAITING_REDACTED_SHARED_BRIEF"
      | "AWAITING_PRIVATE_EVIDENCE_RETENTION",
    recoveryPath:
      | "PROVIDE_SHARE_PACKAGE"
      | "REDACT_SHARED_BRIEF"
      | "RETAIN_PRIVATE_EVIDENCE_IN_VAULT"
      | "KEEP_PRIVATE_OUT_OF_SHARED_EXPORT",
  ): NonNullable<
    Extract<
      SharedBriefsRedactedPrivateRetainedDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    shareId: input.shareId.trim() || null,
    briefId: input.brief.briefId.trim() || null,
    evidenceId: input.privateEvidence.evidenceId.trim() || null,
    sharedBriefRedacted: input.brief.redacted,
    privateFieldCountInSharedBrief: privateFieldCount,
    privateEvidenceRetained: input.privateEvidence.retained,
    privateEvidenceStore: input.privateEvidence.retentionStore,
    shareVerifiedLive: false,
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
        "Live shared-brief redaction / private-evidence retention provider wiring remains NOT_WIRED — refuse live wiring (T-US-059)",
      ],
    };
  }

  if (input.claimLiveVerifiedShare) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_SHARE_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified shared-brief share claim offline (T-US-059) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptDiscardPrivateEvidenceOnShare) {
    return {
      allowed: false,
      code: "DISCARD_PRIVATE_EVIDENCE_ON_SHARE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRIVATE_EVIDENCE_DISCARD_ON_SHARE_REFUSED",
        "AWAITING_PRIVATE_EVIDENCE_RETENTION",
        "RETAIN_PRIVATE_EVIDENCE_IN_VAULT",
      ),
      reasons: [
        "Private evidence must be retained when a shared brief is exported (T-US-059)",
      ],
    };
  }

  if (input.attemptShareUnredactedBrief) {
    return {
      allowed: false,
      code: "UNREDACTED_SHARED_BRIEF_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "UNREDACTED_SHARED_BRIEF_EXPORT_REFUSED",
        "AWAITING_REDACTED_SHARED_BRIEF",
        "REDACT_SHARED_BRIEF",
      ),
      reasons: [
        "Unredacted shared briefs must not be exported (T-US-059)",
      ],
    };
  }

  if (
    !input.shareId.trim() ||
    !input.brief.briefId.trim() ||
    !input.privateEvidence.evidenceId.trim() ||
    input.brief.audience !== BriefAudience.SHARED
  ) {
    return {
      allowed: false,
      code: "SHARE_PACKAGE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SHARE_PACKAGE_INCOMPLETE",
        "AWAITING_SHARE_PACKAGE",
        "PROVIDE_SHARE_PACKAGE",
      ),
      reasons: [
        "Shared-brief redaction proof requires share id, shared-audience brief, and private evidence sample (T-US-059)",
      ],
    };
  }

  if (!input.brief.redacted) {
    return {
      allowed: false,
      code: "UNREDACTED_SHARED_BRIEF_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "SHARED_BRIEF_NOT_REDACTED",
        "AWAITING_REDACTED_SHARED_BRIEF",
        "REDACT_SHARED_BRIEF",
      ),
      reasons: [
        "Shared briefs must be marked redacted before export (T-US-059)",
      ],
    };
  }

  if (privateFieldCount > 0) {
    return {
      allowed: false,
      code: "PRIVATE_FIELDS_IN_SHARED_BRIEF_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "SHARED_BRIEF_CONTAINS_PRIVATE_FIELDS",
        "AWAITING_REDACTED_SHARED_BRIEF",
        "REDACT_SHARED_BRIEF",
      ),
      reasons: [
        "Shared briefs must not carry private fields (PII, contacts, internal evidence refs, credential hints) (T-US-059)",
      ],
    };
  }

  if (
    input.privateEvidence.retentionStore ===
    PrivateEvidenceRetentionStore.SHARED_EXPORT
  ) {
    return {
      allowed: false,
      code: "PRIVATE_EVIDENCE_IN_SHARED_EXPORT_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRIVATE_EVIDENCE_LEAKED_INTO_SHARED_EXPORT",
        "BLOCKED",
        "KEEP_PRIVATE_OUT_OF_SHARED_EXPORT",
      ),
      reasons: [
        "Private evidence must not be placed in the shared export package (T-US-059)",
      ],
    };
  }

  if (
    !input.privateEvidence.retained ||
    input.privateEvidence.retentionStore ===
      PrivateEvidenceRetentionStore.DISCARDED
  ) {
    return {
      allowed: false,
      code: "PRIVATE_EVIDENCE_NOT_RETAINED_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRIVATE_EVIDENCE_NOT_RETAINED",
        "AWAITING_PRIVATE_EVIDENCE_RETENTION",
        "RETAIN_PRIVATE_EVIDENCE_IN_VAULT",
      ),
      reasons: [
        "Private evidence must remain retained in the private vault after share (T-US-059)",
      ],
    };
  }

  if (
    input.privateEvidence.retentionStore !==
    PrivateEvidenceRetentionStore.PRIVATE_VAULT
  ) {
    return {
      allowed: false,
      code: "PRIVATE_EVIDENCE_NOT_RETAINED_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRIVATE_EVIDENCE_STORE_NOT_VAULT",
        "AWAITING_PRIVATE_EVIDENCE_RETENTION",
        "RETAIN_PRIVATE_EVIDENCE_IN_VAULT",
      ),
      reasons: [
        "Private evidence retention store must be private_vault (T-US-059)",
      ],
    };
  }

  return {
    allowed: true,
    code: "SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED",
    ...base,
    evidence: {
      shareId: input.shareId.trim(),
      briefId: input.brief.briefId.trim(),
      evidenceId: input.privateEvidence.evidenceId.trim(),
      sharedBriefRedacted: true,
      privateFieldCountInSharedBrief: 0,
      privateEvidenceRetained: true,
      privateEvidenceStore: "private_vault",
      shareVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "SHARED_REDACTED_PRIVATE_RETAINED",
      currentState: "SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED",
      recoveryPath: "KEEP_SHARED_REDACTED_PRIVATE_VAULTED",
      preservedInputCount: preserved,
    },
    reasons: [
      "Shared brief redacted with private evidence retained in private vault (T-US-059); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
