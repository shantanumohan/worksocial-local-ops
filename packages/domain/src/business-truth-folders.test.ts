import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import {
  BusinessTruthClaimCategory,
  buildRestoreRehearsalEvidence,
  evaluateBusinessTruthFoldersSetup,
} from "./business-truth-folders.js";

const NOW = "2026-11-22T21:00:00.000Z";

function fixtureRoots() {
  return [
    {
      id: "root-content",
      kind: "content",
      path: "/OneDrive/AgenticArmyWS/content",
      syncPath: true,
    },
    {
      id: "root-reports",
      kind: "reports",
      path: "/OneDrive/AgenticArmyWS/reports",
      syncPath: true,
    },
    {
      id: "root-backup",
      kind: "encrypted_backup",
      path: "/OneDrive/AgenticArmyWS/encrypted_backup",
      syncPath: true,
    },
    {
      id: "root-db",
      kind: "database",
      path: "/var/lib/worksocial/pgdata",
      syncPath: false,
    },
    {
      id: "root-secrets",
      kind: "secrets",
      path: "/var/lib/worksocial/secrets",
      syncPath: false,
    },
  ];
}

function fixtureFacts() {
  return [
    {
      factId: "fact-hours",
      statement: "Weekday hours 09:00–18:00 America/New_York",
      owner: "owner-fixture",
      sourceSystem: "owner-declared-ops",
      sourceRef: "fixture://owner/hours-v1",
      category: BusinessTruthClaimCategory.HOURS,
    },
    {
      factId: "fact-capacity",
      statement: "Main floor capacity 42 desks",
      owner: "owner-fixture",
      sourceSystem: "owner-declared-ops",
      sourceRef: "fixture://owner/capacity-v1",
      category: BusinessTruthClaimCategory.CAPACITY,
    },
    {
      factId: "fact-availability",
      statement: "Tour slots Tue/Thu 14:00–16:00",
      owner: "owner-fixture",
      sourceSystem: "owner-declared-ops",
      sourceRef: "fixture://owner/availability-v1",
      category: BusinessTruthClaimCategory.AVAILABILITY,
    },
    {
      factId: "fact-price-conflict",
      statement: "Day-pass price disputed between two exports",
      owner: "owner-fixture",
      sourceSystem: "import-conflict",
      sourceRef: "fixture://conflict/price-a-vs-b",
      category: BusinessTruthClaimCategory.PRICES,
      leaveUnresolved: true as const,
    },
  ];
}

describe("business-truth-folders", () => {
  it("accepts F02 happy path with restore evidence excluding secrets", () => {
    const secretMaterial = "raw-fixture-secret-do-not-export";
    const decision = evaluateBusinessTruthFoldersSetup({
      roots: fixtureRoots(),
      facts: fixtureFacts(),
      secretBrokerRef: "broker-ref-secrets-root-1",
      secretMaterial,
      rehearsalId: "rehearsal-tus003-1",
      nowIso: NOW,
      writeReadProbePassed: true,
      exportRestoreMatched: true,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.code).toBe("BUSINESS_TRUTH_FOLDERS_READY");
    expect(decision.usableFacts).toHaveLength(3);
    expect(decision.blockedUnresolvedFacts).toHaveLength(1);
    const blocked = decision.blockedUnresolvedFacts[0]!;
    expect(blocked.supportLabel).toBe(SupportLabel.HYPOTHESIS);
    expect(blocked.evidenceLinks[0]?.sourceRef).toBe(
      "fixture://conflict/price-a-vs-b",
    );
    expect(decision.restoreEvidence.factOwners["fact-price-conflict"]).toBe(
      "owner-fixture",
    );
    expect(decision.restoreEvidence.factSourceRefs["fact-price-conflict"]).toBe(
      "fixture://conflict/price-a-vs-b",
    );
    expect(decision.restoreEvidence.claimCategoryMap).toEqual({
      hours: "fact-hours",
      capacity: "fact-capacity",
      prices: "fact-price-conflict",
      availability: "fact-availability",
    });
    expect(decision.restoreEvidence.writeReadProbePassed).toBe(true);
    expect(decision.restoreEvidence.exportRestoreMatched).toBe(true);
    expect(JSON.stringify(decision.restoreEvidence)).not.toContain(
      secretMaterial,
    );
    expect(decision.externalEffects).toBe("NONE");
  });

  it("rejects missing claim category", () => {
    const facts = fixtureFacts().filter(
      (f) => f.category !== BusinessTruthClaimCategory.AVAILABILITY,
    );
    const decision = evaluateBusinessTruthFoldersSetup({
      roots: fixtureRoots(),
      facts,
      secretBrokerRef: "broker-ref-1",
      rehearsalId: "rehearsal-fail-cat",
      nowIso: NOW,
      writeReadProbePassed: true,
      exportRestoreMatched: true,
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("MISSING_CLAIM_CATEGORY");
  });

  it("rejects durable secrets root on sync path", () => {
    const roots = fixtureRoots().map((r) =>
      r.kind === "secrets" ? { ...r, syncPath: true } : r,
    );
    const decision = evaluateBusinessTruthFoldersSetup({
      roots,
      facts: fixtureFacts(),
      secretBrokerRef: "broker-ref-1",
      rehearsalId: "rehearsal-fail-sync",
      nowIso: NOW,
      writeReadProbePassed: true,
      exportRestoreMatched: true,
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("DURABLE_ON_SYNC_PATH");
  });

  it("rejects when restore rehearsal was not observed", () => {
    const decision = evaluateBusinessTruthFoldersSetup({
      roots: fixtureRoots(),
      facts: fixtureFacts(),
      secretBrokerRef: "broker-ref-1",
      rehearsalId: "rehearsal-fail-restore",
      nowIso: NOW,
      writeReadProbePassed: false,
      exportRestoreMatched: false,
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("RESTORE_REHEARSAL_FAILED");
  });

  it("buildRestoreRehearsalEvidence never embeds raw secret material", () => {
    const secret = "super-secret-token-value";
    const evidence = buildRestoreRehearsalEvidence({
      rehearsalId: "r1",
      nowIso: NOW,
      roots: fixtureRoots(),
      usableFacts: [],
      blockedUnresolvedFacts: [],
      claimCategoryMap: {
        hours: "fact-hours",
        capacity: "fact-capacity",
        prices: "fact-price",
        availability: "fact-availability",
      },
      factOwners: {},
      factSourceRefs: {},
      secretBrokerRef: "broker-ref-only",
      secretMaterial: secret,
      writeReadProbePassed: true,
      exportRestoreMatched: true,
    });
    expect("ok" in evidence && evidence.ok === false).toBe(false);
    if ("ok" in evidence) return;
    expect(JSON.stringify(evidence)).not.toContain(secret);
    expect(evidence.secretsExcluded).toBe(true);
  });
});
