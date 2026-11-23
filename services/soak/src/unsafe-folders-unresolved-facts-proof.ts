/**
 * Fixture proof for T-US-004 — unsafe folders / unresolved facts blocked;
 * safe facts usable.
 *
 * Persistence sync-path policy refuses durable roots under OneDrive-style
 * paths; domain gate partitions SUPPORTED vs unresolved/conflict facts;
 * article + concierge gates admit only usable safe facts. External effects:
 * NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  CollectionMethod,
  InboxChannel,
  SoakProofKind,
  SupportLabel,
  createCanonicalArticle,
  createConversation,
  defaultResponsePolicy,
  evaluateArticleGate,
  evaluateUnsafeFoldersUnresolvedFactsGate,
  prepareConciergeReply,
  registerFact,
  type FactRecord,
  type SoakProofRecord,
} from "@worksocial/domain";
import { evaluateSyncPathPolicy } from "@worksocial/persistence";

function registerOwnerSupportedFact(
  factId: string,
  statement: string,
  nowIso: string,
): FactRecord {
  const result = registerFact({
    factId,
    statement,
    requestedLabel: SupportLabel.SUPPORTED,
    evidenceLinks: [
      {
        evidenceId: `ev-${factId}`,
        sourceRef: `fixture://owner/${factId}`,
        collectionMethod: CollectionMethod.OWNER_DECLARED,
        summary: "Owner-declared evidenced fact",
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
  if (!result.ok) {
    throw new Error(`registerFact failed: ${result.code}`);
  }
  return result.fact;
}

function registerUnresolvedFact(factId: string, nowIso: string): FactRecord {
  const result = registerFact({
    factId,
    statement: "Unverified day-pass price claim",
    requestedLabel: SupportLabel.SUPPORTED,
    provenance: {
      registeredBy: "agent_proposal",
      collectionMethod: CollectionMethod.UNSOURCED,
      sourceSystem: "model-proposal",
      observedAtIso: nowIso,
      modelGenerated: true,
    },
    conflictNotes: ["No owner evidence — unresolved"],
    createdAtIso: nowIso,
  });
  if (!result.ok) {
    throw new Error(`registerFact unresolved failed: ${result.code}`);
  }
  return result.fact;
}

/**
 * Complete expected proof set for T-US-004 fixture ACCEPTED.
 */
