/**
 * Fixture proof for T-US-011 — Connect Google Ads analyze-only (write disabled).
 *
 * Behavior-acceptance save/reload summary (distinct from T-F06 complete F06
 * package): ANALYZE_ONLY bind, inventory + mapping honesty, read receipt +
 * watermark, persist/reload via in-memory fixture store. WRITE / LIVE /
 * unavailable refused. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  ConnectionState,
  GoogleAdsAccessTier,
  GoogleAdsCapability,
  SoakProofKind,
  WriteReadiness,
  createGoogleAdsAnalyzeOnlyFixtureStore,
  fixtureGoogleAdsAnalyzeOnlyInput,
  loadGoogleAdsAnalyzeOnlyBinding,
  persistGoogleAdsAnalyzeOnlyBinding,
  saveGoogleAdsAnalyzeOnlyConnection,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-011 fixture ACCEPTED.
 */
export function proofConnectGoogleAdsAnalyzeOnlyWriteDisabled(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const connectionId = `gads-conn-${randomUUID().slice(0, 8)}`;
  const sourceWatermark = `fixture-ads-wm-${randomUUID().slice(0, 8)}`;
  const store = createGoogleAdsAnalyzeOnlyFixtureStore();

  const saved = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId,
      capability: GoogleAdsCapability.ANALYZE_ONLY,
      accountTier: GoogleAdsAccessTier.TEST,
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
    saved.capability === GoogleAdsCapability.ANALYZE_ONLY &&
    saved.status.connected === true &&
    saved.status.authorized === false &&
    saved.status.verified === false &&
    saved.campaignCount === 2 &&
    saved.conversionActionCount === 2 &&
    saved.mappedConversionCount === 1 &&
    saved.discrepancyTasks.length === 1 &&
    saved.accountTier === GoogleAdsAccessTier.TEST &&
    /TEST/i.test(saved.accountTierBadge) &&
    saved.readReceiptAtIso === nowIso &&
    saved.sourceWatermark === sourceWatermark &&
    saved.liveMutationWiring === "NOT_WIRED" &&
    saved.externalEffects === "NONE"
  ) {
    details.push(
      `ANALYZE_ONLY READ_READY client=${saved.clientCustomerId} manager=${saved.managerCustomerId}; tier=${saved.accountTierBadge}`,
    );
    details.push(
      `Inventory campaigns=${saved.campaignCount} conversions=${saved.conversionActionCount} mapped=${saved.mappedConversionCount} discrepancies=${saved.discrepancyTasks.length}`,
    );
    details.push(
      `Read receipt=${saved.readReceiptAtIso}; sourceWatermark=${saved.sourceWatermark}`,
    );
    details.push(
      "Spending authority disabled; writeReadiness=NOT_AUTHORIZED; deny-write consent recorded",
    );
  } else {
    passed = false;
    details.push(`Happy-path save unexpectedly ${JSON.stringify(saved)}`);
  }

  if (saved.ok) {
    persistGoogleAdsAnalyzeOnlyBinding(store, saved);
    const loaded = loadGoogleAdsAnalyzeOnlyBinding(store, connectionId);
    if (
      loaded &&
      loaded.connectionId === saved.connectionId &&
      loaded.clientCustomerId === saved.clientCustomerId &&
      loaded.readReceiptAtIso === saved.readReceiptAtIso &&
      loaded.sourceWatermark === saved.sourceWatermark &&
      loaded.writeDisabled === true &&
      loaded.capability === GoogleAdsCapability.ANALYZE_ONLY
    ) {
      details.push(
        `Persisted fixture binding reloaded connectionId=${loaded.connectionId}`,
      );
    } else {
      passed = false;
      details.push(`Persist/reload unexpectedly ${JSON.stringify(loaded)}`);
    }
  }

  const writeRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-write-${randomUUID().slice(0, 8)}`,
      capability: GoogleAdsCapability.WRITE,
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

  const liveRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-live-${randomUUID().slice(0, 8)}`,
      environment: AnalyticsEnvironment.LIVE,
      accountTier: GoogleAdsAccessTier.TEST,
    }),
  );
  const notWiredRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-nw-${randomUUID().slice(0, 8)}`,
      environment: AnalyticsEnvironment.NOT_WIRED,
    }),
  );
  if (
    !liveRefuse.ok &&
    liveRefuse.code === "LIVE_TRANSPORT_NOT_WIRED" &&
    !notWiredRefuse.ok &&
    notWiredRefuse.code === "ENVIRONMENT_UNAVAILABLE"
  ) {
    details.push(
      "LIVE → LIVE_TRANSPORT_NOT_WIRED; NOT_WIRED → ENVIRONMENT_UNAVAILABLE",
    );
  } else {
    passed = false;
    details.push(
      `Env refuse unexpectedly live=${JSON.stringify(liveRefuse)} nw=${JSON.stringify(notWiredRefuse)}`,
    );
  }

  const consentRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-consent-${randomUUID().slice(0, 8)}`,
      denyWriteConsent: false,
    }),
  );
  const scopeRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-scope-${randomUUID().slice(0, 8)}`,
      grantScopes: ["openid"],
    }),
  );
  if (
    !consentRefuse.ok &&
    consentRefuse.code === "DENY_WRITE_CONSENT_REQUIRED" &&
    !scopeRefuse.ok &&
    scopeRefuse.code === "MISSING_ADS_SCOPE"
  ) {
    details.push(
      "Missing deny-write → DENY_WRITE_CONSENT_REQUIRED; openid-only → MISSING_ADS_SCOPE",
    );
  } else {
    passed = false;
    details.push(
      `Consent/scope refuse unexpectedly ${JSON.stringify({ consentRefuse, scopeRefuse })}`,
    );
  }

  const prodRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-prod-${randomUUID().slice(0, 8)}`,
      accountTier: GoogleAdsAccessTier.PRODUCTION,
      environment: AnalyticsEnvironment.FIXTURE,
    }),
  );
  const mapRefuse = saveGoogleAdsAnalyzeOnlyConnection(
    fixtureGoogleAdsAnalyzeOnlyInput({
      nowIso,
      connectionId: `gads-map-${randomUUID().slice(0, 8)}`,
      eventMappings: [
        {
          conversionActionId: "conv-lead-011",
          businessOutcome: "qualified_lead",
          mapped: true,
          discrepancyReason: null,
        },
      ],
    }),
  );
  if (
    !prodRefuse.ok &&
    prodRefuse.code === "PRODUCTION_TIER_ON_FIXTURE_REFUSED" &&
    !mapRefuse.ok &&
    mapRefuse.code === "MAPPING_INCOMPLETE"
  ) {
    details.push(
      "PRODUCTION on FIXTURE → PRODUCTION_TIER_ON_FIXTURE_REFUSED; incomplete mapping → MAPPING_INCOMPLETE",
    );
  } else {
    passed = false;
    details.push(
      `Prod/map refuse unexpectedly ${JSON.stringify({ prodRefuse, mapRefuse })}`,
    );
  }

  details.push(
    "No gateway mutate — fixture store persist/reload only; applyAttemptCount=0",
  );
  details.push(
    "Distinct from T-F06 CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS (complete F06 package) — T-US-011 is analyze-only save/reload summary",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-gads-analyze-only-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_GOOGLE_ADS_ANALYZE_ONLY,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us011-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
