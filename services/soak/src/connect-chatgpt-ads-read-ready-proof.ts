/**
 * Fixture proof for T-US-013 — Connect ChatGPT Ads read-ready (write denial).
 *
 * Behavior-acceptance save/reload summary (distinct from T-F07 complete F07
 * package): ANALYZE_ONLY bind with transport/entitlement gates, pending-data
 * labels + watermark, persist/reload via in-memory fixture store. WRITE /
 * missing gates / LIVE refused. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  ChatGptAdsCapability,
  ConnectionState,
  SoakProofKind,
  WriteReadiness,
  createChatGptAdsAnalyzeOnlyFixtureStore,
  fixtureChatGptAdsAnalyzeOnlyInput,
  loadChatGptAdsAnalyzeOnlyBinding,
  persistChatGptAdsAnalyzeOnlyBinding,
  saveChatGptAdsAnalyzeOnlyConnection,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-013 fixture ACCEPTED.
 */
export function proofConnectChatGptAdsReadReady(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const connectionId = `chatgpt-ads-conn-${randomUUID().slice(0, 8)}`;
  const sourceWatermark = `fixture-chatgpt-ads-wm-${randomUUID().slice(0, 8)}`;
  const store = createChatGptAdsAnalyzeOnlyFixtureStore();

  const saved = saveChatGptAdsAnalyzeOnlyConnection(
    fixtureChatGptAdsAnalyzeOnlyInput({
      nowIso,
      connectionId,
      capability: ChatGptAdsCapability.ANALYZE_ONLY,
      environment: AnalyticsEnvironment.FIXTURE,
      sourceWatermark,
    }),
  );

  if (
    saved.ok &&
    saved.connectionState === ConnectionState.READ_READY &&
    saved.writeReadiness === WriteReadiness.NOT_AUTHORIZED &&
    saved.writeDisabled === true &&
    saved.spendingAuthorityEnabled === false &&
    saved.capability === ChatGptAdsCapability.ANALYZE_ONLY &&
    saved.status.connected === true &&
    saved.status.authorized === false &&
    saved.status.verified === false &&
    saved.conversionSourceCount === 2 &&
    saved.campaignAssociationCount === 2 &&
    saved.pendingMetricLabels.length > 0 &&
    saved.readReceiptAtIso === nowIso &&
    saved.sourceWatermark === sourceWatermark &&
    saved.liveMutationWiring === "NOT_WIRED" &&
    saved.externalEffects === "NONE"
  ) {
    details.push(
      `ANALYZE_ONLY READ_READY account=${saved.accountId}; broker=${saved.brokerRefMasked}; currency=${saved.currency}`,
    );
    details.push(
      `Inventory conversions=${saved.conversionSourceCount} campaigns=${saved.campaignAssociationCount} pendingLabels=${saved.pendingMetricLabels.length}`,
    );
    details.push(
      `Read receipt=${saved.readReceiptAtIso}; sourceWatermark=${saved.sourceWatermark}`,
    );
    details.push(
      "Spending authority disabled; writeReadiness=NOT_AUTHORIZED; transport/entitlement gate retained",
    );
  } else {
    passed = false;
    details.push(`Happy-path save unexpectedly ${JSON.stringify(saved)}`);
  }

  if (saved.ok) {
    persistChatGptAdsAnalyzeOnlyBinding(store, saved);
    const loaded = loadChatGptAdsAnalyzeOnlyBinding(store, connectionId);
    if (
      loaded &&
      loaded.connectionId === saved.connectionId &&
      loaded.accountId === saved.accountId &&
      loaded.readReceiptAtIso === saved.readReceiptAtIso &&
      loaded.sourceWatermark === saved.sourceWatermark &&
      loaded.writeDisabled === true &&
      loaded.capability === ChatGptAdsCapability.ANALYZE_ONLY
    ) {
      details.push(
        `Persisted fixture binding reloaded connectionId=${loaded.connectionId}`,
      );
    } else {
      passed = false;
      details.push(`Persist/reload unexpectedly ${JSON.stringify(loaded)}`);
    }
  }

  const writeRefuse = saveChatGptAdsAnalyzeOnlyConnection(
    fixtureChatGptAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `chatgpt-ads-write-${randomUUID().slice(0, 8)}`,
      capability: ChatGptAdsCapability.WRITE,
    }),
  );
  if (
    !writeRefuse.ok &&
    writeRefuse.code === "WRITE_CAPABILITY_REFUSED" &&
    writeRefuse.writeDisabled === true &&
    writeRefuse.externalEffects === "NONE"
  ) {
    details.push("WRITE capability → WRITE_CAPABILITY_REFUSED (analyze-only only)");
  } else {
    passed = false;
    details.push(`WRITE refuse unexpectedly ${JSON.stringify(writeRefuse)}`);
  }

  const gateRefuse = saveChatGptAdsAnalyzeOnlyConnection(
    fixtureChatGptAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `chatgpt-ads-gate-${randomUUID().slice(0, 8)}`,
      localTransportVerified: false,
    }),
  );
  if (
    !gateRefuse.ok &&
    gateRefuse.code === "ADS_TRANSPORT_UNVERIFIED"
  ) {
    details.push(
      "missing transport → ADS_TRANSPORT_UNVERIFIED (transport/entitlement gate)",
    );
  } else {
    passed = false;
    details.push(`Gate refuse unexpectedly ${JSON.stringify(gateRefuse)}`);
  }

  const liveRefuse = saveChatGptAdsAnalyzeOnlyConnection(
    fixtureChatGptAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `chatgpt-ads-live-${randomUUID().slice(0, 8)}`,
      environment: AnalyticsEnvironment.LIVE,
    }),
  );
  if (
    !liveRefuse.ok &&
    (liveRefuse.code === "LIVE_TRANSPORT_NOT_WIRED" ||
      liveRefuse.code === "ADS_ACCESS_BLOCKED")
  ) {
    details.push(
      `LIVE → ${liveRefuse.code}; live ChatGPT Ads mutate stays NOT_WIRED`,
    );
  } else {
    passed = false;
    details.push(`LIVE refuse unexpectedly ${JSON.stringify(liveRefuse)}`);
  }

  details.push(
    "No gateway mutate — fixture store persist/reload only; applyAttemptCount=0",
  );
  details.push(
    "Distinct from T-F07 CONNECT_CHATGPT_ADS (complete F07 package) — T-US-013 is read-ready save/reload summary",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-chatgpt-ads-read-ready-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_CHATGPT_ADS_READ_READY,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us013-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
