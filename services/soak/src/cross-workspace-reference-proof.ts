/**
 * Fixture proof for T-X006 — cross-workspace object reference denied
 * without leaking foreign object details.
 *
 * Standing authority scopes channel + account + asset. Substituting a
 * foreign workspace object into an otherwise valid request yields generic
 * GRANT_MISSING (reason does not echo the foreign id).
 *
 * Hillclimb: whitespace-normalized object ids; dual foreign substitution;
 * whitespace-only ids fail closed. Honesty NOT_WIRED / externalEffects NONE.
 * Avoids credential rebind (#43) lane.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  SoakProofKind,
  evaluateStandingAuthority,
  type AuthorityRequest,
  type CapabilityGrant,
  type SoakProofRecord,
  type StandingPolicy,
} from "@worksocial/domain";

const now = "2026-11-21T22:30:00.000Z";

/** Workspace A — owned channel/account/asset surface. */
const wsA = {
  channelId: "ws-a-site",
  targetAccountId: "acct-ws-a",
  assetId: "page-ws-a-home",
} as const;

/** Workspace B — foreign object ids an attacker might substitute. */
const wsB = {
  channelId: "ws-b-site",
  targetAccountId: "acct-ws-b",
  assetId: "page-ws-b-secret",
} as const;

const policyA: StandingPolicy = {
  policyId: "pol-ws-a",
  version: 1,
  actorRole: LocalRole.ADMINISTRATOR,
  channelId: wsA.channelId,
  actionClass: ActionClass.ROUTINE_PUBLISH,
  allowedAssetScope: [wsA.assetId],
  enabled: true,
  emergencyStopApplies: true,
  expiresAtIso: null,
  createdAtIso: now,
};

const grantA: CapabilityGrant = {
  grantId: "grant-ws-a",
  policyId: "pol-ws-a",
  targetAccountId: wsA.targetAccountId,
  allowedOperations: ["publish_page"],
  allowedAssetScope: [wsA.assetId],
  contentRevisionBound: "rev-a",
  rateLimitPerHour: 10,
  expiresAtIso: null,
  revoked: false,
  createdAtIso: now,
};

function baseRequest(
  nowIso: string,
  overrides: Partial<AuthorityRequest> = {},
): AuthorityRequest {
  return {
    nowIso,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: false,
    actorRole: LocalRole.ADMINISTRATOR,
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: wsA.channelId,
    targetAccountId: wsA.targetAccountId,
    operation: "publish_page",
    assetId: wsA.assetId,
    contentRevision: "rev-a",
    ownershipProven: true,
    readEvidencePresent: true,
    sourceStale: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    policies: [policyA],
    grants: [grantA],
    ...overrides,
  };
}

function isGenericGrantMissing(
  decision: ReturnType<typeof evaluateStandingAuthority>["decision"],
  foreignTokens: string[],
): { ok: true } | { ok: false; why: string } {
  if (decision.allowed) {
    return { ok: false, why: "expected deny" };
  }
  if (decision.code !== "GRANT_MISSING") {
    return { ok: false, why: `code=${decision.code}` };
  }
  const reason = decision.reason;
  for (const token of foreignTokens) {
    if (reason.includes(token)) {
      return { ok: false, why: `reason leaked foreign token=${token}` };
    }
  }
  if (reason !== "No capability grant for this action") {
    return { ok: false, why: `non-generic reason=${reason}` };
  }
  return { ok: true };
}

/**
 * Complete expected proof set for T-X006 fixture ACCEPTED.
 */
