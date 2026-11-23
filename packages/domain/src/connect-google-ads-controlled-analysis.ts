/**
 * T-F06 — Connect Google Ads for controlled analysis (complete F06 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F06 evidence
 * package — project + access-tier evidence, Google identity + Ads scopes,
 * consent plus application-level deny-write rule, client customer (+ optional
 * manager) account binding with TEST/PRODUCTION badge, campaign and
 * conversion-action inventory, conversion→business-event mapping with
 * discrepancy tasks, read receipt + source watermark, and READ_READY with
 * Analyze-only / write unauthorized. Incomplete packages, write/spend saves,
 * PRODUCTION tier claims on fixture, and false live-verified claims are
 * refused. Live provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from open T-US-011 behavior acceptance
 * (`CONNECT_GOOGLE_ADS_ANALYZE_ONLY`) — this records the complete F06 flow
 * evidence package, not the analyze-only save/reload summary alone.
 * Distinct from T-US-012 (`GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED`) —
 * cross-tier refuse gate, not the full connect evidence set.
 */

import {
  GoogleAdsAccessTier,
  type GoogleAdsAccessTierValue,
} from "./google-ads-test-production-access.js";

export const REQUIRED_GOOGLE_ADS_GRANT_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
] as const;

export const GoogleAdsCapability = {
  ANALYZE_ONLY: "ANALYZE_ONLY",
  WRITE: "WRITE",
} as const;

export type GoogleAdsCapabilityValue =
  (typeof GoogleAdsCapability)[keyof typeof GoogleAdsCapability];

export type GoogleAdsProjectAccessEvidence = {
  /** Google Cloud project id (redacted evidence — name only). */
  projectId: string;
  /** Access tier for the Ads login / credential surface. */
  accessTier: GoogleAdsAccessTierValue;
  /** Access requirements reviewed before authorize. */
  accessRequirementsReviewed: boolean;
};

export type GoogleAdsConnectionIdentity = {
  subject: string;
  grantScopes: readonly string[];
};

export type GoogleAdsAccountBinding = {
  clientCustomerId: string;
  managerCustomerId: string | null;
  /** Account badge must match project access tier for honesty. */
  accountTier: GoogleAdsAccessTierValue;
  displayName: string;
};

export type GoogleAdsCampaignSnapshot = {
  campaignId: string;
  name: string;
  status: "ENABLED" | "PAUSED" | "REMOVED";
};

export type GoogleAdsConversionAction = {
  conversionActionId: string;
  name: string;
  category: string;
};

export type GoogleAdsEventMapping = {
  conversionActionId: string;
  businessOutcome: string;
  mapped: boolean;
  /** Required when mapped=false — discrepancy tasks stay explicit. */
  discrepancyReason: string | null;
};

export type GoogleAdsReadReceipt = {
  providerRequestId: string;
  readAtIso: string;
  sourceWatermark: string;
};

export type GoogleAdsReadReadyStatus = {
  status: "READ_READY";
  capability: typeof GoogleAdsCapability.ANALYZE_ONLY;
  writeAuthorized: false;
  spendingAuthorityEnabled: false;
};

