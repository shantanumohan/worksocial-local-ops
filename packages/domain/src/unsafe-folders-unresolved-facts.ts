/**
 * T-US-004 — Unsafe folders / unresolved facts blocked; safe facts usable.
 *
 * Failure-gate twin of F02 business-truth setup: durable roots under consumer
 * sync paths must be refused, unresolved / conflicted facts must stay blocked
 * from usable truth, and owner-sourced SUPPORTED facts remain usable.
 *
 * Live provider wiring stays NOT_WIRED. Live VERIFIED claims and live folder
 * wire requests are refused. ChatGPT Ads ACCESS_BLOCKED. Pure domain — no
 * network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import { SupportLabel, type FactRecord } from "./knowledge.js";

export const UNSAFE_FOLDERS_LIVE_PROVIDER_WIRING = "NOT_WIRED" as const;

export type UnsafeFoldersLiveProviderWiring =
  typeof UNSAFE_FOLDERS_LIVE_PROVIDER_WIRING;

/** Durable storage kinds that must not live under sync folders. */
export const UnsafeFolderDurableKind = {
  DATABASE: "database",
  TEMPORAL: "temporal",
  SECRETS: "secrets",
} as const;

export type UnsafeFolderDurableKindValue =
  (typeof UnsafeFolderDurableKind)[keyof typeof UnsafeFolderDurableKind];

const DURABLE_KINDS: ReadonlySet<string> = new Set(
  Object.values(UnsafeFolderDurableKind),
);

export function isUnsafeFolderDurableKind(
  kind: string,
): kind is UnsafeFolderDurableKindValue {
  return DURABLE_KINDS.has(kind);
}

/**
 * Pre-evaluated folder policy row (persistence sync-path check result
 * projected into the domain gate — no filesystem I/O here).
 */
export type FolderPolicyVerdictInput = {
  id: string;
  kind: string;
  path: string;
  /** True when path matched a consumer sync pattern (OneDrive-style). */
  syncPath: boolean;
  /**
   * True when durable registration was refused because the path is sync-backed
   * (`DURABLE_ON_SYNC_PATH`). Artifact roots may sync; durable must not.
   */
  durableOnSyncRefused: boolean;
};

export type UnsafeFoldersGateCode =
  | "UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED"
  | "UNSAFE_FOLDER_LEAK"
  | "NO_USABLE_SAFE_FACTS"
  | "NO_DURABLE_SYNC_CANDIDATES"
  | "LIVE_FOLDER_CLAIM_REFUSED";

export type UnsafeFoldersHonesty = {
  externalEffects: "NONE";
  liveProviderWiring: UnsafeFoldersLiveProviderWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  fixtureOnly: true;
};

export type UnsafeFoldersUnresolvedFactsDecision = {
  code: UnsafeFoldersGateCode;
  /** True when the failure-gate honesty conditions all hold. */
  ok: boolean;
  reasons: string[];
  /** Durable-on-sync rows that were refused (must be non-empty for pass). */
  unsafeFoldersBlocked: FolderPolicyVerdictInput[];
  usableFacts: FactRecord[];
  blockedUnresolvedFacts: FactRecord[];
  /** Every durable+sync row was refused. */
  allUnsafeFoldersBlocked: boolean;
  hasUsableSafeFacts: boolean;
} & UnsafeFoldersHonesty;

function honesty(): UnsafeFoldersHonesty {
  return {
    externalEffects: "NONE",
    liveProviderWiring: UNSAFE_FOLDERS_LIVE_PROVIDER_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
    fixtureOnly: true,
  };
}

/**
 * A fact is usable business truth only when SUPPORTED and free of conflict notes.
 * Unresolved / hypothesis / unknown / conflicted facts stay blocked.
 */
export function isUsableSafeFact(fact: FactRecord): boolean {
  return (
    fact.supportLabel === SupportLabel.SUPPORTED &&
    fact.conflictNotes.length === 0
  );
}

/**
 * Partition registered facts into usable safe truth vs blocked unresolved.
 */
export function partitionFactsByUsability(facts: readonly FactRecord[]): {
  usableFacts: FactRecord[];
  blockedUnresolvedFacts: FactRecord[];
} {
  const usableFacts: FactRecord[] = [];
  const blockedUnresolvedFacts: FactRecord[] = [];
  for (const fact of facts) {
    if (isUsableSafeFact(fact)) {
      usableFacts.push(fact);
    } else {
      blockedUnresolvedFacts.push(fact);
    }
  }
  return { usableFacts, blockedUnresolvedFacts };
}

