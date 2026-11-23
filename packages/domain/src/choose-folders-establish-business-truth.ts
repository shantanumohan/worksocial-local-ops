/**
 * T-F02 — Choose folders and establish business truth (complete F02 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F02 evidence
 * package — registered root IDs + write/read probe, storage-risk checks,
 * ingestion manifest with duplicate detection, business fact records with
 * unresolved conflicts, signed fact revision + impacted assets, and restore
 * rehearsal evidence with secrets excluded. Public claims from unresolved
 * facts must not occur. Incomplete evidence packages and false live-verified
 * claims are refused. Live provider wiring stays NOT_WIRED. Pure domain —
 * no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External
 * effects: NONE.
 *
 * Distinct from open T-US-003 behavior acceptance
 * (`BUSINESS_TRUTH_FOLDERS_READY`) — this records the complete F02 flow
 * evidence package, not the folders-ready happy-path summary alone.
 */

export const FolderRootKind = {
  WORKSPACE: "workspace",
  CONTENT: "content",
  EVIDENCE: "evidence",
  BACKUP: "backup",
  DATABASE: "database",
  SECRETS: "secrets",
} as const;

export type FolderRootKindValue =
  (typeof FolderRootKind)[keyof typeof FolderRootKind];

export const REQUIRED_FOLDER_ROOT_KINDS = [
  FolderRootKind.WORKSPACE,
  FolderRootKind.CONTENT,
  FolderRootKind.EVIDENCE,
  FolderRootKind.BACKUP,
  FolderRootKind.DATABASE,
  FolderRootKind.SECRETS,
] as const;

export const CriticalPilotClaimCategory = {
  PRICES: "prices",
  CAPACITY: "capacity",
  HOURS: "hours",
  AVAILABILITY: "availability",
} as const;

export type CriticalPilotClaimCategoryValue =
  (typeof CriticalPilotClaimCategory)[keyof typeof CriticalPilotClaimCategory];

export const REQUIRED_CRITICAL_PILOT_CLAIM_CATEGORIES = [
  CriticalPilotClaimCategory.PRICES,
  CriticalPilotClaimCategory.CAPACITY,
  CriticalPilotClaimCategory.HOURS,
  CriticalPilotClaimCategory.AVAILABILITY,
] as const;

export type RegisteredFolderRoot = {
  rootId: string;
  kind: FolderRootKindValue;
  canonicalPath: string;
  /** True when path matched a consumer sync pattern (OneDrive-style). */
  syncPath: boolean;
  writeProbeOk: boolean;
  readProbeOk: boolean;
};

export type StorageRiskCheck = {
  rootId: string;
  kind: FolderRootKindValue;
  syncPath: boolean;
  /** Durable roots (database/secrets) must be off sync. */
  durableOffSync: boolean;
  riskAccepted: boolean;
};

export type IngestionManifestEntry = {
  entryId: string;
  sourceRef: string;
  owner: string;
  rights: string;
  checksum: string;
  materialKind: "description" | "venue_media" | "operating_rules";
  duplicateOfEntryId: string | null;
};

export type BusinessFactRecord = {
  factId: string;
  category: CriticalPilotClaimCategoryValue;
  statement: string;
  owner: string;
  sourceRef: string;
  /** Unresolved conflicts stay blocked — never become public claims. */
  unresolvedConflict: boolean;
};

export type SignedFactRevision = {
  revisionId: string;
  signedBy: string;
  signedAtIso: string;
  impactedAssetIds: readonly string[];
  /** Signature is an opaque fixture token — not a live cryptographic proof. */
  signatureToken: string;
};

export type RestoreRehearsalRecord = {
  rehearsalId: string;
  completedAtIso: string;
  exportRestoreMatched: boolean;
  secretsExcluded: boolean;
  /** Opaque broker refs only — never raw secrets. */
  secretBrokerRefs: readonly string[];
};

