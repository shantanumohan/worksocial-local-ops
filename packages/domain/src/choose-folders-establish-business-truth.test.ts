import { describe, expect, it } from "vitest";
import {
  CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_RELATED_CASE_IDS,
  CriticalPilotClaimCategory,
  FolderRootKind,
  evaluateChooseFoldersEstablishBusinessTruth,
  type ChooseFoldersEstablishBusinessTruthInput,
  type RegisteredFolderRoot,
  type StorageRiskCheck,
} from "./choose-folders-establish-business-truth.js";

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
    packageId: "pkg-f02-1",
    roots: rs,
    storageRiskChecks: riskChecks(rs),
    ingestionManifest: [
      {
        entryId: "ing-1",
        sourceRef: "src://desc-1",
        owner: "owner-1",
        rights: "owner-licensed",
        checksum: "sha256:aaa",
        materialKind: "description",
        duplicateOfEntryId: null,
      },
      {
        entryId: "ing-2",
        sourceRef: "src://media-1",
        owner: "owner-1",
        rights: "owner-licensed",
        checksum: "sha256:bbb",
        materialKind: "venue_media",
        duplicateOfEntryId: "ing-1",
      },
      {
        entryId: "ing-3",
        sourceRef: "src://rules-1",
        owner: "owner-1",
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
        owner: "owner-1",
        sourceRef: "src://prices",
        unresolvedConflict: false,
      },
      {
        factId: "fact-capacity",
        category: CriticalPilotClaimCategory.CAPACITY,
        statement: "24 desks",
        owner: "owner-1",
        sourceRef: "src://capacity",
        unresolvedConflict: false,
      },
      {
        factId: "fact-hours",
        category: CriticalPilotClaimCategory.HOURS,
        statement: "Mon–Fri 9–18",
        owner: "owner-1",
        sourceRef: "src://hours",
        unresolvedConflict: false,
      },
      {
        factId: "fact-avail",
        category: CriticalPilotClaimCategory.AVAILABILITY,
        statement: "Tour slots unknown until owner confirm",
        owner: "owner-1",
        sourceRef: "src://availability",
        unresolvedConflict: true,
      },
    ],
    signedRevision: {
      revisionId: "rev-f02-1",
      signedBy: "owner-1",
      signedAtIso: "2026-11-23T02:00:00.000Z",
      impactedAssetIds: ["asset-page-home", "asset-price-card"],
      signatureToken: "sig-fixture-f02",
    },
    restoreRehearsal: {
      rehearsalId: "restore-f02-1",
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

describe("evaluateChooseFoldersEstablishBusinessTruth (T-F02)", () => {
  it("records complete F02 evidence package", () => {
    const decision = evaluateChooseFoldersEstablishBusinessTruth(baseInput());
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(
      "CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_EVIDENCE_RECORDED",
    );
    if (!decision.allowed) return;
    expect(decision.evidence.writeReadProbePassed).toBe(true);
    expect(decision.evidence.durableRootsOffSync).toBe(true);
    expect(decision.evidence.duplicateDetectionCompleted).toBe(true);
    expect(decision.evidence.duplicateEntryCount).toBe(1);
    expect(decision.evidence.everyCriticalClaimHasOwnerAndSource).toBe(true);
    expect(decision.evidence.unresolvedConflictCount).toBe(1);
    expect(decision.evidence.secretsExcluded).toBe(true);
    expect(decision.evidence.businessTruthVerifiedLive).toBe(false);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses missing registered roots", () => {
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({ roots: [], storageRiskChecks: [] }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("REGISTERED_ROOTS_REQUIRED");
  });

  it("refuses failed write/read probe", () => {
    const rs = roots();
    rs[0] = { ...rs[0]!, writeProbeOk: false };
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({ roots: rs, storageRiskChecks: riskChecks(rs) }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("WRITE_READ_PROBE_REQUIRED");
  });

  it("refuses durable roots on sync path", () => {
    const rs = roots();
    rs[4] = { ...rs[4]!, syncPath: true };
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({ roots: rs, storageRiskChecks: riskChecks(rs) }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("DURABLE_ON_SYNC_PATH_REFUSED");
  });

  it("refuses missing duplicate detection", () => {
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({ duplicateDetectionCompleted: false }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("DUPLICATE_DETECTION_REQUIRED");
  });

  it("refuses incomplete critical claims", () => {
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({
        facts: [
          {
            factId: "fact-prices",
            category: CriticalPilotClaimCategory.PRICES,
            statement: "Day pass $45",
            owner: "owner-1",
            sourceRef: "src://prices",
            unresolvedConflict: false,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CRITICAL_CLAIM_OWNER_SOURCE_REQUIRED");
  });

  it("refuses public claims from unresolved conflicts", () => {
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({ attemptPublicClaimFromUnresolved: true }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("PUBLIC_CLAIM_FROM_UNRESOLVED_REFUSED");
  });

  it("refuses false live verified claims and live wiring", () => {
    expect(
      evaluateChooseFoldersEstablishBusinessTruth(
        baseInput({ claimLiveVerifiedBusinessTruth: true }),
      ).code,
    ).toBe("FALSE_LIVE_VERIFIED_BUSINESS_TRUTH_REFUSED");
    expect(
      evaluateChooseFoldersEstablishBusinessTruth(
        baseInput({ requestLiveProviderWiring: true }),
      ).code,
    ).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("refuses restore evidence that embeds raw secrets", () => {
    const secret = "raw-secret-token-xyz";
    const decision = evaluateChooseFoldersEstablishBusinessTruth(
      baseInput({
        secretMaterial: secret,
        restoreRehearsal: {
          rehearsalId: "restore-f02-leak",
          completedAtIso: "2026-11-23T02:10:00.000Z",
          exportRestoreMatched: true,
          secretsExcluded: true,
          secretBrokerRefs: [secret],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("SECRET_MATERIAL_IN_EVIDENCE_REFUSED");
  });

  it("maps only to T-F02", () => {
    expect([
      ...CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH_RELATED_CASE_IDS,
    ]).toEqual(["T-F02"]);
  });
});