export function proofCrossWorkspaceReferenceDenied(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Positive control: in-workspace reference allowed.
  const ok = evaluateStandingAuthority(baseRequest(nowIso));
  if (ok.decision.allowed) {
    details.push("In-workspace channel/account/asset reference allowed");
  } else {
    passed = false;
    details.push("Positive control in-workspace request denied");
  }

  const foreignTokens = [
    wsB.channelId,
    wsB.targetAccountId,
    wsB.assetId,
  ];

  // 2. Foreign channel substitution — deny without leak.
  const badChannel = evaluateStandingAuthority(
    baseRequest(nowIso, { channelId: wsB.channelId }),
  );
  const channelCheck = isGenericGrantMissing(
    badChannel.decision,
    foreignTokens,
  );
  if (channelCheck.ok && badChannel.match === null) {
    details.push(
      "Foreign channel substitution denied GRANT_MISSING without leak",
    );
  } else {
    passed = false;
    details.push(
      `Foreign channel check failed: ${"why" in channelCheck ? channelCheck.why : "match leaked"}`,
    );
  }

  // 3. Foreign account substitution — deny without leak.
  const badAccount = evaluateStandingAuthority(
    baseRequest(nowIso, { targetAccountId: wsB.targetAccountId }),
  );
  const accountCheck = isGenericGrantMissing(
    badAccount.decision,
    foreignTokens,
  );
  if (accountCheck.ok && badAccount.match === null) {
    details.push(
      "Foreign account substitution denied GRANT_MISSING without leak",
    );
  } else {
    passed = false;
    details.push(
      `Foreign account check failed: ${"why" in accountCheck ? accountCheck.why : "match leaked"}`,
    );
  }

  // 4. Foreign asset substitution — deny without leak.
  const badAsset = evaluateStandingAuthority(
    baseRequest(nowIso, { assetId: wsB.assetId }),
  );
  const assetCheck = isGenericGrantMissing(badAsset.decision, foreignTokens);
  if (assetCheck.ok && badAsset.match === null) {
    details.push(
      "Foreign asset substitution denied GRANT_MISSING without leak",
    );
  } else {
    passed = false;
    details.push(
      `Foreign asset check failed: ${"why" in assetCheck ? assetCheck.why : "match leaked"}`,
    );
  }

  // 5. Hillclimb — whitespace-padded in-workspace ids still match.
  const paddedOk = evaluateStandingAuthority(
    baseRequest(nowIso, {
      channelId: `  ${wsA.channelId}  `,
      targetAccountId: `\t${wsA.targetAccountId}\n`,
      assetId: ` ${wsA.assetId} `,
    }),
  );
  if (paddedOk.decision.allowed) {
    details.push(
      "Whitespace-padded in-workspace ids allowed (normalized match)",
    );
  } else {
    passed = false;
    details.push("Whitespace-padded in-workspace request unexpectedly denied");
  }

  // 6. Hillclimb — whitespace-padded foreign channel denied without leak.
  const paddedForeign = evaluateStandingAuthority(
    baseRequest(nowIso, { channelId: `  ${wsB.channelId}  ` }),
  );
  const paddedCheck = isGenericGrantMissing(
    paddedForeign.decision,
    foreignTokens,
  );
  if (paddedCheck.ok && paddedForeign.match === null) {
    details.push(
      "Whitespace-padded foreign channel denied GRANT_MISSING without leak",
    );
  } else {
    passed = false;
    details.push(
      `Padded foreign channel failed: ${"why" in paddedCheck ? paddedCheck.why : "match leaked"}`,
    );
  }

  // 7. Hillclimb — dual foreign channel+asset substitution.
  const dual = evaluateStandingAuthority(
    baseRequest(nowIso, {
      channelId: wsB.channelId,
      assetId: wsB.assetId,
    }),
  );
  const dualCheck = isGenericGrantMissing(dual.decision, foreignTokens);
  if (dualCheck.ok && dual.match === null) {
    details.push(
      "Dual foreign channel+asset substitution denied GRANT_MISSING without leak",
    );
  } else {
    passed = false;
    details.push(
      `Dual foreign check failed: ${"why" in dualCheck ? dualCheck.why : "match leaked"}`,
    );
  }

  // 8. Hillclimb — whitespace-only ids fail closed.
  const blank = evaluateStandingAuthority(
    baseRequest(nowIso, { channelId: "   ", assetId: "\t" }),
  );
  if (
    !blank.decision.allowed &&
    blank.decision.code === "GRANT_MISSING" &&
    blank.match === null
  ) {
    details.push("Whitespace-only object ids fail closed GRANT_MISSING");
  } else {
    passed = false;
    details.push("Whitespace-only object ids unexpectedly authorized");
  }

  details.push("honesty NOT_WIRED/NONE");
  details.push(
    "liveProviderSuccessClaimed=false catalogClaim=ACCEPTED≠VERIFIED externalEffects=NONE",
  );

  return {
    proofId: `proof-cross-workspace-${randomUUID()}`,
    kind: SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx006-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