export type ChooseFoldersEstablishBusinessTruthInput = {
  packageId: string;
  roots: readonly RegisteredFolderRoot[];
  storageRiskChecks: readonly StorageRiskCheck[];
  ingestionManifest: readonly IngestionManifestEntry[];
  /** Observed duplicate-detection pass over the ingestion manifest. */
  duplicateDetectionCompleted: boolean;
  facts: readonly BusinessFactRecord[];
  signedRevision: SignedFactRevision;
  restoreRehearsal: RestoreRehearsalRecord;
  /** Raw secret material that must NOT appear in restore evidence. */
  secretMaterial?: string;
  /** Attempt to publish an unresolved conflict as a public claim — must refuse. */
  attemptPublicClaimFromUnresolved: boolean;
  /** Claim the F02 path is live-verified — must refuse offline. */
  claimLiveVerifiedBusinessTruth: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type ChooseFoldersEstablishBusinessTruthDecision =
  | {
      allowed: true;
      code: "CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        registeredRootIds: string[];
        writeReadProbePassed: true;
        storageRiskCheckCount: number;
        durableRootsOffSync: true;
        ingestionEntryCount: number;
        duplicateDetectionCompleted: true;
        duplicateEntryCount: number;
        factRecordCount: number;
        unresolvedConflictCount: number;
        everyCriticalClaimHasOwnerAndSource: true;
        signedRevisionId: string;
        impactedAssetCount: number;
        restoreRehearsalId: string;
        secretsExcluded: true;
        publicClaimsFromUnresolved: false;
        businessTruthVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F02_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "BUSINESS_TRUTH_FOLDERS_RECORDED";
        recoveryPath: "KEEP_UNRESOLVED_BLOCKED_NO_PUBLIC_CLAIMS";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "REGISTERED_ROOTS_REQUIRED"
        | "WRITE_READ_PROBE_REQUIRED"
        | "STORAGE_RISK_CHECKS_REQUIRED"
        | "DURABLE_ON_SYNC_PATH_REFUSED"
        | "INGESTION_MANIFEST_REQUIRED"
        | "DUPLICATE_DETECTION_REQUIRED"
        | "BUSINESS_FACT_RECORDS_REQUIRED"
        | "CRITICAL_CLAIM_OWNER_SOURCE_REQUIRED"
        | "SIGNED_FACT_REVISION_REQUIRED"
        | "RESTORE_EVIDENCE_SECRETS_EXCLUDED_REQUIRED"
        | "SECRET_MATERIAL_IN_EVIDENCE_REFUSED"
        | "PUBLIC_CLAIM_FROM_UNRESOLVED_REFUSED"
        | "FALSE_LIVE_VERIFIED_BUSINESS_TRUTH_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        registeredRootIds: string[];
        writeReadProbePassed: boolean;
        storageRiskCheckCount: number;
        durableRootsOffSync: boolean;
        ingestionEntryCount: number;
        duplicateDetectionCompleted: boolean;
        duplicateEntryCount: number;
        factRecordCount: number;
        unresolvedConflictCount: number;
        everyCriticalClaimHasOwnerAndSource: boolean;
        signedRevisionId: string | null;
        impactedAssetCount: number;
        restoreRehearsalId: string | null;
        secretsExcluded: boolean;
        publicClaimsFromUnresolved: boolean;
        businessTruthVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_REGISTERED_ROOTS"
          | "AWAITING_WRITE_READ_PROBE"
          | "AWAITING_STORAGE_RISK_CHECKS"
          | "AWAITING_INGESTION_MANIFEST"
          | "AWAITING_DUPLICATE_DETECTION"
          | "AWAITING_BUSINESS_FACTS"
          | "AWAITING_SIGNED_REVISION"
          | "AWAITING_RESTORE_EVIDENCE";
        recoveryPath:
          | "REGISTER_REQUIRED_ROOTS"
          | "PASS_WRITE_READ_PROBE"
          | "COMPLETE_STORAGE_RISK_CHECKS"
          | "MOVE_DURABLE_OFF_SYNC"
          | "RECORD_INGESTION_MANIFEST"
          | "RUN_DUPLICATE_DETECTION"
          | "MAP_CRITICAL_CLAIMS_WITH_OWNER_SOURCE"
          | "SIGN_FACT_REVISION_WITH_IMPACTED_ASSETS"
          | "COMPLETE_RESTORE_WITH_SECRETS_EXCLUDED"
          | "KEEP_UNRESOLVED_BLOCKED_NO_PUBLIC_CLAIMS";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_RELATED_CASE_IDS = [
  "T-F02",
] as const;

function preservedInputCount(
  input: ChooseFoldersEstablishBusinessTruthInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.roots.length > 0 ? 1 : 0) +
    (input.storageRiskChecks.length > 0 ? 1 : 0) +
    (input.ingestionManifest.length > 0 ? 1 : 0) +
    (input.facts.length > 0 ? 1 : 0) +
    (input.signedRevision.revisionId.trim() ? 1 : 0) +
    (input.restoreRehearsal.rehearsalId.trim() ? 1 : 0)
  );
}

