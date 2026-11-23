/**
 * Fixture proof for T-F02 — Choose folders and establish business truth.
 * Complete F02 evidence package: registered roots + write/read probe,
 * storage-risk checks, ingestion manifest + duplicate detection, business
 * facts + unresolved conflicts, signed revision + impacted assets, restore
 * with secrets excluded; public claims from unresolved refused; live
 * NOT_WIRED. Distinct from open T-US-003 folders-ready happy-path summary.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  CriticalPilotClaimCategory,
  FolderRootKind,
  SoakProofKind,
  evaluateChooseFoldersEstablishBusinessTruth,
  type ChooseFoldersEstablishBusinessTruthInput,
  type RegisteredFolderRoot,
  type SoakProofRecord,
  type StorageRiskCheck,
} from "@worksocial/domain";

function roots(): RegisteredFolderRoot[] {
  return [
    {
      rootId: "root-ws",
      kind: FolderRootKind.WORKSPACE,
      canonicalPath: "/ws",
      syncPath: false,
      writeProbeOk: true,
      readProbeOk: true,
    },
    {
      rootId: "root-content",
      kind: FolderRootKind.CONTENT,
      canonicalPath: "/content",
      syncPath: false,
      writeProbeOk: true,
      readProbeOk: true,
    },
    {
      rootId: "root-evidence",
      kind: FolderRootKind.EVIDENCE,
      canonicalPath: "/evidence",
      syncPath: false,
      writeProbeOk: true,
      readProbeOk: true,
    },
    {
      rootId: "root-backup",
      kind: FolderRootKind.BACKUP,
      canonicalPath: "/backup",
      syncPath: false,
      writeProbeOk: true,
      readProbeOk: true,
    },
    {
      rootId: "root-db",
      kind: FolderRootKind.DATABASE,
      canonicalPath: "/var/db",
      syncPath: false,
      writeProbeOk: true,
      readProbeOk: true,
    },
    {
      rootId: "root-secrets",
      kind: FolderRootKind.SECRETS,
      canonicalPath: "/var/secrets",
      syncPath: false,
      writeProbeOk: true,
      readProbeOk: true,
    },
  ];
}

function riskChecks(rs: RegisteredFolderRoot[]): StorageRiskCheck[] {
  return rs.map((r) => ({
    rootId: r.rootId,
    kind: r.kind,
    syncPath: r.syncPath,
    durableOffSync:
      r.kind === FolderRootKind.DATABASE || r.kind === FolderRootKind.SECRETS
        ? !r.syncPath
        : true,
    riskAccepted: true,
  }));
}

function baseInput(
  overrides: Partial<ChooseFoldersEstablishBusinessTruthInput> = {},
): ChooseFoldersEstablishBusinessTruthInput {
  const rs = roots();
  return {
    packageId: "pkg-f02-soak",
    roots: rs,
    storageRiskChecks: riskChecks(rs),
    ingestionManifest: [
      {
        entryId: "ing-1",
        sourceRef: "src://desc-1",
        owner: "owner-f02",
        rights: "owner-licensed",
        checksum: "sha256:aaa",
        materialKind: "description",
        duplicateOfEntryId: null,
      },
      {
        entryId: "ing-2",
        sourceRef: "src://media-1",
        owner: "owner-f02",
        rights: "owner-licensed",
        checksum: "sha256:bbb",
        materialKind: "venue_media",
        duplicateOfEntryId: "ing-1",
      },
      {
        entryId: "ing-3",
        sourceRef: "src://rules-1",
        owner: "owner-f02",
        rights: "owner-licensed",
        checksum: "sha256:ccc",
        materialKind: "operating_rules",
        duplicateOfEntryId: null,
      },
    ],
    duplicateDetectionCompleted: true,
    facts: [
      {
        factId: "fact-prices",
        category: CriticalPilotClaimCategory.PRICES,
        statement: "Day pass $45",
        owner: "owner-f02",
        sourceRef: "src://prices",
        unresolvedConflict: false,
      },
      {
        factId: "fact-capacity",
        category: CriticalPilotClaimCategory.CAPACITY,
        statement: "24 desks",
        owner: "owner-f02",
        sourceRef: "src://capacity",
        unresolvedConflict: false,
      },
      {
        factId: "fact-hours",
        category: CriticalPilotClaimCategory.HOURS,
        statement: "Mon–Fri 9–18",
        owner: "owner-f02",
        sourceRef: "src://hours",
        unresolvedConflict: false,
      },
      {
        factId: "fact-avail",
        category: CriticalPilotClaimCategory.AVAILABILITY,
        statement: "Tour slots unknown until owner confirm",
        owner: "owner-f02",
        sourceRef: "src://availability",
        unresolvedConflict: true,
      },
    ],
    signedRevision: {
      revisionId: "rev-f02-soak",
      signedBy: "owner-f02",
      signedAtIso: "2026-11-23T02:00:00.000Z",
      impactedAssetIds: ["asset-page-home", "asset-price-card"],
      signatureToken: "sig-fixture-f02-soak",
    },
    restoreRehearsal: {
      rehearsalId: "restore-f02-soak",
      completedAtIso: "2026-11-23T02:10:00.000Z",
      exportRestoreMatched: true,
      secretsExcluded: true,
      secretBrokerRefs: ["broker://secrets/root-1"],
    },
    attemptPublicClaimFromUnresolved: false,
    claimLiveVerifiedBusinessTruth: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F02 fixture ACCEPTED.
 */
