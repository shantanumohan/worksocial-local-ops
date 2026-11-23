/**
 * Fixture proof for T-F06 — Connect Google Ads for controlled analysis.
 * Complete F06 evidence package: project+access tier, identity+scopes,
 * deny-write consent, client/manager bind+TEST badge, campaigns+conversions,
 * event mapping+discrepancies, read receipt+watermark, READ_READY Analyze-only;
 * unsafe claims refused; live NOT_WIRED. Distinct from open T-US-011
 * analyze-only save/reload summary and T-US-012 test vs production separation.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  GoogleAdsAccessTier,
  GoogleAdsCapability,
  REQUIRED_GOOGLE_ADS_GRANT_SCOPES,
  SoakProofKind,
  evaluateConnectGoogleAdsControlledAnalysis,
  type ConnectGoogleAdsControlledAnalysisInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ConnectGoogleAdsControlledAnalysisInput> = {},
): ConnectGoogleAdsControlledAnalysisInput {
  return {
    packageId: "pkg-f06-soak",
    projectAccess: {
      projectId: "fixture-gcp-ads-project",
      accessTier: GoogleAdsAccessTier.TEST,
      accessRequirementsReviewed: true,
    },
    connectionIdentity: {
      subject: "owner@example.worksocial.test",
      grantScopes: [...REQUIRED_GOOGLE_ADS_GRANT_SCOPES],
    },
    denyWriteConsent: true,
    accountBinding: {
      clientCustomerId: "111-222-3333",
      managerCustomerId: "999-888-7777",
      accountTier: GoogleAdsAccessTier.TEST,
      displayName: "Fixture Ads client",
    },
    campaigns: [
      {
        campaignId: "camp-1",
        name: "Brand search",
        status: "ENABLED",
      },
      {
        campaignId: "camp-2",
        name: "Remarketing",
        status: "PAUSED",
      },
    ],
    conversionActions: [
      {
        conversionActionId: "conv-lead",
        name: "Generate lead",
        category: "SUBMIT_LEAD_FORM",
      },
      {
        conversionActionId: "conv-book",
        name: "Book tour",
        category: "BOOK_APPOINTMENT",
      },
    ],
    eventMappings: [
      {
        conversionActionId: "conv-lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        discrepancyReason: null,
      },
      {
        conversionActionId: "conv-book",
        businessOutcome: "tour_booked",
        mapped: false,
        discrepancyReason: "booking provider conversion lag not wired in fixture",
      },
    ],
    readReceipt: {
      providerRequestId: "req-ads-read-f06-soak",
      readAtIso: "2026-11-23T02:00:00.000Z",
      sourceWatermark: "ads-wm-f06-soak",
    },
    readReady: {
      status: "READ_READY",
      capability: GoogleAdsCapability.ANALYZE_ONLY,
      writeAuthorized: false,
      spendingAuthorityEnabled: false,
    },
    attemptWriteSave: false,
    claimLiveVerifiedAds: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F06 fixture ACCEPTED.
 */
export function proofConnectGoogleAdsControlledAnalysis(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectGoogleAdsControlledAnalysis(baseInput());
  if (
    happy.allowed &&
    happy.code === "CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_EVIDENCE_RECORDED" &&
    happy.evidence.accessTier === "TEST" &&
    /TEST/i.test(happy.evidence.accountTierBadge) &&
    happy.evidence.denyWriteConsent === true &&
    happy.evidence.capability === "ANALYZE_ONLY" &&
    happy.evidence.writeAuthorized === false &&
    happy.evidence.spendingAuthorityEnabled === false &&
    happy.evidence.adsVerifiedLive === false &&
    happy.evidence.discrepancyTaskCount === 1 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F06 evidence package → CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_EVIDENCE_RECORDED; project+access tier; identity+scopes; deny-write consent; client/manager bind+TEST badge; campaigns+conversions; event mapping+discrepancies; read receipt+watermark; READ_READY Analyze-only; adsVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noProject = evaluateConnectGoogleAdsControlledAnalysis(
    baseInput({
      projectAccess: {
        projectId: "",
        accessTier: GoogleAdsAccessTier.TEST,
        accessRequirementsReviewed: false,
      },
    }),
  );
  if (!noProject.allowed && noProject.code === "PROJECT_ACCESS_REQUIRED") {
    details.push("empty project access → PROJECT_ACCESS_REQUIRED");
  } else {
    passed = false;
    details.push(`Project access unexpectedly ${JSON.stringify(noProject)}`);
  }

  const noConsent = evaluateConnectGoogleAdsControlledAnalysis(
    baseInput({ denyWriteConsent: false }),
  );
  if (
    !noConsent.allowed &&
    noConsent.code === "DENY_WRITE_CONSENT_REQUIRED"
  ) {
    details.push("denyWriteConsent=false → DENY_WRITE_CONSENT_REQUIRED");
  } else {
    passed = false;
    details.push(`Deny-write consent unexpectedly ${JSON.stringify(noConsent)}`);
  }

  const prodTier = evaluateConnectGoogleAdsControlledAnalysis(
    baseInput({
      projectAccess: {
        projectId: "fixture-gcp-ads-project",
        accessTier: GoogleAdsAccessTier.PRODUCTION,
        accessRequirementsReviewed: true,
      },
      accountBinding: {
        ...baseInput().accountBinding,
        accountTier: GoogleAdsAccessTier.PRODUCTION,
      },
    }),
  );
  if (
    !prodTier.allowed &&
    prodTier.code === "PRODUCTION_TIER_ON_FIXTURE_REFUSED"
  ) {
    details.push(
      "PRODUCTION tier on fixture → PRODUCTION_TIER_ON_FIXTURE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Production tier unexpectedly ${JSON.stringify(prodTier)}`);
  }

  const noInventory = evaluateConnectGoogleAdsControlledAnalysis(
    baseInput({ campaigns: [], conversionActions: [] }),
  );
  if (!noInventory.allowed && noInventory.code === "INVENTORY_REQUIRED") {
    details.push("empty inventory → INVENTORY_REQUIRED");
  } else {
    passed = false;
    details.push(`Inventory unexpectedly ${JSON.stringify(noInventory)}`);
  }

  const writeSave = evaluateConnectGoogleAdsControlledAnalysis(
    baseInput({ attemptWriteSave: true }),
  );
  if (!writeSave.allowed && writeSave.code === "WRITE_SAVE_REFUSED") {
    details.push("attemptWriteSave → WRITE_SAVE_REFUSED");
  } else {
    passed = false;
    details.push(`Write save unexpectedly ${JSON.stringify(writeSave)}`);
  }

  const liveClaim = evaluateConnectGoogleAdsControlledAnalysis(
    baseInput({ claimLiveVerifiedAds: true }),
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

  const liveWire = evaluateConnectGoogleAdsControlledAnalysis(
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
    "Distinct from T-US-011 (analyze-only save/reload summary) and T-US-012 (test vs production access) — complete F06 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-google-ads-controlled-analysis-f06",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