export function proofUnsafeFoldersUnresolvedFactsBlocked(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const operationId = `op-us004-${randomUUID().slice(0, 8)}`;

  // --- Unsafe durable folders blocked (persistence sync-path policy) ---
  const syncSecrets = evaluateSyncPathPolicy(
    "secrets",
    "C:/Users/Owner/OneDrive - Contoso/Documents/AgenticArmyWS/secrets",
    { resolveCanonical: false },
  );
  const syncDb = evaluateSyncPathPolicy(
    "database",
    "C:/Users/Owner/OneDrive/worksocial-db",
    { resolveCanonical: false },
  );
  const offSyncDb = evaluateSyncPathPolicy(
    "database",
    "D:/worksocial/local-state/database",
    { resolveCanonical: false },
  );
  const syncContent = evaluateSyncPathPolicy(
    "content",
    "C:/Users/Owner/OneDrive/content",
    { resolveCanonical: false },
  );

  if (
    syncSecrets.ok === false &&
    syncSecrets.reason === "DURABLE_ON_SYNC_PATH" &&
    syncDb.ok === false &&
    syncDb.reason === "DURABLE_ON_SYNC_PATH"
  ) {
    details.push(
      "Durable secrets+database under OneDrive → DURABLE_ON_SYNC_PATH (blocked)",
    );
  } else {
    passed = false;
    details.push(
      `Unsafe durable folder policy unexpected: secrets.ok=${syncSecrets.ok} db.ok=${syncDb.ok}`,
    );
  }

  if (offSyncDb.ok === true && syncContent.ok === true) {
    details.push(
      "Off-sync durable database allowed; artifact content may sync",
    );
  } else {
    passed = false;
    details.push(
      `Positive folder controls failed: offSyncDb.ok=${offSyncDb.ok} syncContent.ok=${syncContent.ok}`,
    );
  }

  const safeFact = registerOwnerSupportedFact(
    "fact-hours-safe",
    "Weekday hours are 9am–6pm ET.",
    nowIso,
  );
  const unresolvedFact = registerUnresolvedFact("fact-price-unresolved", nowIso);

  if (
    safeFact.supportLabel === SupportLabel.SUPPORTED &&
    unresolvedFact.supportLabel !== SupportLabel.SUPPORTED
  ) {
    details.push(
      `Fact labels honest: safe=${safeFact.supportLabel} unresolved=${unresolvedFact.supportLabel}`,
    );
  } else {
    passed = false;
    details.push(
      `Fact labeling unexpected safe=${safeFact.supportLabel} unresolved=${unresolvedFact.supportLabel}`,
    );
  }

  const decision = evaluateUnsafeFoldersUnresolvedFactsGate({
    folders: [
      {
        id: "root-content",
        kind: "content",
        path: syncContent.path,
        syncPath: syncContent.syncPath,
        durableOnSyncRefused: false,
      },
      {
        id: "root-secrets-unsafe",
        kind: "secrets",
        path: syncSecrets.path,
        syncPath: true,
        durableOnSyncRefused: syncSecrets.ok === false,
      },
      {
        id: "root-db-unsafe",
        kind: "database",
        path: syncDb.path,
        syncPath: true,
        durableOnSyncRefused: syncDb.ok === false,
      },
      {
        id: "root-db-safe",
        kind: "database",
        path: offSyncDb.path,
        syncPath: false,
        durableOnSyncRefused: false,
      },
    ],
    facts: [safeFact, unresolvedFact],
  });

  if (
    decision.allUnsafeFoldersBlocked &&
    decision.unsafeFoldersBlocked.length === 2 &&
    decision.hasUsableSafeFacts &&
    decision.usableFacts.some((f) => f.factId === "fact-hours-safe") &&
    decision.blockedUnresolvedFacts.some(
      (f) => f.factId === "fact-price-unresolved",
    ) &&
    decision.externalEffects === "NONE"
  ) {
    details.push(
      "Domain gate: unsafe durable folders blocked; unresolved facts blocked; safe facts usable",
    );
  } else {
    passed = false;
    details.push(
      `Domain gate unexpected allBlocked=${decision.allUnsafeFoldersBlocked} usable=${decision.usableFacts.length} blocked=${decision.blockedUnresolvedFacts.length}`,
    );
  }

  const factLabels = new Map(
    [safeFact, unresolvedFact].map((f) => [f.factId, f.supportLabel]),
  );

  // --- Unresolved fact blocked from article release ---
  const blockedArticle = createCanonicalArticle({
    articleId: `art-us004-blocked-${operationId.slice(-6)}`,
    campaignId: "camp-us004",
    authorId: "author-a13",
    title: "Pricing",
    body: "Day pass pricing claim.",
    citedFactIds: ["fact-price-unresolved"],
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const blockedGate = evaluateArticleGate({
    article: blockedArticle,
    factLabels,
  });
  if (!blockedGate.allowed) {
    details.push(
      `Article gate refuses unresolved citation (code=${blockedGate.code ?? "denied"})`,
    );
  } else {
    passed = false;
    details.push("Article gate unexpectedly allowed unresolved fact citation");
  }

  // --- Safe fact usable for article + concierge ---
  const safeArticle = createCanonicalArticle({
    articleId: `art-us004-safe-${operationId.slice(-6)}`,
    campaignId: "camp-us004",
    authorId: "author-a13",
    title: "Hours",
    body: "Visit during verified weekday hours.",
    citedFactIds: ["fact-hours-safe"],
    fixtureOnly: true,
    createdAtIso: nowIso,
  });
  const safeGate = evaluateArticleGate({
    article: safeArticle,
    factLabels,
  });
  if (safeGate.allowed) {
    details.push("Article gate allows SUPPORTED safe-fact citation");
  } else {
    passed = false;
    details.push(
      `Article gate unexpectedly denied safe fact: ${safeGate.reasons.join("; ")}`,
    );
  }

  const conversation = createConversation({
    conversationId: `c-us004-${operationId.slice(-6)}`,
    providerThreadId: `thr-us004-${operationId.slice(-6)}`,
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Casey",
    nowIso,
  });
  const policy = defaultResponsePolicy(nowIso);

  const refusedReply = prepareConciergeReply({
    draftId: `d-us004-blocked-${operationId.slice(-6)}`,
    conversation,
    inboundBody: "What is the day pass price?",
    citedFactIds: ["fact-price-unresolved"],
    factLabels,
    policy,
    bookingEvidence: [],
    nowIso,
  });
  if (!refusedReply.ok && refusedReply.code === "UNSUPPORTED_FACTS") {
    details.push("Concierge refuses unresolved fact citation (UNSUPPORTED_FACTS)");
  } else {
    passed = false;
    details.push(
      `Concierge unresolved refuse unexpected: ${JSON.stringify(refusedReply)}`,
    );
  }

  const allowedReply = prepareConciergeReply({
    draftId: `d-us004-safe-${operationId.slice(-6)}`,
    conversation,
    inboundBody: "What are weekday hours?",
    citedFactIds: ["fact-hours-safe"],
    factLabels,
    policy,
    bookingEvidence: [],
    nowIso,
  });
  if (allowedReply.ok) {
    details.push("Concierge allows SUPPORTED safe-fact reply draft");
  } else {
    passed = false;
    details.push(
      `Concierge safe reply unexpected: code=${"code" in allowedReply ? allowedReply.code : "?"}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-unsafe-folders-unresolved-${randomUUID()}`,
    kind: SoakProofKind.UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
