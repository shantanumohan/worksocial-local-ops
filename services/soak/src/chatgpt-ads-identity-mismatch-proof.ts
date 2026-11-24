/**
 * Fixture proof for T-US-014 — ChatGPT Ads key/account identity mismatch
 * refuses bind. Intended ≠ returned → ADS_ACCOUNT_IDENTITY_MISMATCH;
 * match → fixture bind receipt only. Transport/entitlement gate retained.
 * Live NOT_WIRED. Distinct from T-F07 complete connect and T-US-013
 * read-ready save. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  ChatGptAdsCredentialKind,
  SoakProofKind,
  evaluateChatGptAdsIdentityBind,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-014 fixture ACCEPTED.
 */
export function proofChatGptAdsIdentityMismatchRefusesBind(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const mismatch = evaluateChatGptAdsIdentityBind({
    localTransportVerified: true,
    entitlementVerified: true,
    authVerified: true,
    credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
    intendedAccountId: "ads-mgr-intended-014",
    returnedAccountId: "ads-mgr-returned-other",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    !mismatch.allowed &&
    mismatch.bindRefused === true &&
    mismatch.code === "ADS_ACCOUNT_IDENTITY_MISMATCH" &&
    mismatch.liveProviderWiring === "NOT_WIRED" &&
    mismatch.externalEffects === "NONE"
  ) {
    details.push(
      "intended ≠ returned → ADS_ACCOUNT_IDENTITY_MISMATCH; bindRefused=true",
    );
  } else {
    passed = false;
    details.push(`Mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  const match = evaluateChatGptAdsIdentityBind({
    localTransportVerified: true,
    entitlementVerified: true,
    authVerified: true,
    credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
    intendedAccountId: "ads-mgr-same-014",
    returnedAccountId: "ads-mgr-same-014",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    match.allowed &&
    match.bindRefused === false &&
    match.code === "ADS_ACCOUNT_IDENTITY_MATCH_FIXTURE_BIND" &&
    match.fixtureOnly === true
  ) {
    details.push(
      "identity match → ADS_ACCOUNT_IDENTITY_MATCH_FIXTURE_BIND (fixture bind receipt only; not VERIFIED)",
    );
  } else {
    passed = false;
    details.push(`Match unexpectedly ${JSON.stringify(match)}`);
  }

  const modelKey = evaluateChatGptAdsIdentityBind({
    localTransportVerified: true,
    entitlementVerified: true,
    authVerified: true,
    credentialKind: ChatGptAdsCredentialKind.MODEL_API_KEY,
    intendedAccountId: "ads-mgr-same-014",
    returnedAccountId: "ads-mgr-same-014",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (!modelKey.allowed && modelKey.code === "MODEL_API_KEY_REFUSED") {
    details.push("MODEL_API_KEY → MODEL_API_KEY_REFUSED; bind refused");
  } else {
    passed = false;
    details.push(`Model key unexpectedly ${JSON.stringify(modelKey)}`);
  }

  const noGate = evaluateChatGptAdsIdentityBind({
    localTransportVerified: false,
    entitlementVerified: true,
    authVerified: true,
    credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
    intendedAccountId: "ads-mgr-same-014",
    returnedAccountId: "ads-mgr-same-014",
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (!noGate.allowed && noGate.code === "ADS_TRANSPORT_UNVERIFIED") {
    details.push(
      "missing transport → ADS_TRANSPORT_UNVERIFIED (chatgpt_ads_transport_entitlement retained)",
    );
  } else {
    passed = false;
    details.push(`Gate refuse unexpectedly ${JSON.stringify(noGate)}`);
  }

  const live = evaluateChatGptAdsIdentityBind({
    localTransportVerified: true,
    entitlementVerified: true,
    authVerified: true,
    credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
    intendedAccountId: "ads-mgr-same-014",
    returnedAccountId: "ads-mgr-same-014",
    environment: AnalyticsEnvironment.LIVE,
  });
  if (!live.allowed && live.code === "LIVE_TRANSPORT_NOT_WIRED") {
    details.push("LIVE → LIVE_TRANSPORT_NOT_WIRED");
  } else {
    passed = false;
    details.push(`LIVE refuse unexpectedly ${JSON.stringify(live)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-F07 CONNECT_CHATGPT_ADS and T-US-013 CONNECT_CHATGPT_ADS_READ_READY — identity mismatch refuse gate only",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-chatgpt-ads-identity-${randomUUID()}`,
    kind: SoakProofKind.CHATGPT_ADS_IDENTITY_MISMATCH_REFUSES_BIND,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us014-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
