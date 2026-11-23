/**
 * T-US-003 — Choose folders and establish business truth.
 *
 * Happy-path gate for F02/SC-20: artifact folders registered, durable
 * secrets/database off sync paths, owner-sourced facts with evidence (hours,
 * capacity, prices, availability), and an export/restore rehearsal whose
 * evidence excludes secrets. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import {
  CollectionMethod,
  SupportLabel,
  registerFact,
  type FactRecord,
  type SupportLabelValue,
} from "./knowledge.js";

/** Storage kinds relevant to F02 folder selection. */
export const BusinessTruthArtifactKind = {
  SOURCE: "source",
  WORKING: "working",
  CONTENT: "content",
  REPORTS: "reports",
  ENCRYPTED_BACKUP: "encrypted_backup",
} as const;

export type BusinessTruthArtifactKindValue =
  (typeof BusinessTruthArtifactKind)[keyof typeof BusinessTruthArtifactKind];

export const BusinessTruthDurableKind = {
  DATABASE: "database",
  TEMPORAL: "temporal",
  SECRETS: "secrets",
} as const;

export type BusinessTruthDurableKindValue =
  (typeof BusinessTruthDurableKind)[keyof typeof BusinessTruthDurableKind];

/** Critical pilot claim categories from F02 (prices, capacity, hours, availability). */
export const BusinessTruthClaimCategory = {
  HOURS: "hours",
  CAPACITY: "capacity",
  PRICES: "prices",
  AVAILABILITY: "availability",
} as const;

export type BusinessTruthClaimCategoryValue =
  (typeof BusinessTruthClaimCategory)[keyof typeof BusinessTruthClaimCategory];

export const REQUIRED_BUSINESS_TRUTH_CLAIM_CATEGORIES: readonly BusinessTruthClaimCategoryValue[] =
  [
    BusinessTruthClaimCategory.HOURS,
    BusinessTruthClaimCategory.CAPACITY,
    BusinessTruthClaimCategory.PRICES,
    BusinessTruthClaimCategory.AVAILABILITY,
  ];

export type RegisteredRootSummary = {
  id: string;
  kind: string;
  path: string;
  /** True when path matched a consumer sync pattern (OneDrive-style). */
  syncPath: boolean;
};

export type BusinessTruthFactInput = {
  factId: string;
  statement: string;
  owner: string;
  sourceSystem: string;
  sourceRef: string;
  category: BusinessTruthClaimCategoryValue;
  requestedLabel?: SupportLabelValue;
  conflictNotes?: string[];
  /** When true, leave as unresolved/blocked (HYPOTHESIS) rather than SUPPORTED. */
  leaveUnresolved?: boolean;
};

export type RestoreRehearsalEvidence = {
  rehearsalId: string;
  createdAtIso: string;
  registeredRootIds: string[];
  storageRiskChecks: Array<{
    kind: string;
    syncPath: boolean;
    durableOffSync: boolean;
  }>;
  factRevisionIds: string[];
  usableFactIds: string[];
  blockedUnresolvedFactIds: string[];
  /** Category → factId mapping for required pilot claims. */
  claimCategoryMap: Record<BusinessTruthClaimCategoryValue, string>;
  /** Opaque broker refs only — never raw secrets. */
  secretBrokerRefs: string[];
  /** Owner labels retained for every claim (usable + blocked). */
  factOwners: Record<string, string>;
  /** Source refs retained for every claim (usable + blocked). */
  factSourceRefs: Record<string, string>;
  secretsExcluded: true;
  secretsExported: false;
  writeReadProbePassed: boolean;
  exportRestoreMatched: boolean;
  externalEffects: "NONE";
  fixtureOnly: true;
};

export type BusinessTruthFoldersDecision =
  | {
      ok: true;
      code: "BUSINESS_TRUTH_FOLDERS_READY";
      reason: string;
      usableFacts: FactRecord[];
      blockedUnresolvedFacts: FactRecord[];
      restoreEvidence: RestoreRehearsalEvidence;
      externalEffects: "NONE";
    }
  | {
      ok: false;
      code:
        | "MISSING_ARTIFACT_ROOT"
        | "DURABLE_ON_SYNC_PATH"
        | "NO_USABLE_FACTS"
        | "MISSING_CLAIM_CATEGORY"
        | "SECRET_MATERIAL_IN_EVIDENCE"
        | "RESTORE_REHEARSAL_FAILED"
        | "INVALID_INPUT";
      reason: string;
      externalEffects: "NONE";
    };

const REQUIRED_ARTIFACT_KINDS: readonly BusinessTruthArtifactKindValue[] = [
  BusinessTruthArtifactKind.CONTENT,
  BusinessTruthArtifactKind.REPORTS,
  BusinessTruthArtifactKind.ENCRYPTED_BACKUP,
];

const REQUIRED_DURABLE_KINDS: readonly BusinessTruthDurableKindValue[] = [
  BusinessTruthDurableKind.DATABASE,
  BusinessTruthDurableKind.SECRETS,
];

