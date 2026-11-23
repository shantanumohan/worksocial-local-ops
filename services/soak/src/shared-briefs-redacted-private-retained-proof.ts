/**
 * Fixture proof for T-US-059 — Shared briefs redacted; private evidence retained.
 * Redacted shared brief + vaulted private evidence records; unredacted share,
 * private fields in shared package, discarded private evidence, and private
 * evidence in shared export refused; live NOT_WIRED. Distinct from T-US-050 /
 * T-US-053 / redactEvidenceSummary. External effects: NONE. Never invents
 * live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  BriefAudience,
  PrivateEvidenceRetentionStore,
  PrivateFieldKind,
  SoakProofKind,
  evaluateSharedBriefsRedactedPrivateRetained,
  type SharedBriefsRedactedPrivateRetainedInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<SharedBriefsRedactedPrivateRetainedInput> = {},
): SharedBriefsRedactedPrivateRetainedInput {
  return {
    shareId: "share-059-brief",
    brief: {
      briefId: "brief-shared-059",
      audience: BriefAudience.SHARED,
      redacted: true,
      privateFieldKinds: [],
    },
    privateEvidence: {
      evidenceId: "ev-private-059",
      retained: true,
      retentionStore: PrivateEvidenceRetentionStore.PRIVATE_VAULT,
      containsRawPii: true,
    },
    attemptShareUnredactedBrief: false,
    attemptDiscardPrivateEvidenceOnShare: false,
    claimLiveVerifiedShare: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-US-059 fixture ACCEPTED.
 */
export function proofSharedBriefsRedactedPrivateRetained(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateSharedBriefsRedactedPrivateRetained(baseInput());
  if (
    happy.allowed &&
    happy.code === "SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED" &&
    happy.evidence.sharedBriefRedacted === true &&
    happy.evidence.privateFieldCountInSharedBrief === 0 &&
    happy.evidence.privateEvidenceRetained === true &&
    happy.evidence.privateEvidenceStore === "private_vault" &&
    happy.evidence.shareVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "redacted shared brief + private vault retention → SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED; shareVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const missing = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({ shareId: "" }),
  );
  if (!missing.allowed && missing.code === "SHARE_PACKAGE_REQUIRED") {
    details.push("empty shareId → SHARE_PACKAGE_REQUIRED");
  } else {
    passed = false;
    details.push(`Missing package unexpectedly ${JSON.stringify(missing)}`);
  }

  const unredacted = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({ attemptShareUnredactedBrief: true }),
  );
  if (
    !unredacted.allowed &&
    unredacted.code === "UNREDACTED_SHARED_BRIEF_REFUSED"
  ) {
    details.push(
      "attemptShareUnredactedBrief → UNREDACTED_SHARED_BRIEF_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Unredacted unexpectedly ${JSON.stringify(unredacted)}`);
  }

  const privateFields = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({
      brief: {
        briefId: "brief-shared-059",
        audience: BriefAudience.SHARED,
        redacted: true,
        privateFieldKinds: [PrivateFieldKind.CUSTOMER_CONTACT],
      },
    }),
  );
  if (
    !privateFields.allowed &&
    privateFields.code === "PRIVATE_FIELDS_IN_SHARED_BRIEF_REFUSED"
  ) {
    details.push(
      "customer_contact in shared brief → PRIVATE_FIELDS_IN_SHARED_BRIEF_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Private fields unexpectedly ${JSON.stringify(privateFields)}`,
    );
  }

  const discarded = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({
      privateEvidence: {
        evidenceId: "ev-private-059",
        retained: false,
        retentionStore: PrivateEvidenceRetentionStore.DISCARDED,
        containsRawPii: true,
      },
    }),
  );
  if (
    !discarded.allowed &&
    discarded.code === "PRIVATE_EVIDENCE_NOT_RETAINED_REFUSED"
  ) {
    details.push(
      "discarded private evidence → PRIVATE_EVIDENCE_NOT_RETAINED_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Discarded unexpectedly ${JSON.stringify(discarded)}`);
  }

  const leaked = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({
      privateEvidence: {
        evidenceId: "ev-private-059",
        retained: true,
        retentionStore: PrivateEvidenceRetentionStore.SHARED_EXPORT,
        containsRawPii: true,
      },
    }),
  );
  if (
    !leaked.allowed &&
    leaked.code === "PRIVATE_EVIDENCE_IN_SHARED_EXPORT_REFUSED"
  ) {
    details.push(
      "private evidence in shared export → PRIVATE_EVIDENCE_IN_SHARED_EXPORT_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Leaked unexpectedly ${JSON.stringify(leaked)}`);
  }

  const discardAttempt = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({ attemptDiscardPrivateEvidenceOnShare: true }),
  );
  if (
    !discardAttempt.allowed &&
    discardAttempt.code === "DISCARD_PRIVATE_EVIDENCE_ON_SHARE_REFUSED"
  ) {
    details.push(
      "attemptDiscardPrivateEvidenceOnShare → DISCARD_PRIVATE_EVIDENCE_ON_SHARE_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Discard attempt unexpectedly ${JSON.stringify(discardAttempt)}`,
    );
  }

  const liveClaim = evaluateSharedBriefsRedactedPrivateRetained(
    baseInput({ claimLiveVerifiedShare: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_SHARE_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedShare → FALSE_LIVE_VERIFIED_SHARE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateSharedBriefsRedactedPrivateRetained(
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
    "Distinct from T-US-050 (owner brief root-cause), T-US-053 (secrets never in browser assets), redactEvidenceSummary (string scrub)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-shared-briefs-redacted-private-retained-${randomUUID()}`,
    kind: SoakProofKind.SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-shared-briefs-redacted-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
