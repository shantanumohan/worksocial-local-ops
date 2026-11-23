/**
 * T-US-004 — Unsafe folders / unresolved facts blocked; safe facts usable.
 *
 * Failure-gate twin of F02 business-truth setup: durable roots under consumer
 * sync paths must be refused, unresolved / conflicted facts must stay blocked
 * from usable truth, and owner-sourced SUPPORTED facts remain usable.
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 */

import { SupportLabel, type FactRecord } from "./knowledge.js";

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

export type UnsafeFoldersUnresolvedFactsDecision = {
  /** Durable-on-sync rows that were refused (must be non-empty for pass). */
  unsafeFoldersBlocked: FolderPolicyVerdictInput[];
  usableFacts: FactRecord[];
  blockedUnresolvedFacts: FactRecord[];
  /** Every durable+sync row was refused. */
  allUnsafeFoldersBlocked: boolean;
  hasUsableSafeFacts: boolean;
  externalEffects: "NONE";
  fixtureOnly: true;
};

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
 */
export function evaluateUnsafeFoldersUnresolvedFactsGate(input: {
  folders: readonly FolderPolicyVerdictInput[];
  facts: readonly FactRecord[];
}): UnsafeFoldersUnresolvedFactsDecision {
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

  return {
    unsafeFoldersBlocked,
    usableFacts,
    blockedUnresolvedFacts,
    allUnsafeFoldersBlocked,
    hasUsableSafeFacts: usableFacts.length > 0,
    externalEffects: "NONE",
    fixtureOnly: true,
  };
}