/**
 * Build restore rehearsal evidence. Any raw secret material supplied for the
 * rehearsal must be excluded from the returned artifact (secretsExcluded).
 */
export function buildRestoreRehearsalEvidence(input: {
  rehearsalId: string;
  nowIso: string;
  roots: readonly RegisteredRootSummary[];
  usableFacts: readonly FactRecord[];
  blockedUnresolvedFacts: readonly FactRecord[];
  claimCategoryMap: Record<BusinessTruthClaimCategoryValue, string>;
  factOwners: Record<string, string>;
  factSourceRefs: Record<string, string>;
  /** Opaque broker reference for the secrets root — never a raw secret. */
  secretBrokerRef: string;
  /** Raw secret material that must NOT appear in evidence. */
  secretMaterial?: string;
  writeReadProbePassed: boolean;
  exportRestoreMatched: boolean;
}):
  | RestoreRehearsalEvidence
  | {
      ok: false;
      code: "SECRET_MATERIAL_IN_EVIDENCE" | "RESTORE_REHEARSAL_FAILED";
      reason: string;
    } {
  if (!input.writeReadProbePassed || !input.exportRestoreMatched) {
    return {
      ok: false,
      code: "RESTORE_REHEARSAL_FAILED",
      reason:
        "Export/restore rehearsal requires a passed write/read probe and matching restored evidence",
    };
  }

  const storageRiskChecks = input.roots.map((root) => {
    const durable = (REQUIRED_DURABLE_KINDS as readonly string[]).includes(
      root.kind,
    );
    return {
      kind: root.kind,
      syncPath: root.syncPath,
      durableOffSync: durable ? !root.syncPath : true,
    };
  });

  const evidence: RestoreRehearsalEvidence = {
    rehearsalId: input.rehearsalId,
    createdAtIso: input.nowIso,
    registeredRootIds: input.roots.map((r) => r.id),
    storageRiskChecks,
    factRevisionIds: [
      ...input.usableFacts.map((f) => f.factId),
      ...input.blockedUnresolvedFacts.map((f) => f.factId),
    ],
    usableFactIds: input.usableFacts.map((f) => f.factId),
    blockedUnresolvedFactIds: input.blockedUnresolvedFacts.map((f) => f.factId),
    claimCategoryMap: { ...input.claimCategoryMap },
    secretBrokerRefs: [input.secretBrokerRef],
    factOwners: { ...input.factOwners },
    factSourceRefs: { ...input.factSourceRefs },
    secretsExcluded: true,
    secretsExported: false,
    writeReadProbePassed: true,
    exportRestoreMatched: true,
    externalEffects: "NONE",
    fixtureOnly: true,
  };

  const serialized = JSON.stringify(evidence);
  const secret = (input.secretMaterial ?? "").trim();
  if (secret.length > 0 && serialized.includes(secret)) {
    return {
      ok: false,
      code: "SECRET_MATERIAL_IN_EVIDENCE",
      reason: "Restore evidence must exclude raw secret material",
    };
  }

  return evidence;
}

/**
 * Evaluate F02 happy path: required folders registered with durable roots off
 * sync, all critical claim categories mapped with owner/source, restore
 * rehearsal observed (write/read + export/restore match), secrets excluded.
 */