export type ConnectGoogleAdsControlledAnalysisInput = {
  packageId: string;
  projectAccess: GoogleAdsProjectAccessEvidence;
  connectionIdentity: GoogleAdsConnectionIdentity;
  /** Consent plus application-level deny-write rule recorded. */
  denyWriteConsent: boolean;
  accountBinding: GoogleAdsAccountBinding;
  campaigns: readonly GoogleAdsCampaignSnapshot[];
  conversionActions: readonly GoogleAdsConversionAction[];
  eventMappings: readonly GoogleAdsEventMapping[];
  readReceipt: GoogleAdsReadReceipt;
  readReady: GoogleAdsReadReadyStatus;
  /** Attempt a write/spend-capable save — must refuse (analyze-only). */
  attemptWriteSave: boolean;
  /** Claim the F06 path is live-verified — must refuse offline. */
  claimLiveVerifiedAds: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type ConnectGoogleAdsControlledAnalysisDecision =
  | {
      allowed: true;
      code: "CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        projectId: string;
        accessTier: GoogleAdsAccessTierValue;
        accountTierBadge: string;
        accessRequirementsReviewed: true;
        connectionSubject: string;
        grantScopeCount: number;
        denyWriteConsent: true;
        clientCustomerId: string;
        managerCustomerId: string | null;
        campaignCount: number;
        conversionActionCount: number;
        mappedConversionCount: number;
        discrepancyTaskCount: number;
        discrepancyTasks: string[];
        readProviderRequestId: string;
        readReceiptAtIso: string;
        sourceWatermark: string;
        readReadyStatus: "READ_READY";
        capability: "ANALYZE_ONLY";
        writeAuthorized: false;
        spendingAuthorityEnabled: false;
        adsVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F06_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "GOOGLE_ADS_CONNECTION_RECORDED_ANALYZE_ONLY";
        recoveryPath: "KEEP_ANALYZE_ONLY_EXPOSE_MAPPING_DISCREPANCIES";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "PROJECT_ACCESS_REQUIRED"
        | "CONNECTION_IDENTITY_REQUIRED"
        | "DENY_WRITE_CONSENT_REQUIRED"
        | "ACCOUNT_BINDING_REQUIRED"
        | "PRODUCTION_TIER_ON_FIXTURE_REFUSED"
        | "INVENTORY_REQUIRED"
        | "EVENT_MAPPING_REQUIRED"
        | "READ_RECEIPT_REQUIRED"
        | "READ_READY_REQUIRED"
        | "WRITE_SAVE_REFUSED"
        | "FALSE_LIVE_VERIFIED_ADS_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        projectId: string | null;
        accessTier: string | null;
        accountTierBadge: string | null;
        accessRequirementsReviewed: boolean;
        connectionSubject: string | null;
        grantScopeCount: number;
        denyWriteConsent: boolean;
        clientCustomerId: string | null;
        managerCustomerId: string | null;
        campaignCount: number;
        conversionActionCount: number;
        mappedConversionCount: number;
        discrepancyTaskCount: number;
        discrepancyTasks: string[];
        readProviderRequestId: string | null;
        readReceiptAtIso: string | null;
        sourceWatermark: string | null;
        readReadyStatus: string | null;
        capability: string | null;
        writeAuthorized: false;
        spendingAuthorityEnabled: false;
        adsVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_PROJECT_ACCESS"
          | "AWAITING_CONNECTION_IDENTITY"
          | "AWAITING_DENY_WRITE_CONSENT"
          | "AWAITING_ACCOUNT_BINDING"
          | "AWAITING_INVENTORY"
          | "AWAITING_EVENT_MAPPING"
          | "AWAITING_READ_RECEIPT"
          | "AWAITING_READ_READY";
        recoveryPath:
          | "REVIEW_PROJECT_AND_ACCESS_TIER"
          | "AUTHORIZE_GOOGLE_IDENTITY_WITH_ADS_SCOPES"
          | "RECORD_DENY_WRITE_CONSENT"
          | "BIND_CLIENT_CUSTOMER_AND_MANAGER"
          | "FETCH_CAMPAIGNS_AND_CONVERSION_ACTIONS"
          | "MAP_CONVERSIONS_TO_EVENT_DICTIONARY"
          | "RECORD_READ_RECEIPT_AND_SOURCE_WATERMARK"
          | "SAVE_ANALYZE_ONLY_WRITE_DISABLED"
          | "KEEP_ANALYZE_ONLY_EXPOSE_MAPPING_DISCREPANCIES";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_RELATED_CASE_IDS = [
  "T-F06",
] as const;

function accountTierBadge(tier: GoogleAdsAccessTierValue): string {
  return tier === GoogleAdsAccessTier.TEST
    ? "TEST (fixture analyze-only)"
    : "PRODUCTION (live mutate NOT_WIRED)";
}

function discrepancyTasks(
  mappings: readonly GoogleAdsEventMapping[],
): string[] {
  return mappings
    .filter((m) => !m.mapped)
    .map(
      (m) =>
        `map conversion ${m.conversionActionId}: ${m.discrepancyReason?.trim() || "unmapped"}`,
    );
}

function preservedInputCount(
  input: ConnectGoogleAdsControlledAnalysisInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.projectAccess.projectId.trim() ? 1 : 0) +
    (input.connectionIdentity.subject.trim() ? 1 : 0) +
    (input.accountBinding.clientCustomerId.trim() ? 1 : 0) +
    (input.readReceipt.sourceWatermark.trim() ? 1 : 0) +
    (input.readReady.status === "READ_READY" ? 1 : 0)
  );
}