function writeReadProbePassed(roots: readonly RegisteredFolderRoot[]): boolean {
  return (
    roots.length > 0 &&
    roots.every(
      (r) =>
        r.rootId.trim() &&
        r.canonicalPath.trim() &&
        r.writeProbeOk &&
        r.readProbeOk,
    )
  );
}

function requiredRootsCovered(roots: readonly RegisteredFolderRoot[]): boolean {
  const kinds = new Set(roots.map((r) => r.kind));
  return REQUIRED_FOLDER_ROOT_KINDS.every((k) => kinds.has(k));
}

function durableRootsOffSync(roots: readonly RegisteredFolderRoot[]): boolean {
  return roots
    .filter(
      (r) =>
        r.kind === FolderRootKind.DATABASE || r.kind === FolderRootKind.SECRETS,
    )
    .every((r) => !r.syncPath);
}

function storageRiskChecksComplete(
  roots: readonly RegisteredFolderRoot[],
  checks: readonly StorageRiskCheck[],
): boolean {
  if (checks.length === 0) return false;
  const byRoot = new Map(checks.map((c) => [c.rootId, c]));
  return roots.every((r) => {
    const check = byRoot.get(r.rootId);
    if (!check) return false;
    if (check.kind !== r.kind) return false;
    if (check.syncPath !== r.syncPath) return false;
    const durable =
      r.kind === FolderRootKind.DATABASE || r.kind === FolderRootKind.SECRETS;
    if (durable && !check.durableOffSync) return false;
    return check.riskAccepted;
  });
}

function ingestionManifestValid(
  entries: readonly IngestionManifestEntry[],
): boolean {
  if (entries.length === 0) return false;
  return entries.every(
    (e) =>
      e.entryId.trim() &&
      e.sourceRef.trim() &&
      e.owner.trim() &&
      e.rights.trim() &&
      e.checksum.trim(),
  );
}

function duplicateEntryCount(
  entries: readonly IngestionManifestEntry[],
): number {
  return entries.filter((e) => e.duplicateOfEntryId !== null).length;
}

function everyCriticalClaimHasOwnerAndSource(
  facts: readonly BusinessFactRecord[],
): boolean {
  const byCategory = new Map<CriticalPilotClaimCategoryValue, BusinessFactRecord>();
  for (const f of facts) {
    if (
      !f.factId.trim() ||
      !f.statement.trim() ||
      !f.owner.trim() ||
      !f.sourceRef.trim()
    ) {
      return false;
    }
    byCategory.set(f.category, f);
  }
  return REQUIRED_CRITICAL_PILOT_CLAIM_CATEGORIES.every((c) =>
    byCategory.has(c),
  );
}

/**
 * Evaluate the T-F02 choose-folders-establish-business-truth path offline.
 * Complete F02 evidence package → CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and public claims from unresolved refused.
 */