export function evaluateBusinessTruthFoldersSetup(input: {
  roots: readonly RegisteredRootSummary[];
  facts: readonly BusinessTruthFactInput[];
  secretBrokerRef: string;
  secretMaterial?: string;
  rehearsalId: string;
  nowIso: string;
  /** Observed write/read probe against registered folders. */
  writeReadProbePassed: boolean;
  /** Observed export → restore payload equality (secrets excluded). */
  exportRestoreMatched: boolean;
}): BusinessTruthFoldersDecision {
  if (!input.secretBrokerRef.trim()) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      reason: "secretBrokerRef required (opaque; never a raw secret)",
      externalEffects: "NONE",
    };
  }

  const byKind = new Map(input.roots.map((r) => [r.kind, r]));

  for (const kind of REQUIRED_ARTIFACT_KINDS) {
    if (!byKind.has(kind)) {
      return {
        ok: false,
        code: "MISSING_ARTIFACT_ROOT",
        reason: `Required artifact root '${kind}' is not registered`,
        externalEffects: "NONE",
      };
    }
  }

  for (const kind of REQUIRED_DURABLE_KINDS) {
    const root = byKind.get(kind);
    if (!root) {
      return {
        ok: false,
        code: "MISSING_ARTIFACT_ROOT",
        reason: `Required durable root '${kind}' is not registered`,
        externalEffects: "NONE",
      };
    }
    if (root.syncPath) {
      return {
        ok: false,
        code: "DURABLE_ON_SYNC_PATH",
        reason: `Durable root '${kind}' must not live under a consumer sync path`,
        externalEffects: "NONE",
      };
    }
  }

  const usableFacts: FactRecord[] = [];
  const blockedUnresolvedFacts: FactRecord[] = [];
  const claimCategoryMap = {} as Record<
    BusinessTruthClaimCategoryValue,
    string
  >;
  const factOwners: Record<string, string> = {};
  const factSourceRefs: Record<string, string> = {};
  const seenCategories = new Set<BusinessTruthClaimCategoryValue>();

  for (const factInput of input.facts) {
    if (!factInput.owner.trim() || !factInput.sourceRef.trim()) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        reason: `Fact ${factInput.factId} requires owner and sourceRef`,
        externalEffects: "NONE",
      };
    }

    factOwners[factInput.factId] = factInput.owner;
    factSourceRefs[factInput.factId] = factInput.sourceRef;
    seenCategories.add(factInput.category);
    claimCategoryMap[factInput.category] = factInput.factId;

    if (factInput.leaveUnresolved) {
      // Keep owner + source evidence; label HYPOTHESIS (blocked until resolved).
      const result = registerFact({
        factId: factInput.factId,
        statement: factInput.statement,
        requestedLabel: SupportLabel.HYPOTHESIS,
        evidenceLinks: [
          {
            evidenceId: `ev-${factInput.factId}`,
            sourceRef: factInput.sourceRef,
            collectionMethod: CollectionMethod.OWNER_DECLARED,
            summary: `Owner ${factInput.owner} conflict via ${factInput.sourceSystem}`,
            observedAtIso: input.nowIso,
            fixtureOnly: true,
          },
        ],
        provenance: {
          registeredBy: "owner",
          collectionMethod: CollectionMethod.OWNER_DECLARED,
          sourceSystem: factInput.sourceSystem,
          observedAtIso: input.nowIso,
          modelGenerated: false,
        },
        conflictNotes: factInput.conflictNotes ?? [
          "Unresolved conflict left blocked until source-backed resolution",
        ],
        createdAtIso: input.nowIso,
      });
      if (result.ok) {
        blockedUnresolvedFacts.push(result.fact);
      }
      continue;
    }

    const result = registerFact(
      {
        factId: factInput.factId,
        statement: factInput.statement,
        requestedLabel: factInput.requestedLabel ?? SupportLabel.SUPPORTED,
        evidenceLinks: [
          {
            evidenceId: `ev-${factInput.factId}`,
            sourceRef: factInput.sourceRef,
            collectionMethod: CollectionMethod.OWNER_DECLARED,
            summary: `Owner ${factInput.owner} declared via ${factInput.sourceSystem}`,
            observedAtIso: input.nowIso,
            fixtureOnly: true,
          },
        ],
        provenance: {
          registeredBy: "owner",
          collectionMethod: CollectionMethod.OWNER_DECLARED,
          sourceSystem: factInput.sourceSystem,
          observedAtIso: input.nowIso,
          modelGenerated: false,
        },
        conflictNotes: factInput.conflictNotes ?? [],
        createdAtIso: input.nowIso,
      },
      { strictSupported: true },
    );

    if (!result.ok) {
      return {
        ok: false,
        code: "NO_USABLE_FACTS",
        reason: `Fact ${factInput.factId} failed registration: ${result.reasons.join("; ")}`,
        externalEffects: "NONE",
      };
    }
    if (result.fact.supportLabel === SupportLabel.SUPPORTED) {
      usableFacts.push(result.fact);
    } else {
      blockedUnresolvedFacts.push(result.fact);
    }
  }

  for (const category of REQUIRED_BUSINESS_TRUTH_CLAIM_CATEGORIES) {
    if (!seenCategories.has(category)) {
      return {
        ok: false,
        code: "MISSING_CLAIM_CATEGORY",
        reason: `Required claim category '${category}' is not mapped`,
        externalEffects: "NONE",
      };
    }
  }

  if (usableFacts.length === 0) {
    return {
      ok: false,
      code: "NO_USABLE_FACTS",
      reason: "At least one owner-sourced SUPPORTED fact is required",
      externalEffects: "NONE",
    };
  }

  const restore = buildRestoreRehearsalEvidence({
    rehearsalId: input.rehearsalId,
    nowIso: input.nowIso,
    roots: input.roots,
    usableFacts,
    blockedUnresolvedFacts,
    claimCategoryMap,
    factOwners,
    factSourceRefs,
    secretBrokerRef: input.secretBrokerRef,
    ...(input.secretMaterial !== undefined
      ? { secretMaterial: input.secretMaterial }
      : {}),
    writeReadProbePassed: input.writeReadProbePassed,
    exportRestoreMatched: input.exportRestoreMatched,
  });

  if ("ok" in restore && restore.ok === false) {
    return {
      ok: false,
      code: restore.code,
      reason: restore.reason,
      externalEffects: "NONE",
    };
  }

  return {
    ok: true,
    code: "BUSINESS_TRUTH_FOLDERS_READY",
    reason:
      "Artifact folders registered; durable secrets/database off sync; hours/capacity/prices/availability mapped with owner/source; restore rehearsal matched; secrets excluded",
    usableFacts,
    blockedUnresolvedFacts,
    restoreEvidence: restore as RestoreRehearsalEvidence,
    externalEffects: "NONE",
  };
}