function projectAccessOk(p: GoogleAdsProjectAccessEvidence): boolean {
  return (
    p.projectId.trim().length > 0 &&
    (p.accessTier === GoogleAdsAccessTier.TEST ||
      p.accessTier === GoogleAdsAccessTier.PRODUCTION) &&
    p.accessRequirementsReviewed === true
  );
}

function connectionIdentityOk(id: GoogleAdsConnectionIdentity): boolean {
  return (
    id.subject.trim().length > 0 &&
    id.grantScopes.length > 0 &&
    id.grantScopes.every((s) => s.trim().length > 0) &&
    REQUIRED_GOOGLE_ADS_GRANT_SCOPES.every((required) =>
      id.grantScopes.includes(required),
    )
  );
}

function accountBindingOk(b: GoogleAdsAccountBinding): boolean {
  return (
    b.clientCustomerId.trim().length > 0 &&
    b.displayName.trim().length > 0 &&
    (b.accountTier === GoogleAdsAccessTier.TEST ||
      b.accountTier === GoogleAdsAccessTier.PRODUCTION) &&
    (b.managerCustomerId === null || b.managerCustomerId.trim().length > 0)
  );
}

function inventoryOk(
  campaigns: readonly GoogleAdsCampaignSnapshot[],
  conversions: readonly GoogleAdsConversionAction[],
): boolean {
  if (campaigns.length === 0 || conversions.length === 0) return false;
  const campaignIds = campaigns.map((c) => c.campaignId.trim());
  const conversionIds = conversions.map((c) => c.conversionActionId.trim());
  if (campaignIds.some((id) => !id) || conversionIds.some((id) => !id)) {
    return false;
  }
  if (
    new Set(campaignIds).size !== campaignIds.length ||
    new Set(conversionIds).size !== conversionIds.length
  ) {
    return false;
  }
  return (
    campaigns.every((c) => c.name.trim().length > 0) &&
    conversions.every(
      (c) => c.name.trim().length > 0 && c.category.trim().length > 0,
    )
  );
}

function eventMappingsOk(
  mappings: readonly GoogleAdsEventMapping[],
  conversions: readonly GoogleAdsConversionAction[],
): boolean {
  if (mappings.length === 0) return false;
  const conversionIds = new Set(
    conversions.map((c) => c.conversionActionId.trim()),
  );
  return mappings.every((m) => {
    if (
      !m.conversionActionId.trim() ||
      !conversionIds.has(m.conversionActionId.trim()) ||
      !m.businessOutcome.trim()
    ) {
      return false;
    }
    if (!m.mapped) {
      return (
        m.discrepancyReason !== null && m.discrepancyReason.trim().length > 0
      );
    }
    return true;
  });
}

function readReceiptOk(r: GoogleAdsReadReceipt): boolean {
  return (
    r.providerRequestId.trim().length > 0 &&
    r.readAtIso.trim().length > 0 &&
    r.sourceWatermark.trim().length > 0
  );
}

function readReadyOk(r: GoogleAdsReadReadyStatus): boolean {
  return (
    r.status === "READ_READY" &&
    r.capability === GoogleAdsCapability.ANALYZE_ONLY &&
    r.writeAuthorized === false &&
    r.spendingAuthorityEnabled === false
  );
}