/**
 * Evaluate the T-US-004 failure gate: unsafe durable folders blocked,
 * unresolved facts blocked, at least one safe fact still usable.
 * Live VERIFIED / live folder wire claims → LIVE_FOLDER_CLAIM_REFUSED.
 */
export function evaluateUnsafeFoldersUnresolvedFactsGate(input: {
  folders: readonly FolderPolicyVerdictInput[];
  facts: readonly FactRecord[];
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live folder / sync-path provider stays NOT_WIRED. */
  requestLiveFolderWire?: boolean;
}): UnsafeFoldersUnresolvedFactsDecision {
  const base = honesty();

  if (input.claimLiveVerified === true) {
    return {
      code: "LIVE_FOLDER_CLAIM_REFUSED",
      ok: false,
      reasons: [
        "Live VERIFIED unsafe-folder claims are forbidden — fixture ACCEPTED only (T-US-004)",
        "liveProviderWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      unsafeFoldersBlocked: [],
      usableFacts: [],
      blockedUnresolvedFacts: [],
      allUnsafeFoldersBlocked: false,
      hasUsableSafeFacts: false,
      ...base,
    };
  }

  if (input.requestLiveFolderWire === true) {
    return {
      code: "LIVE_FOLDER_CLAIM_REFUSED",
      ok: false,
      reasons: [
        "Live folder / sync-path provider remains NOT_WIRED — refuse live folder wire (T-US-004)",
        "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
      ],
      unsafeFoldersBlocked: [],
      usableFacts: [],
      blockedUnresolvedFacts: [],
      allUnsafeFoldersBlocked: false,
      hasUsableSafeFacts: false,
      ...base,
    };
  }

  const durableSyncCandidates = input.folders.filter(
    (f) => isUnsafeFolderDurableKind(f.kind) && f.syncPath,
  );
  const unsafeFoldersBlocked = durableSyncCandidates.filter(
    (f) => f.durableOnSyncRefused,
  );
  const allUnsafeFoldersBlocked =
    durableSyncCandidates.length > 0 &&
    unsafeFoldersBlocked.length === durableSyncCandidates.length;

  const { usableFacts, blockedUnresolvedFacts } = partitionFactsByUsability(
    input.facts,
  );
  const hasUsableSafeFacts = usableFacts.length > 0;

  if (durableSyncCandidates.length === 0) {
    return {
      code: "NO_DURABLE_SYNC_CANDIDATES",
      ok: false,
      reasons: [
        "No durable sync-path candidates — T-US-004 failure gate requires at least one durable-on-sync refusal",
        "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED",
      ],
      unsafeFoldersBlocked,
      usableFacts,
      blockedUnresolvedFacts,
      allUnsafeFoldersBlocked: false,
      hasUsableSafeFacts,
      ...base,
    };
  }

  if (!allUnsafeFoldersBlocked) {
    const leaked = durableSyncCandidates
      .filter((f) => !f.durableOnSyncRefused)
      .map((f) => f.id);
    return {
      code: "UNSAFE_FOLDER_LEAK",
      ok: false,
      reasons: [
        `Durable sync folder(s) not refused: ${leaked.join(", ")} — fail closed (T-US-004)`,
        "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED",
      ],
      unsafeFoldersBlocked,
      usableFacts,
      blockedUnresolvedFacts,
      allUnsafeFoldersBlocked: false,
      hasUsableSafeFacts,
      ...base,
    };
  }

  if (!hasUsableSafeFacts) {
    return {
      code: "NO_USABLE_SAFE_FACTS",
      ok: false,
      reasons: [
        "Unsafe folders blocked but no SUPPORTED conflict-free facts remain usable (T-US-004)",
        "liveProviderWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      unsafeFoldersBlocked,
      usableFacts,
      blockedUnresolvedFacts,
      allUnsafeFoldersBlocked: true,
      hasUsableSafeFacts: false,
      ...base,
    };
  }

  return {
    code: "UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED",
    ok: true,
    reasons: [
      `Unsafe durable folders blocked (${unsafeFoldersBlocked.length}); unresolved facts blocked (${blockedUnresolvedFacts.length}); safe facts usable (${usableFacts.length})`,
      "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
    ],
    unsafeFoldersBlocked,
    usableFacts,
    blockedUnresolvedFacts,
    allUnsafeFoldersBlocked: true,
    hasUsableSafeFacts: true,
    ...base,
  };
}