export function evaluateChooseFoldersEstablishBusinessTruth(
  input: ChooseFoldersEstablishBusinessTruthInput,
): ChooseFoldersEstablishBusinessTruthDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const probeOk = writeReadProbePassed(input.roots);
  const rootsOk = requiredRootsCovered(input.roots);
  const durableOk = durableRootsOffSync(input.roots);
  const riskOk = storageRiskChecksComplete(
    input.roots,
    input.storageRiskChecks,
  );
  const ingestOk = ingestionManifestValid(input.ingestionManifest);
  const dupCount = duplicateEntryCount(input.ingestionManifest);
  const claimsOk = everyCriticalClaimHasOwnerAndSource(input.facts);
  const unresolvedCount = input.facts.filter((f) => f.unresolvedConflict).length;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_REGISTERED_ROOTS"
      | "AWAITING_WRITE_READ_PROBE"
      | "AWAITING_STORAGE_RISK_CHECKS"
      | "AWAITING_INGESTION_MANIFEST"
      | "AWAITING_DUPLICATE_DETECTION"
      | "AWAITING_BUSINESS_FACTS"
      | "AWAITING_SIGNED_REVISION"
      | "AWAITING_RESTORE_EVIDENCE",
    recoveryPath:
      | "REGISTER_REQUIRED_ROOTS"
      | "PASS_WRITE_READ_PROBE"
      | "COMPLETE_STORAGE_RISK_CHECKS"
      | "MOVE_DURABLE_OFF_SYNC"
      | "RECORD_INGESTION_MANIFEST"
      | "RUN_DUPLICATE_DETECTION"
      | "MAP_CRITICAL_CLAIMS_WITH_OWNER_SOURCE"
      | "SIGN_FACT_REVISION_WITH_IMPACTED_ASSETS"
      | "COMPLETE_RESTORE_WITH_SECRETS_EXCLUDED"
      | "KEEP_UNRESOLVED_BLOCKED_NO_PUBLIC_CLAIMS",
  ): NonNullable<
    Extract<
      ChooseFoldersEstablishBusinessTruthDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    registeredRootIds: input.roots.map((r) => r.rootId).filter((id) => id.trim()),
    writeReadProbePassed: probeOk,
    storageRiskCheckCount: input.storageRiskChecks.length,
    durableRootsOffSync: durableOk,
    ingestionEntryCount: input.ingestionManifest.length,
    duplicateDetectionCompleted: input.duplicateDetectionCompleted,
    duplicateEntryCount: dupCount,
    factRecordCount: input.facts.length,
    unresolvedConflictCount: unresolvedCount,
    everyCriticalClaimHasOwnerAndSource: claimsOk,
    signedRevisionId: input.signedRevision.revisionId.trim() || null,
    impactedAssetCount: input.signedRevision.impactedAssetIds.filter((a) =>
      a.trim(),
    ).length,
    restoreRehearsalId: input.restoreRehearsal.rehearsalId.trim() || null,
    secretsExcluded: input.restoreRehearsal.secretsExcluded,
    publicClaimsFromUnresolved: input.attemptPublicClaimFromUnresolved,
    businessTruthVerifiedLive: false,
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
        "Live choose-folders-establish-business-truth provider wiring remains NOT_WIRED — refuse live wiring (T-F02)",
      ],
    };
  }

  if (input.claimLiveVerifiedBusinessTruth) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_BUSINESS_TRUTH_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified business-truth claim offline (T-F02) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptPublicClaimFromUnresolved) {
    return {
      allowed: false,
      code: "PUBLIC_CLAIM_FROM_UNRESOLVED_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PUBLIC_CLAIM_FROM_UNRESOLVED_REFUSED",
        "BLOCKED",
        "KEEP_UNRESOLVED_BLOCKED_NO_PUBLIC_CLAIMS",
      ),
      reasons: [
        "Unresolved conflicts must stay blocked — never become public claims (T-F02)",
      ],
    };
  }

  if (!input.packageId.trim() || !rootsOk) {
    return {
      allowed: false,
      code: "REGISTERED_ROOTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "REGISTERED_ROOTS_INCOMPLETE",
        "AWAITING_REGISTERED_ROOTS",
        "REGISTER_REQUIRED_ROOTS",
      ),
      reasons: [
        "F02 requires registered workspace/content/evidence/backup/database/secrets roots (T-F02)",
      ],
    };
  }

  if (!probeOk) {
    return {
      allowed: false,
      code: "WRITE_READ_PROBE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "WRITE_READ_PROBE_FAILED",
        "AWAITING_WRITE_READ_PROBE",
        "PASS_WRITE_READ_PROBE",
      ),
      reasons: [
        "F02 requires write/read probes against every registered root (T-F02)",
      ],
    };
  }

  if (!durableOk) {
    return {
      allowed: false,
      code: "DURABLE_ON_SYNC_PATH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "DURABLE_ROOT_ON_SYNC_PATH",
        "AWAITING_STORAGE_RISK_CHECKS",
        "MOVE_DURABLE_OFF_SYNC",
      ),
      reasons: [
        "Database and secrets roots must stay outside ordinary sync/export folders (T-F02)",
      ],
    };
  }

  if (!riskOk) {
    return {
      allowed: false,
      code: "STORAGE_RISK_CHECKS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "STORAGE_RISK_CHECKS_INCOMPLETE",
        "AWAITING_STORAGE_RISK_CHECKS",
        "COMPLETE_STORAGE_RISK_CHECKS",
      ),
      reasons: [
        "F02 requires storage-risk checks covering every registered root (T-F02)",
      ],
    };
  }

  if (!ingestOk) {
    return {
      allowed: false,
      code: "INGESTION_MANIFEST_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INGESTION_MANIFEST_INCOMPLETE",
        "AWAITING_INGESTION_MANIFEST",
        "RECORD_INGESTION_MANIFEST",
      ),
      reasons: [
        "F02 requires an ingestion manifest with source, owner, rights, and checksum (T-F02)",
      ],
    };
  }

  if (!input.duplicateDetectionCompleted) {
    return {
      allowed: false,
      code: "DUPLICATE_DETECTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DUPLICATE_DETECTION_MISSING",
        "AWAITING_DUPLICATE_DETECTION",
        "RUN_DUPLICATE_DETECTION",
      ),
      reasons: [
        "F02 requires duplicate detection over the ingestion manifest (T-F02)",
      ],
    };
  }

  if (input.facts.length === 0 || !claimsOk) {
    return {
      allowed: false,
      code:
        input.facts.length === 0
          ? "BUSINESS_FACT_RECORDS_REQUIRED"
          : "CRITICAL_CLAIM_OWNER_SOURCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        input.facts.length === 0
          ? "BUSINESS_FACTS_MISSING"
          : "CRITICAL_CLAIM_OWNER_SOURCE_INCOMPLETE",
        "AWAITING_BUSINESS_FACTS",
        "MAP_CRITICAL_CLAIMS_WITH_OWNER_SOURCE",
      ),
      reasons: [
        input.facts.length === 0
          ? "F02 requires business fact records for critical pilot claims (T-F02)"
          : "Every critical pilot claim (prices/capacity/hours/availability) needs owner and source (T-F02)",
      ],
    };
  }

  const rev = input.signedRevision;
  if (
    !rev.revisionId.trim() ||
    !rev.signedBy.trim() ||
    !rev.signedAtIso.trim() ||
    !rev.signatureToken.trim() ||
    rev.impactedAssetIds.filter((a) => a.trim()).length === 0
  ) {
    return {
      allowed: false,
      code: "SIGNED_FACT_REVISION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SIGNED_FACT_REVISION_INCOMPLETE",
        "AWAITING_SIGNED_REVISION",
        "SIGN_FACT_REVISION_WITH_IMPACTED_ASSETS",
      ),
      reasons: [
        "F02 requires a signed fact revision with impacted assets (T-F02)",
      ],
    };
  }

  const restore = input.restoreRehearsal;
  if (
    !restore.rehearsalId.trim() ||
    !restore.completedAtIso.trim() ||
    !restore.exportRestoreMatched ||
    !restore.secretsExcluded ||
    restore.secretBrokerRefs.filter((r) => r.trim()).length === 0
  ) {
    return {
      allowed: false,
      code: "RESTORE_EVIDENCE_SECRETS_EXCLUDED_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "RESTORE_EVIDENCE_INCOMPLETE",
        "AWAITING_RESTORE_EVIDENCE",
        "COMPLETE_RESTORE_WITH_SECRETS_EXCLUDED",
      ),
      reasons: [
        "F02 requires restore rehearsal evidence with secrets excluded (T-F02)",
      ],
    };
  }

  const restoreSnapshot = {
    rehearsalId: restore.rehearsalId,
    secretBrokerRefs: restore.secretBrokerRefs,
    secretsExcluded: restore.secretsExcluded,
    exportRestoreMatched: restore.exportRestoreMatched,
  };
  const secret = (input.secretMaterial ?? "").trim();
  if (secret.length > 0 && JSON.stringify(restoreSnapshot).includes(secret)) {
    return {
      allowed: false,
      code: "SECRET_MATERIAL_IN_EVIDENCE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "SECRET_MATERIAL_IN_RESTORE_EVIDENCE",
        "AWAITING_RESTORE_EVIDENCE",
        "COMPLETE_RESTORE_WITH_SECRETS_EXCLUDED",
      ),
      reasons: [
        "Restore evidence must exclude raw secret material (T-F02)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      registeredRootIds: input.roots.map((r) => r.rootId.trim()),
      writeReadProbePassed: true,
      storageRiskCheckCount: input.storageRiskChecks.length,
      durableRootsOffSync: true,
      ingestionEntryCount: input.ingestionManifest.length,
      duplicateDetectionCompleted: true,
      duplicateEntryCount: dupCount,
      factRecordCount: input.facts.length,
      unresolvedConflictCount: unresolvedCount,
      everyCriticalClaimHasOwnerAndSource: true,
      signedRevisionId: rev.revisionId.trim(),
      impactedAssetCount: rev.impactedAssetIds.filter((a) => a.trim()).length,
      restoreRehearsalId: restore.rehearsalId.trim(),
      secretsExcluded: true,
      publicClaimsFromUnresolved: false,
      businessTruthVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F02_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "BUSINESS_TRUTH_FOLDERS_RECORDED",
      recoveryPath: "KEEP_UNRESOLVED_BLOCKED_NO_PUBLIC_CLAIMS",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F02 evidence package recorded (registered roots + write/read probe, storage-risk checks, ingestion manifest + duplicate detection, business facts + unresolved conflicts, signed revision + impacted assets, restore with secrets excluded); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
