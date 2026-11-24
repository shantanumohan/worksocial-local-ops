/**
 * Fixture proof for T-F07 — Connect ChatGPT Ads.
 * Complete F07 evidence package: Ads not organic; broker-masked Ads API key;
 * account identity; conversions+campaigns; bounded window; watermark+pending
 * labels; measurement checklist; READ_READY Analyze-only; transport gates;
 * unsafe claims refused; live NOT_WIRED. Distinct from T-US-013 read-ready
 * save/reload and T-US-014 identity mismatch. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  ChatGptAdsCredentialKind,
  ChatGptAdsIntegrationType,
  SoakProofKind,
  evaluateConnectChatGptAds,
  fixtureConnectChatGptAdsInput,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-F07 fixture ACCEPTED.
 */
export function proofConnectChatGptAds(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectChatGptAds(fixtureConnectChatGptAdsInput());
  if (
    happy.allowed &&
    happy.code === "CONNECT_CHATGPT_ADS_EVIDENCE_RECORDED" &&
    happy.evidence.integrationType === "CHATGPT_ADS" &&
    happy.evidence.credentialKind === "ADS_API_KEY" &&
    happy.evidence.capability === "ANALYZE_ONLY" &&
    happy.evidence.writeAuthorized === false &&
    happy.evidence.spendingAuthorityEnabled === false &&
    happy.evidence.adsVerifiedLive === false &&
    happy.evidence.measurementChecklistComplete === true &&
    happy.evidence.pendingMetricLabels.length > 0 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F07 evidence package → CONNECT_CHATGPT_ADS_EVIDENCE_RECORDED; Ads not organic; broker-masked Ads API key; account identity; conversions+campaigns; bounded window; watermark+pending labels; measurement checklist; READ_READY Analyze-only; adsVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noTransport = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({ localTransportVerified: false }),
  );
  if (
    !noTransport.allowed &&
    noTransport.code === "ADS_TRANSPORT_UNVERIFIED"
  ) {
    details.push(
      "missing transport → ADS_TRANSPORT_UNVERIFIED (ACCESS_BLOCKED)",
    );
  } else {
    passed = false;
    details.push(`Transport gate unexpectedly ${JSON.stringify(noTransport)}`);
  }

  const organic = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({
      integrationType: ChatGptAdsIntegrationType.CHATGPT_ORGANIC,
    }),
  );
  if (!organic.allowed && organic.code === "ORGANIC_INTEGRATION_REFUSED") {
    details.push("organic integration → ORGANIC_INTEGRATION_REFUSED");
  } else {
    passed = false;
    details.push(`Organic unexpectedly ${JSON.stringify(organic)}`);
  }

  const modelKey = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({
      credentialKind: ChatGptAdsCredentialKind.MODEL_API_KEY,
    }),
  );
  if (!modelKey.allowed && modelKey.code === "MODEL_API_KEY_REFUSED") {
    details.push("MODEL_API_KEY → MODEL_API_KEY_REFUSED");
  } else {
    passed = false;
    details.push(`Model key unexpectedly ${JSON.stringify(modelKey)}`);
  }

  const mismatch = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({
      intendedAccountId: "intended-a",
      returnedAccountId: "returned-b",
    }),
  );
  if (
    !mismatch.allowed &&
    mismatch.code === "ADS_ACCOUNT_IDENTITY_MISMATCH"
  ) {
    details.push(
      "identity mismatch → ADS_ACCOUNT_IDENTITY_MISMATCH (T-US-014)",
    );
  } else {
    passed = false;
    details.push(`Identity mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  const writeSave = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({ attemptWriteSave: true }),
  );
  if (!writeSave.allowed && writeSave.code === "WRITE_SAVE_REFUSED") {
    details.push("attemptWriteSave → WRITE_SAVE_REFUSED");
  } else {
    passed = false;
    details.push(`Write save unexpectedly ${JSON.stringify(writeSave)}`);
  }

  const liveClaim = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({ claimLiveVerifiedAds: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_ADS_REFUSED"
  ) {
    details.push("claimLiveVerifiedAds → FALSE_LIVE_VERIFIED_ADS_REFUSED");
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateConnectChatGptAds(
    fixtureConnectChatGptAdsInput({ requestLiveProviderWiring: true }),
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
    "Distinct from T-US-013 (analyze-only save/reload summary) and T-US-014 (identity mismatch) — complete F07 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_CHATGPT_ADS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-chatgpt-ads-f07",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
