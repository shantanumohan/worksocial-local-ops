import { describe, expect, it } from "vitest";
import {
  CollectionMethod,
  SupportLabel,
  registerFact,
} from "./knowledge.js";
import {
  evaluateUnsafeFoldersUnresolvedFactsGate,
  isUsableSafeFact,
  partitionFactsByUsability,
} from "./unsafe-folders-unresolved-facts.js";

const nowIso = "2026-11-22T20:00:00.000Z";

function supportedHoursFact() {
  const result = registerFact({
    factId: "fact-hours-safe",
    statement: "Weekday hours are 9am–6pm ET.",
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [
      {
        evidenceId: "ev-hours",
        sourceRef: "fixture://owner-hours-sheet",
        collectionMethod: CollectionMethod.OWNER_DECLARED,
        summary: "Owner-declared hours",
        observedAtIso: nowIso,
        fixtureOnly: true,
      },
    ],
    provenance: {
      registeredBy: "owner",
      collectionMethod: CollectionMethod.OWNER_DECLARED,
      sourceSystem: "owner-workbook",
      observedAtIso: nowIso,
      modelGenerated: false,
    },
    createdAtIso: nowIso,
  });
  if (!result.ok) throw new Error(result.code);
  return result.fact;
}

function unresolvedHypothesisFact() {
  const result = registerFact({
    factId: "fact-price-unresolved",
    statement: "Day pass is $99.",
    requestedLabel: SupportLabel.SUPPORTED,
    provenance: {
      registeredBy: "agent_proposal",
      collectionMethod: CollectionMethod.UNSOURCED,
      sourceSystem: "model-proposal",
      observedAtIso: nowIso,
      modelGenerated: true,
    },
    createdAtIso: nowIso,
  });
  if (!result.ok) throw new Error(result.code);
  return result.fact;
}

function conflictedFact() {
  const base = supportedHoursFact();
  return {
    ...base,
    factId: "fact-hours-conflict",
    conflictNotes: ["Source A says 9–6; Source B says 8–5 — unresolved"],
  };
}

describe("unsafe folders / unresolved facts gate (T-US-004)", () => {
  it("partitions SUPPORTED facts as usable and unresolved/conflict as blocked", () => {
    const safe = supportedHoursFact();
    const hypo = unresolvedHypothesisFact();
    const conflict = conflictedFact();
    expect(isUsableSafeFact(safe)).toBe(true);
    expect(isUsableSafeFact(hypo)).toBe(false);
    expect(isUsableSafeFact(conflict)).toBe(false);

    const parted = partitionFactsByUsability([safe, hypo, conflict]);
    expect(parted.usableFacts.map((f) => f.factId)).toEqual(["fact-hours-safe"]);
    expect(parted.blockedUnresolvedFacts.map((f) => f.factId).sort()).toEqual([
      "fact-hours-conflict",
      "fact-price-unresolved",
    ]);
  });

  it("requires durable-on-sync folders refused and keeps safe facts usable", () => {
    const decision = evaluateUnsafeFoldersUnresolvedFactsGate({
      folders: [
        {
          id: "root-content",
          kind: "content",
          path: "C:/Users/Owner/OneDrive/content",
          syncPath: true,
          durableOnSyncRefused: false,
        },
        {
          id: "root-secrets-unsafe",
          kind: "secrets",
          path: "C:/Users/Owner/OneDrive/secrets",
          syncPath: true,
          durableOnSyncRefused: true,
        },
        {
          id: "root-db-unsafe",
          kind: "database",
          path: "C:/Users/Owner/OneDrive/db",
          syncPath: true,
          durableOnSyncRefused: true,
        },
        {
          id: "root-temporal-unsafe",
          kind: "temporal",
          path: "C:/Users/Owner/OneDrive/temporal",
          syncPath: true,
          durableOnSyncRefused: true,
        },
        {
          id: "root-db-safe",
          kind: "database",
          path: "D:/worksocial/local-state/db",
          syncPath: false,
          durableOnSyncRefused: false,
        },
      ],
      facts: [supportedHoursFact(), unresolvedHypothesisFact(), conflictedFact()],
    });

    expect(decision.ok).toBe(true);
    expect(decision.code).toBe("UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED");
    expect(decision.allUnsafeFoldersBlocked).toBe(true);
    expect(decision.unsafeFoldersBlocked.map((f) => f.id).sort()).toEqual([
      "root-db-unsafe",
      "root-secrets-unsafe",
      "root-temporal-unsafe",
    ]);
    expect(decision.hasUsableSafeFacts).toBe(true);
    expect(decision.usableFacts).toHaveLength(1);
    expect(decision.blockedUnresolvedFacts).toHaveLength(2);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(decision.liveProviderSuccessClaimed).toBe(false);
  });

  it("fails closed when a durable sync folder was not refused", () => {
    const decision = evaluateUnsafeFoldersUnresolvedFactsGate({
      folders: [
        {
          id: "root-secrets-leaked",
          kind: "secrets",
          path: "C:/Users/Owner/OneDrive/secrets",
          syncPath: true,
          durableOnSyncRefused: false,
        },
      ],
      facts: [supportedHoursFact()],
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe("UNSAFE_FOLDER_LEAK");
    expect(decision.allUnsafeFoldersBlocked).toBe(false);
    expect(decision.unsafeFoldersBlocked).toHaveLength(0);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("fails closed when no durable sync candidates are present", () => {
    const decision = evaluateUnsafeFoldersUnresolvedFactsGate({
      folders: [
        {
          id: "root-content",
          kind: "content",
          path: "C:/Users/Owner/OneDrive/content",
          syncPath: true,
          durableOnSyncRefused: false,
        },
      ],
      facts: [supportedHoursFact()],
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe("NO_DURABLE_SYNC_CANDIDATES");
    expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("fails closed when unsafe folders blocked but no usable safe facts remain", () => {
    const decision = evaluateUnsafeFoldersUnresolvedFactsGate({
      folders: [
        {
          id: "root-secrets-unsafe",
          kind: "secrets",
          path: "C:/Users/Owner/OneDrive/secrets",
          syncPath: true,
          durableOnSyncRefused: true,
        },
      ],
      facts: [unresolvedHypothesisFact(), conflictedFact()],
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe("NO_USABLE_SAFE_FACTS");
    expect(decision.allUnsafeFoldersBlocked).toBe(true);
    expect(decision.hasUsableSafeFacts).toBe(false);
  });

  it("refuses live VERIFIED and live folder wire claims", () => {
    const folders = [
      {
        id: "root-secrets-unsafe",
        kind: "secrets",
        path: "C:/Users/Owner/OneDrive/secrets",
        syncPath: true,
        durableOnSyncRefused: true,
      },
    ];
    const facts = [supportedHoursFact()];

    const verified = evaluateUnsafeFoldersUnresolvedFactsGate({
      folders,
      facts,
      claimLiveVerified: true,
    });
    expect(verified.ok).toBe(false);
    expect(verified.code).toBe("LIVE_FOLDER_CLAIM_REFUSED");
    expect(verified.liveProviderWiring).toBe("NOT_WIRED");

    const wire = evaluateUnsafeFoldersUnresolvedFactsGate({
      folders,
      facts,
      requestLiveFolderWire: true,
    });
    expect(wire.ok).toBe(false);
    expect(wire.code).toBe("LIVE_FOLDER_CLAIM_REFUSED");
    expect(wire.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(wire.externalEffects).toBe("NONE");
  });
});
