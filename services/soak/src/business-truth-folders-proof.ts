/**
 * Fixture proof for T-US-003 — Choose folders / establish business truth.
 *
 * Real temp-folder write/read probe + export/restore round trip; artifact
 * roots may sync; durable database/secrets off sync; hours/capacity/prices/
 * availability mapped with owner/source; restore evidence excludes secrets.
 * External effects: NONE.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  BusinessTruthClaimCategory,
  SoakProofKind,
  evaluateBusinessTruthFoldersSetup,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createEmptyRegistry,
  registerStorageRoot,
} from "@worksocial/persistence";

/**
 * Complete expected proof set for T-US-003 fixture ACCEPTED.
 */
export function proofBusinessTruthFoldersRestoreSecretsExcluded(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const dir = mkdtempSync(join(tmpdir(), "ws-soak-tus003-"));

  try {
    const secretMaterial = "raw-fixture-secret-do-not-export";
    const contentDir = join(dir, "content");
    const reportsDir = join(dir, "reports");
    const backupDir = join(dir, "encrypted_backup");
    const dbDir = join(dir, "pgdata");
    const secretsDir = join(dir, "secrets");
    const restoreDir = join(dir, "restore");
    for (const p of [
      contentDir,
      reportsDir,
      backupDir,
      dbDir,
      secretsDir,
      restoreDir,
    ]) {
      mkdirSync(p, { recursive: true });
    }

    // Write/read probe on each registered root.
    const probePayload = `probe-${nowIso}`;
    let writeReadProbePassed = true;
    for (const [kind, rootPath] of [
      ["content", contentDir],
      ["reports", reportsDir],
      ["encrypted_backup", backupDir],
      ["database", dbDir],
      ["secrets", secretsDir],
    ] as const) {
      const probeFile = join(rootPath, `write-read-probe-${kind}.txt`);
      writeFileSync(probeFile, probePayload, "utf8");
      const readBack = readFileSync(probeFile, "utf8");
      if (readBack !== probePayload) {
        writeReadProbePassed = false;
        details.push(`Write/read probe failed for ${kind}`);
      }
    }
    if (writeReadProbePassed) {
      details.push("Write/read probe passed on content/reports/backup/db/secrets");
    } else {
      passed = false;
    }

    // Keep a raw secret only under the secrets root (must not enter restore evidence).
    writeFileSync(join(secretsDir, "raw.secret"), secretMaterial, "utf8");

    let registry = createEmptyRegistry(nowIso);
    const registrations: Array<{
      kind: "content" | "reports" | "encrypted_backup" | "database" | "secrets";
      path: string;
    }> = [
      { kind: "content", path: contentDir },
      { kind: "reports", path: reportsDir },
      { kind: "encrypted_backup", path: backupDir },
      { kind: "database", path: dbDir },
      { kind: "secrets", path: secretsDir },
    ];

    const rootSummaries: Array<{
      id: string;
      kind: string;
      path: string;
      syncPath: boolean;
    }> = [];

    for (const item of registrations) {
      const result = registerStorageRoot(registry, item.kind, item.path, {
        nowIso,
        id: `root-${item.kind}`,
        resolveCanonical: false,
      });
      if (!result.ok) {
        passed = false;
        details.push(
          `registerStorageRoot(${item.kind}) failed: ${JSON.stringify(result.errors)}`,
        );
        continue;
      }
      registry = result.registry;
      rootSummaries.push({
        id: result.root.id,
        kind: result.root.kind,
        path: result.root.path,
        syncPath: result.root.syncPath,
      });
      details.push(
        `Registered ${item.kind} id=${result.root.id} syncPath=${result.root.syncPath}`,
      );
    }

    // Negative control: secrets under OneDrive must fail registration.
    const secretsOnSync = registerStorageRoot(
      createEmptyRegistry(nowIso),
      "secrets",
      join(dir, "OneDrive", "secrets-leak"),
      { resolveCanonical: false },
    );
    if (
      !secretsOnSync.ok &&
      secretsOnSync.errors.some((e) => e.code === "DURABLE_ON_SYNC_PATH")
    ) {
      details.push(
        "Negative control: secrets under sync path → DURABLE_ON_SYNC_PATH",
      );
    } else {
      passed = false;
      details.push(
        `Negative control unexpected: ${JSON.stringify(secretsOnSync)}`,
      );
    }

    // First-pass decision to produce restore evidence payload for export.
    const draft = evaluateBusinessTruthFoldersSetup({
      roots: rootSummaries,
      facts: [
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
          leaveUnresolved: true,
        },
      ],
      secretBrokerRef: "broker-ref-secrets-root-fixture",
      secretMaterial,
      rehearsalId: `rehearsal-tus003-${randomUUID().slice(0, 8)}`,
      nowIso,
      writeReadProbePassed,
      exportRestoreMatched: true,
    });

    let exportRestoreMatched = false;
    if (draft.ok) {
      const exportPath = join(backupDir, "restore-rehearsal.json");
      const exported = JSON.stringify(draft.restoreEvidence);
      writeFileSync(exportPath, exported, "utf8");
      const restoredPath = join(restoreDir, "restore-rehearsal.json");
      writeFileSync(restoredPath, readFileSync(exportPath, "utf8"), "utf8");
      const restored = readFileSync(restoredPath, "utf8");
      exportRestoreMatched =
        restored === exported &&
        !exported.includes(secretMaterial) &&
        !restored.includes(secretMaterial);
      if (exportRestoreMatched) {
        details.push(
          "Export/restore rehearsal matched; secrets excluded from restore evidence",
        );
      } else {
        passed = false;
        details.push("Export/restore rehearsal mismatch or secret leak");
      }
    } else {
      passed = false;
      details.push(`Draft domain decision failed: ${JSON.stringify(draft)}`);
    }

    // Final gate requires observed probe + restore match.
    const decision = evaluateBusinessTruthFoldersSetup({
      roots: rootSummaries,
      facts: [
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
          leaveUnresolved: true,
        },
      ],
      secretBrokerRef: "broker-ref-secrets-root-fixture",
      secretMaterial,
      rehearsalId: `rehearsal-tus003-${randomUUID().slice(0, 8)}`,
      nowIso,
      writeReadProbePassed,
      exportRestoreMatched,
    });

    if (
      decision.ok &&
      decision.code === "BUSINESS_TRUTH_FOLDERS_READY" &&
      decision.usableFacts.length === 3 &&
      decision.blockedUnresolvedFacts.length === 1 &&
      decision.restoreEvidence.claimCategoryMap.hours === "fact-hours" &&
      decision.restoreEvidence.claimCategoryMap.capacity === "fact-capacity" &&
      decision.restoreEvidence.claimCategoryMap.prices ===
        "fact-price-conflict" &&
      decision.restoreEvidence.claimCategoryMap.availability ===
        "fact-availability" &&
      decision.restoreEvidence.factOwners["fact-price-conflict"] ===
        "owner-fixture" &&
      decision.restoreEvidence.factSourceRefs["fact-price-conflict"] ===
        "fixture://conflict/price-a-vs-b" &&
      decision.blockedUnresolvedFacts[0]?.evidenceLinks[0]?.sourceRef ===
        "fixture://conflict/price-a-vs-b" &&
      decision.restoreEvidence.writeReadProbePassed === true &&
      decision.restoreEvidence.exportRestoreMatched === true &&
      decision.restoreEvidence.secretsExcluded === true &&
      decision.externalEffects === "NONE"
    ) {
      details.push(
        `Domain ready: categories=hours,capacity,prices,availability usable=${decision.usableFacts.length} blocked=${decision.blockedUnresolvedFacts.length} restoreMatched=true secretsExcluded=true`,
      );
    } else {
      passed = false;
      details.push(`Final domain decision failed: ${JSON.stringify(decision)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  details.push(`proofClock=${nowIso}`);
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-business-truth-folders-${randomUUID()}`,
    kind: SoakProofKind.BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tus003-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