export function proofChooseFoldersEstablishBusinessTruth(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateChooseFoldersEstablishBusinessTruth(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_EVIDENCE_RECORDED" &&
    happy.evidence.writeReadProbePassed === true &&
    happy.evidence.durableRootsOffSync === true &&
    happy.evidence.duplicateDetectionCompleted === true &&
    happy.evidence.everyCriticalClaimHasOwnerAndSource === true &&
    happy.evidence.secretsExcluded === true &&
    happy.evidence.businessTruthVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F02 evidence package → CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_EVIDENCE_RECORDED; write/read probe ok; durable off sync; duplicates detected; critical claims owner+source; secretsExcluded; businessTruthVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noRoots = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ roots: [], storageRiskChecks: [] }),
  );
  if (!noRoots.allowed && noRoots.code === "REGISTERED_ROOTS_REQUIRED") {
    details.push("empty roots → REGISTERED_ROOTS_REQUIRED");
  } else {
    passed = false;
    details.push(`Roots unexpectedly ${JSON.stringify(noRoots)}`);
  }

  const rs = roots();
  rs[0] = { ...rs[0]!, writeProbeOk: false };
  const probeFail = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ roots: rs, storageRiskChecks: riskChecks(rs) }),
  );
  if (!probeFail.allowed && probeFail.code === "WRITE_READ_PROBE_REQUIRED") {
    details.push("failed write probe → WRITE_READ_PROBE_REQUIRED");
  } else {
    passed = false;
    details.push(`Write/read probe unexpectedly ${JSON.stringify(probeFail)}`);
  }

  const syncDb = roots();
  syncDb[4] = { ...syncDb[4]!, syncPath: true };
  const durableSync = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ roots: syncDb, storageRiskChecks: riskChecks(syncDb) }),
  );
  if (
    !durableSync.allowed &&
    durableSync.code === "DURABLE_ON_SYNC_PATH_REFUSED"
  ) {
    details.push("database on sync path → DURABLE_ON_SYNC_PATH_REFUSED");
  } else {
    passed = false;
    details.push(`Durable sync unexpectedly ${JSON.stringify(durableSync)}`);
  }

  const noDup = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ duplicateDetectionCompleted: false }),
  );
  if (!noDup.allowed && noDup.code === "DUPLICATE_DETECTION_REQUIRED") {
    details.push(
      "duplicateDetectionCompleted=false → DUPLICATE_DETECTION_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Duplicate detection unexpectedly ${JSON.stringify(noDup)}`);
  }

  const publicClaim = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ attemptPublicClaimFromUnresolved: true }),
  );
  if (
    !publicClaim.allowed &&
    publicClaim.code === "PUBLIC_CLAIM_FROM_UNRESOLVED_REFUSED"
  ) {
    details.push(
      "attemptPublicClaimFromUnresolved → PUBLIC_CLAIM_FROM_UNRESOLVED_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Public claim unexpectedly ${JSON.stringify(publicClaim)}`);
  }

  const liveClaim = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ claimLiveVerifiedBusinessTruth: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_BUSINESS_TRUTH_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedBusinessTruth → FALSE_LIVE_VERIFIED_BUSINESS_TRUTH_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateChooseFoldersEstablishBusinessTruth(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-003 (folders-ready happy-path summary) — complete F02 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-choose-folders-establish-business-truth-f02",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