/**
 * Evaluate the T-F06 connect-google-ads-controlled-analysis path offline.
 * Complete F06 evidence package → CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectGoogleAdsControlledAnalysis(
  input: ConnectGoogleAdsControlledAnalysisInput,
): ConnectGoogleAdsControlledAnalysisDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const mappedConversionCount = input.eventMappings.filter(
    (m) => m.mapped,
  ).length;
  const tasks = discrepancyTasks(input.eventMappings);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_PROJECT_ACCESS"
      | "AWAITING_CONNECTION_IDENTITY"
      | "AWAITING_DENY_WRITE_CONSENT"
      | "AWAITING_ACCOUNT_BINDING"
      | "AWAITING_INVENTORY"
      | "AWAITING_EVENT_MAPPING"
      | "AWAITING_READ_RECEIPT"
      | "AWAITING_READ_READY",
    recoveryPath:
      | "REVIEW_PROJECT_AND_ACCESS_TIER"
      | "AUTHORIZE_GOOGLE_IDENTITY_WITH_ADS_SCOPES"
      | "RECORD_DENY_WRITE_CONSENT"
      | "BIND_CLIENT_CUSTOMER_AND_MANAGER"
      | "FETCH_CAMPAIGNS_AND_CONVERSION_ACTIONS"
      | "MAP_CONVERSIONS_TO_EVENT_DICTIONARY"
      | "RECORD_READ_RECEIPT_AND_SOURCE_WATERMARK"
      | "SAVE_ANALYZE_ONLY_WRITE_DISABLED"
      | "KEEP_ANALYZE_ONLY_EXPOSE_MAPPING_DISCREPANCIES",
  ): NonNullable<
    Extract<
      ConnectGoogleAdsControlledAnalysisDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    projectId: input.projectAccess.projectId.trim() || null,
    accessTier: input.projectAccess.accessTier || null,
    accountTierBadge: input.accountBinding.accountTier
      ? accountTierBadge(input.accountBinding.accountTier)
      : null,
    accessRequirementsReviewed: input.projectAccess.accessRequirementsReviewed,
    connectionSubject: input.connectionIdentity.subject.trim() || null,
    grantScopeCount: input.connectionIdentity.grantScopes.length,
    denyWriteConsent: input.denyWriteConsent,
    clientCustomerId: input.accountBinding.clientCustomerId.trim() || null,
    managerCustomerId: input.accountBinding.managerCustomerId,
    campaignCount: input.campaigns.length,
    conversionActionCount: input.conversionActions.length,
    mappedConversionCount,
    discrepancyTaskCount: tasks.length,
    discrepancyTasks: [...tasks],
    readProviderRequestId: input.readReceipt.providerRequestId.trim() || null,
    readReceiptAtIso: input.readReceipt.readAtIso.trim() || null,
    sourceWatermark: input.readReceipt.sourceWatermark.trim() || null,
    readReadyStatus: input.readReady.status || null,
    capability: input.readReady.capability || null,
    writeAuthorized: false,
    spendingAuthorityEnabled: false,
    adsVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live connect-google-ads provider wiring remains NOT_WIRED — refuse live wiring (T-F06)",
      ],
    };
  }

  if (input.claimLiveVerifiedAds) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_ADS_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified Google Ads claim offline (T-F06) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptWriteSave) {
    return {
      allowed: false,
      code: "WRITE_SAVE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "WRITE_SAVE_REFUSED",
        "BLOCKED",
        "SAVE_ANALYZE_ONLY_WRITE_DISABLED",
      ),
      reasons: [
        "Google Ads connection must save as Analyze only — write/spend save refused (T-F06)",
      ],
    };
  }

  if (!input.packageId.trim() || !projectAccessOk(input.projectAccess)) {
    return {
      allowed: false,
      code: "PROJECT_ACCESS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PROJECT_ACCESS_INCOMPLETE",
        "AWAITING_PROJECT_ACCESS",
        "REVIEW_PROJECT_AND_ACCESS_TIER",
      ),
      reasons: [
        "F06 requires project id, access tier, and reviewed access requirements (T-F06)",
      ],
    };
  }

  if (!connectionIdentityOk(input.connectionIdentity)) {
    return {
      allowed: false,
      code: "CONNECTION_IDENTITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CONNECTION_IDENTITY_INCOMPLETE",
        "AWAITING_CONNECTION_IDENTITY",
        "AUTHORIZE_GOOGLE_IDENTITY_WITH_ADS_SCOPES",
      ),
      reasons: [
        "F06 requires Google identity subject and Ads grant scopes (T-F06)",
      ],
    };
  }

  if (!input.denyWriteConsent) {
    return {
      allowed: false,
      code: "DENY_WRITE_CONSENT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DENY_WRITE_CONSENT_MISSING",
        "AWAITING_DENY_WRITE_CONSENT",
        "RECORD_DENY_WRITE_CONSENT",
      ),
      reasons: [
        "Consent plus application-level deny-write rule required before analyze-only bind (T-F06)",
      ],
    };
  }

  if (!accountBindingOk(input.accountBinding)) {
    return {
      allowed: false,
      code: "ACCOUNT_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ACCOUNT_BINDING_INCOMPLETE",
        "AWAITING_ACCOUNT_BINDING",
        "BIND_CLIENT_CUSTOMER_AND_MANAGER",
      ),
      reasons: [
        "F06 requires client customer binding with TEST/PRODUCTION account badge (T-F06)",
      ],
    };
  }

  // Fixture soak never claims PRODUCTION account tier — use TEST badge.
  if (
    input.projectAccess.accessTier === GoogleAdsAccessTier.PRODUCTION ||
    input.accountBinding.accountTier === GoogleAdsAccessTier.PRODUCTION
  ) {
    return {
      allowed: false,
      code: "PRODUCTION_TIER_ON_FIXTURE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_TIER_ON_FIXTURE_REFUSED",
        "BLOCKED",
        "BIND_CLIENT_CUSTOMER_AND_MANAGER",
      ),
      reasons: [
        "Fixture environment cannot claim PRODUCTION account tier — use TEST badge (T-F06 / T-US-012)",
      ],
    };
  }

  if (
    input.projectAccess.accessTier !== input.accountBinding.accountTier
  ) {
    return {
      allowed: false,
      code: "ACCOUNT_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ACCESS_TIER_ACCOUNT_BADGE_MISMATCH",
        "AWAITING_ACCOUNT_BINDING",
        "BIND_CLIENT_CUSTOMER_AND_MANAGER",
      ),
      reasons: [
        "Project access tier must match account badge for honest F06 binding (T-F06)",
      ],
    };
  }

  if (!inventoryOk(input.campaigns, input.conversionActions)) {
    return {
      allowed: false,
      code: "INVENTORY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INVENTORY_INCOMPLETE",
        "AWAITING_INVENTORY",
        "FETCH_CAMPAIGNS_AND_CONVERSION_ACTIONS",
      ),
      reasons: [
        "F06 requires campaign and conversion-action inventory with unique ids (T-F06)",
      ],
    };
  }

  if (!eventMappingsOk(input.eventMappings, input.conversionActions)) {
    return {
      allowed: false,
      code: "EVENT_MAPPING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVENT_MAPPING_INCOMPLETE",
        "AWAITING_EVENT_MAPPING",
        "MAP_CONVERSIONS_TO_EVENT_DICTIONARY",
      ),
      reasons: [
        "F06 requires conversion→event mapping; unmapped actions need explicit discrepancyReason (T-F06)",
      ],
    };
  }

  if (!readReceiptOk(input.readReceipt)) {
    return {
      allowed: false,
      code: "READ_RECEIPT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "READ_RECEIPT_INCOMPLETE",
        "AWAITING_READ_RECEIPT",
        "RECORD_READ_RECEIPT_AND_SOURCE_WATERMARK",
      ),
      reasons: [
        "F06 requires read receipt with provider request ID and source watermark (T-F06)",
      ],
    };
  }

  if (!readReadyOk(input.readReady)) {
    return {
      allowed: false,
      code: "READ_READY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "READ_READY_INCOMPLETE",
        "AWAITING_READ_READY",
        "SAVE_ANALYZE_ONLY_WRITE_DISABLED",
      ),
      reasons: [
        "F06 requires READ_READY Analyze-only status with write and spending disabled (T-F06)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      projectId: input.projectAccess.projectId.trim(),
      accessTier: input.projectAccess.accessTier,
      accountTierBadge: accountTierBadge(input.accountBinding.accountTier),
      accessRequirementsReviewed: true,
      connectionSubject: input.connectionIdentity.subject.trim(),
      grantScopeCount: input.connectionIdentity.grantScopes.length,
      denyWriteConsent: true,
      clientCustomerId: input.accountBinding.clientCustomerId.trim(),
      managerCustomerId: input.accountBinding.managerCustomerId,
      campaignCount: input.campaigns.length,
      conversionActionCount: input.conversionActions.length,
      mappedConversionCount,
      discrepancyTaskCount: tasks.length,
      discrepancyTasks: [...tasks],
      readProviderRequestId: input.readReceipt.providerRequestId.trim(),
      readReceiptAtIso: input.readReceipt.readAtIso.trim(),
      sourceWatermark: input.readReceipt.sourceWatermark.trim(),
      readReadyStatus: "READ_READY",
      capability: "ANALYZE_ONLY",
      writeAuthorized: false,
      spendingAuthorityEnabled: false,
      adsVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F06_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "GOOGLE_ADS_CONNECTION_RECORDED_ANALYZE_ONLY",
      recoveryPath: "KEEP_ANALYZE_ONLY_EXPOSE_MAPPING_DISCREPANCIES",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F06 evidence package recorded (project+access tier, identity+scopes, deny-write consent, client/manager bind+TEST badge, campaigns+conversions, event mapping+discrepancies, read receipt+watermark, READ_READY Analyze-only); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
