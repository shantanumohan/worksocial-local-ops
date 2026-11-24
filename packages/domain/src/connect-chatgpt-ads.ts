/**
 * T-F07 / T-US-013 / T-US-014 — Connect ChatGPT Ads (fixture Analyze-only).
 *
 * Offline fixture gate: choose Ads (not organic / model API), broker-held
 * masked credential, account identity read, conversion sources + campaign
 * associations, bounded performance window, Analyze-only + write denial,
 * access-blocked when transport/entitlement/auth missing, watermarks +
 * pending-data labels, measurement readiness. Identity mismatch refuses bind
 * (T-US-014). Live ChatGPT Ads mutate stays NOT_WIRED. Pure domain — no
 * network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-F06 / T-US-011 (Google Ads) and T-X034 (test project vs
 * production). Gate `chatgpt_ads_transport_entitlement` retained on all three.
 */

import {
  AnalyticsEnvironment,
  evaluateChatGptAdsAccess,
  type AnalyticsEnvironmentValue,
} from "./analytics.js";
import {
  ConnectionState,
  VerificationState,
  WriteReadiness,
  buildProviderStatusView,
  type ProviderStatusView,
} from "./connection-status.js";
import { PaidMediaWiring, type PaidMediaWiringValue } from "./paid-media.js";

export const ChatGptAdsIntegrationType = {
  CHATGPT_ADS: "CHATGPT_ADS",
  CHATGPT_ORGANIC: "CHATGPT_ORGANIC",
  MODEL_API: "MODEL_API",
} as const;

export type ChatGptAdsIntegrationTypeValue =
  (typeof ChatGptAdsIntegrationType)[keyof typeof ChatGptAdsIntegrationType];

export const ChatGptAdsCredentialKind = {
  ADS_API_KEY: "ADS_API_KEY",
  MODEL_API_KEY: "MODEL_API_KEY",
  SUBSCRIPTION: "SUBSCRIPTION",
} as const;

export type ChatGptAdsCredentialKindValue =
  (typeof ChatGptAdsCredentialKind)[keyof typeof ChatGptAdsCredentialKind];

export const ChatGptAdsCapability = {
  ANALYZE_ONLY: "ANALYZE_ONLY",
  WRITE: "WRITE",
} as const;

export type ChatGptAdsCapabilityValue =
  (typeof ChatGptAdsCapability)[keyof typeof ChatGptAdsCapability];

export type ChatGptAdsBrokerCredential = {
  /** Broker-held reference — masked; never a raw secret. */
  brokerRef: string;
  credentialKind: ChatGptAdsCredentialKindValue;
  /** True when the value looks like a raw secret (must refuse). */
  looksLikeRawSecret: boolean;
};

export type ChatGptAdsAccountIdentity = {
  intendedAccountId: string;
  returnedAccountId: string;
  displayName: string;
  currency: string;
};

export type ChatGptAdsConversionSource = {
  sourceId: string;
  name: string;
  category: string;
};

export type ChatGptAdsCampaignAssociation = {
  campaignId: string;
  name: string;
  status: "ENABLED" | "PAUSED" | "REMOVED";
  conversionSourceIds: readonly string[];
};

export type ChatGptAdsPerformanceWindow = {
  startIso: string;
  endIso: string;
  bounded: true;
};

export type ChatGptAdsMeasurementChecklist = {
  conversionSourcesInspected: boolean;
  campaignAssociationsInspected: boolean;
  reportingDelayVisible: boolean;
  measurementGapsVisible: boolean;
  escalationOwnerChosen: boolean;
};

export type ChatGptAdsReadReadyStatus = {
  status: "READ_READY";
  capability: typeof ChatGptAdsCapability.ANALYZE_ONLY;
  writeAuthorized: false;
  spendingAuthorityEnabled: false;
};

export type ConnectChatGptAdsInput = {
  packageId: string;
  integrationType: ChatGptAdsIntegrationTypeValue;
  localTransportVerified: boolean;
  entitlementVerified: boolean;
  authVerified: boolean;
  credential: ChatGptAdsBrokerCredential;
  accountIdentity: ChatGptAdsAccountIdentity;
  conversionSources: readonly ChatGptAdsConversionSource[];
  campaignAssociations: readonly ChatGptAdsCampaignAssociation[];
  performanceWindow: ChatGptAdsPerformanceWindow;
  sourceWatermark: string;
  pendingMetricLabels: readonly string[];
  measurementChecklist: ChatGptAdsMeasurementChecklist;
  readReady: ChatGptAdsReadReadyStatus;
  environment: AnalyticsEnvironmentValue;
  attemptWriteSave: boolean;
  claimLiveVerifiedAds: boolean;
  requestLiveProviderWiring: boolean;
};

export type ConnectChatGptAdsDecision =
  | {
      allowed: true;
      code: "CONNECT_CHATGPT_ADS_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        integrationType: typeof ChatGptAdsIntegrationType.CHATGPT_ADS;
        brokerRefMasked: string;
        credentialKind: typeof ChatGptAdsCredentialKind.ADS_API_KEY;
        intendedAccountId: string;
        returnedAccountId: string;
        currency: string;
        conversionSourceCount: number;
        campaignAssociationCount: number;
        performanceWindowStartIso: string;
        performanceWindowEndIso: string;
        sourceWatermark: string;
        pendingMetricLabels: string[];
        measurementChecklistComplete: true;
        readReadyStatus: "READ_READY";
        capability: "ANALYZE_ONLY";
        writeAuthorized: false;
        spendingAuthorityEnabled: false;
        adsVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F07_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "CHATGPT_ADS_CONNECTION_RECORDED_ANALYZE_ONLY";
        recoveryPath: "KEEP_ANALYZE_ONLY_EXPOSE_PENDING_METRICS";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ADS_TRANSPORT_UNVERIFIED"
        | "ADS_ENTITLEMENT_UNVERIFIED"
        | "ADS_AUTH_UNVERIFIED"
        | "ADS_ACCESS_BLOCKED"
        | "ORGANIC_INTEGRATION_REFUSED"
        | "MODEL_API_INTEGRATION_REFUSED"
        | "MODEL_API_KEY_REFUSED"
        | "SUBSCRIPTION_CREDENTIAL_REFUSED"
        | "BROKER_CREDENTIAL_REQUIRED"
        | "RAW_SECRET_REFUSED"
        | "ACCOUNT_IDENTITY_REQUIRED"
        | "ADS_ACCOUNT_IDENTITY_MISMATCH"
        | "INVENTORY_REQUIRED"
        | "PERFORMANCE_WINDOW_REQUIRED"
        | "SOURCE_WATERMARK_REQUIRED"
        | "MEASUREMENT_CHECKLIST_REQUIRED"
        | "READ_READY_REQUIRED"
        | "LIVE_ENVIRONMENT_REFUSED"
        | "WRITE_SAVE_REFUSED"
        | "FALSE_LIVE_VERIFIED_ADS_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        integrationType: string | null;
        brokerRefMasked: string | null;
        credentialKind: string | null;
        intendedAccountId: string | null;
        returnedAccountId: string | null;
        currency: string | null;
        conversionSourceCount: number;
        campaignAssociationCount: number;
        performanceWindowStartIso: string | null;
        performanceWindowEndIso: string | null;
        sourceWatermark: string | null;
        pendingMetricLabels: string[];
        measurementChecklistComplete: boolean;
        readReadyStatus: string | null;
        capability: string | null;
        writeAuthorized: false;
        spendingAuthorityEnabled: false;
        adsVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "ACCESS_BLOCKED"
          | "AWAITING_BROKER_CREDENTIAL"
          | "AWAITING_ACCOUNT_IDENTITY"
          | "AWAITING_INVENTORY"
          | "AWAITING_PERFORMANCE_WINDOW"
          | "AWAITING_WATERMARK"
          | "AWAITING_MEASUREMENT_CHECKLIST"
          | "AWAITING_READ_READY";
        recoveryPath:
          | "VERIFY_TRANSPORT_ENTITLEMENT_AUTH"
          | "CHOOSE_CHATGPT_ADS_NOT_ORGANIC"
          | "PROVISION_ADS_API_KEY_VIA_BROKER"
          | "RUN_ACCOUNT_IDENTITY_READ"
          | "INSPECT_CONVERSIONS_AND_CAMPAIGNS"
          | "IMPORT_BOUNDED_PERFORMANCE_WINDOW"
          | "RECORD_WATERMARK_AND_PENDING_LABELS"
          | "COMPLETE_MEASUREMENT_CHECKLIST"
          | "SAVE_ANALYZE_ONLY_WRITE_DISABLED"
          | "KEEP_ANALYZE_ONLY_EXPOSE_PENDING_METRICS";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_CHATGPT_ADS_RELATED_CASE_IDS = [
  "T-F07",
  "T-US-013",
  "T-US-014",
] as const;

export const CONNECT_CHATGPT_ADS_READ_READY_RELATED_CASE_IDS = [
  "T-US-013",
  "T-F07",
] as const;

export const CHATGPT_ADS_IDENTITY_MISMATCH_RELATED_CASE_IDS = [
  "T-US-014",
  "T-F07",
] as const;

function maskBrokerRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.length <= 8) return "broker-ref-***";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function preservedInputCount(input: ConnectChatGptAdsInput): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.credential.brokerRef.trim() ? 1 : 0) +
    (input.accountIdentity.intendedAccountId.trim() ? 1 : 0) +
    (input.sourceWatermark.trim() ? 1 : 0) +
    (input.readReady.status === "READ_READY" ? 1 : 0)
  );
}

function checklistComplete(
  c: ChatGptAdsMeasurementChecklist,
): boolean {
  return (
    c.conversionSourcesInspected &&
    c.campaignAssociationsInspected &&
    c.reportingDelayVisible &&
    c.measurementGapsVisible &&
    c.escalationOwnerChosen
  );
}

function inventoryOk(
  sources: readonly ChatGptAdsConversionSource[],
  campaigns: readonly ChatGptAdsCampaignAssociation[],
): boolean {
  if (sources.length === 0 || campaigns.length === 0) return false;
  const sourceIds = sources.map((s) => s.sourceId.trim());
  const campaignIds = campaigns.map((c) => c.campaignId.trim());
  if (sourceIds.some((id) => !id) || campaignIds.some((id) => !id)) return false;
  if (
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(campaignIds).size !== campaignIds.length
  ) {
    return false;
  }
  const sourceSet = new Set(sourceIds);
  return (
    sources.every((s) => s.name.trim() && s.category.trim()) &&
    campaigns.every(
      (c) =>
        c.name.trim() &&
        c.conversionSourceIds.every((id) => sourceSet.has(id.trim())),
    )
  );
}

function windowOk(w: ChatGptAdsPerformanceWindow): boolean {
  return (
    w.bounded === true &&
    w.startIso.trim().length > 0 &&
    w.endIso.trim().length > 0 &&
    w.startIso < w.endIso
  );
}

function readReadyOk(r: ChatGptAdsReadReadyStatus): boolean {
  return (
    r.status === "READ_READY" &&
    r.capability === ChatGptAdsCapability.ANALYZE_ONLY &&
    r.writeAuthorized === false &&
    r.spendingAuthorityEnabled === false
  );
}

/**
 * Evaluate the T-F07 connect-chatgpt-ads path offline.
 * Complete F07 evidence package → CONNECT_CHATGPT_ADS_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectChatGptAds(
  input: ConnectChatGptAdsInput,
): ConnectChatGptAdsDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const pending = [...input.pendingMetricLabels];

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "ACCESS_BLOCKED"
      | "AWAITING_BROKER_CREDENTIAL"
      | "AWAITING_ACCOUNT_IDENTITY"
      | "AWAITING_INVENTORY"
      | "AWAITING_PERFORMANCE_WINDOW"
      | "AWAITING_WATERMARK"
      | "AWAITING_MEASUREMENT_CHECKLIST"
      | "AWAITING_READ_READY",
    recoveryPath:
      | "VERIFY_TRANSPORT_ENTITLEMENT_AUTH"
      | "CHOOSE_CHATGPT_ADS_NOT_ORGANIC"
      | "PROVISION_ADS_API_KEY_VIA_BROKER"
      | "RUN_ACCOUNT_IDENTITY_READ"
      | "INSPECT_CONVERSIONS_AND_CAMPAIGNS"
      | "IMPORT_BOUNDED_PERFORMANCE_WINDOW"
      | "RECORD_WATERMARK_AND_PENDING_LABELS"
      | "COMPLETE_MEASUREMENT_CHECKLIST"
      | "SAVE_ANALYZE_ONLY_WRITE_DISABLED"
      | "KEEP_ANALYZE_ONLY_EXPOSE_PENDING_METRICS",
  ): NonNullable<
    Extract<ConnectChatGptAdsDecision, { allowed: false }>["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    integrationType: input.integrationType || null,
    brokerRefMasked: input.credential.brokerRef.trim()
      ? maskBrokerRef(input.credential.brokerRef)
      : null,
    credentialKind: input.credential.credentialKind || null,
    intendedAccountId: input.accountIdentity.intendedAccountId.trim() || null,
    returnedAccountId: input.accountIdentity.returnedAccountId.trim() || null,
    currency: input.accountIdentity.currency.trim() || null,
    conversionSourceCount: input.conversionSources.length,
    campaignAssociationCount: input.campaignAssociations.length,
    performanceWindowStartIso: input.performanceWindow.startIso.trim() || null,
    performanceWindowEndIso: input.performanceWindow.endIso.trim() || null,
    sourceWatermark: input.sourceWatermark.trim() || null,
    pendingMetricLabels: pending,
    measurementChecklistComplete: checklistComplete(input.measurementChecklist),
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
        "Live ChatGPT Ads provider wiring remains NOT_WIRED — refuse live wiring (T-F07)",
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
        "Refused false live-verified ChatGPT Ads claim offline (T-F07) — fixture ACCEPTED ≠ VERIFIED",
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
        "ChatGPT Ads connection must save as Analyze only — write/spend save refused (T-F07 / T-US-013)",
      ],
    };
  }

  if (input.environment === AnalyticsEnvironment.LIVE) {
    return {
      allowed: false,
      code: "LIVE_ENVIRONMENT_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "LIVE_ENVIRONMENT_REFUSED",
        "BLOCKED",
        "VERIFY_TRANSPORT_ENTITLEMENT_AUTH",
      ),
      reasons: [
        "Live ChatGPT Ads connect refused — live mutate remains NOT_WIRED (T-F07)",
      ],
    };
  }

  const access = evaluateChatGptAdsAccess({
    localTransportVerified: input.localTransportVerified,
    entitlementVerified: input.entitlementVerified,
    authVerified: input.authVerified,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment:
      input.environment === AnalyticsEnvironment.FIXTURE ||
      input.environment === AnalyticsEnvironment.SANDBOX
        ? AnalyticsEnvironment.FIXTURE
        : input.environment,
  });
  if (!access.allowed) {
    const code =
      access.code === "ADS_TRANSPORT_UNVERIFIED" ||
      access.code === "ADS_ENTITLEMENT_UNVERIFIED" ||
      access.code === "ADS_AUTH_UNVERIFIED"
        ? access.code
        : "ADS_ACCESS_BLOCKED";
    return {
      allowed: false,
      code,
      ...base,
      evidence: blockedEvidence(
        code,
        "ACCESS_BLOCKED",
        "VERIFY_TRANSPORT_ENTITLEMENT_AUTH",
      ),
      reasons: [
        ...access.reasons,
        "ChatGPT Ads access-blocked when transport/entitlement/auth missing (T-F07 / T-US-013)",
      ],
    };
  }

  if (input.integrationType === ChatGptAdsIntegrationType.CHATGPT_ORGANIC) {
    return {
      allowed: false,
      code: "ORGANIC_INTEGRATION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "ORGANIC_INTEGRATION_REFUSED",
        "BLOCKED",
        "CHOOSE_CHATGPT_ADS_NOT_ORGANIC",
      ),
      reasons: [
        "Must choose ChatGPT Ads, not ChatGPT organic presence (T-F07)",
      ],
    };
  }

  if (input.integrationType === ChatGptAdsIntegrationType.MODEL_API) {
    return {
      allowed: false,
      code: "MODEL_API_INTEGRATION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "MODEL_API_INTEGRATION_REFUSED",
        "BLOCKED",
        "CHOOSE_CHATGPT_ADS_NOT_ORGANIC",
      ),
      reasons: [
        "Must choose ChatGPT Ads integration — model API is not Ads (T-F07)",
      ],
    };
  }

  if (input.integrationType !== ChatGptAdsIntegrationType.CHATGPT_ADS) {
    return {
      allowed: false,
      code: "ORGANIC_INTEGRATION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "INTEGRATION_TYPE_REQUIRED",
        "BLOCKED",
        "CHOOSE_CHATGPT_ADS_NOT_ORGANIC",
      ),
      reasons: ["F07 requires integration type CHATGPT_ADS (T-F07)"],
    };
  }

  if (!input.packageId.trim() || !input.credential.brokerRef.trim()) {
    return {
      allowed: false,
      code: "BROKER_CREDENTIAL_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BROKER_CREDENTIAL_INCOMPLETE",
        "AWAITING_BROKER_CREDENTIAL",
        "PROVISION_ADS_API_KEY_VIA_BROKER",
      ),
      reasons: [
        "F07 requires broker-held masked credential reference — no raw secret in UI (T-F07)",
      ],
    };
  }

  if (input.credential.looksLikeRawSecret) {
    return {
      allowed: false,
      code: "RAW_SECRET_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "RAW_SECRET_REFUSED",
        "AWAITING_BROKER_CREDENTIAL",
        "PROVISION_ADS_API_KEY_VIA_BROKER",
      ),
      reasons: [
        "Raw Ads credential refused — provision via protected broker with masked reference (T-F07)",
      ],
    };
  }

  if (input.credential.credentialKind === ChatGptAdsCredentialKind.MODEL_API_KEY) {
    return {
      allowed: false,
      code: "MODEL_API_KEY_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "MODEL_API_KEY_REFUSED",
        "AWAITING_BROKER_CREDENTIAL",
        "PROVISION_ADS_API_KEY_VIA_BROKER",
      ),
      reasons: [
        "Model API key cannot bind ChatGPT Ads — Ads API key required (T-F07 / T-US-014)",
      ],
    };
  }

  if (input.credential.credentialKind === ChatGptAdsCredentialKind.SUBSCRIPTION) {
    return {
      allowed: false,
      code: "SUBSCRIPTION_CREDENTIAL_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "SUBSCRIPTION_CREDENTIAL_REFUSED",
        "AWAITING_BROKER_CREDENTIAL",
        "PROVISION_ADS_API_KEY_VIA_BROKER",
      ),
      reasons: [
        "Subscription credential cannot bind ChatGPT Ads — Ads API key required (T-F07)",
      ],
    };
  }

  if (input.credential.credentialKind !== ChatGptAdsCredentialKind.ADS_API_KEY) {
    return {
      allowed: false,
      code: "BROKER_CREDENTIAL_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ADS_API_KEY_REQUIRED",
        "AWAITING_BROKER_CREDENTIAL",
        "PROVISION_ADS_API_KEY_VIA_BROKER",
      ),
      reasons: ["F07 requires Ads API key credential kind (T-F07)"],
    };
  }

  if (
    !input.accountIdentity.intendedAccountId.trim() ||
    !input.accountIdentity.returnedAccountId.trim() ||
    !input.accountIdentity.displayName.trim() ||
    !input.accountIdentity.currency.trim()
  ) {
    return {
      allowed: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ACCOUNT_IDENTITY_INCOMPLETE",
        "AWAITING_ACCOUNT_IDENTITY",
        "RUN_ACCOUNT_IDENTITY_READ",
      ),
      reasons: [
        "F07 requires account identity read with intended/returned ids and currency (T-F07)",
      ],
    };
  }

  if (
    input.accountIdentity.intendedAccountId.trim() !==
    input.accountIdentity.returnedAccountId.trim()
  ) {
    return {
      allowed: false,
      code: "ADS_ACCOUNT_IDENTITY_MISMATCH",
      ...base,
      evidence: blockedEvidence(
        "ADS_ACCOUNT_IDENTITY_MISMATCH",
        "AWAITING_ACCOUNT_IDENTITY",
        "RUN_ACCOUNT_IDENTITY_READ",
      ),
      reasons: [
        "ChatGPT Ads key/account identity mismatch refuses bind (T-US-014 / T-F07)",
      ],
    };
  }

  if (!inventoryOk(input.conversionSources, input.campaignAssociations)) {
    return {
      allowed: false,
      code: "INVENTORY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INVENTORY_INCOMPLETE",
        "AWAITING_INVENTORY",
        "INSPECT_CONVERSIONS_AND_CAMPAIGNS",
      ),
      reasons: [
        "F07 requires conversion sources and campaign associations with unique ids (T-F07)",
      ],
    };
  }

  if (!windowOk(input.performanceWindow)) {
    return {
      allowed: false,
      code: "PERFORMANCE_WINDOW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PERFORMANCE_WINDOW_INCOMPLETE",
        "AWAITING_PERFORMANCE_WINDOW",
        "IMPORT_BOUNDED_PERFORMANCE_WINDOW",
      ),
      reasons: [
        "F07 requires a bounded performance window with start < end (T-F07)",
      ],
    };
  }

  if (!input.sourceWatermark.trim() || input.pendingMetricLabels.length === 0) {
    return {
      allowed: false,
      code: "SOURCE_WATERMARK_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "WATERMARK_OR_PENDING_LABELS_MISSING",
        "AWAITING_WATERMARK",
        "RECORD_WATERMARK_AND_PENDING_LABELS",
      ),
      reasons: [
        "F07 requires source watermark and pending-data labels for reporting delays (T-F07)",
      ],
    };
  }

  if (!checklistComplete(input.measurementChecklist)) {
    return {
      allowed: false,
      code: "MEASUREMENT_CHECKLIST_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MEASUREMENT_CHECKLIST_INCOMPLETE",
        "AWAITING_MEASUREMENT_CHECKLIST",
        "COMPLETE_MEASUREMENT_CHECKLIST",
      ),
      reasons: [
        "F07 requires measurement-readiness checklist including escalation owner (T-F07)",
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
        "F07 requires READ_READY Analyze-only status with write and spending disabled (T-F07 / T-US-013)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CONNECT_CHATGPT_ADS_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      integrationType: ChatGptAdsIntegrationType.CHATGPT_ADS,
      brokerRefMasked: maskBrokerRef(input.credential.brokerRef),
      credentialKind: ChatGptAdsCredentialKind.ADS_API_KEY,
      intendedAccountId: input.accountIdentity.intendedAccountId.trim(),
      returnedAccountId: input.accountIdentity.returnedAccountId.trim(),
      currency: input.accountIdentity.currency.trim(),
      conversionSourceCount: input.conversionSources.length,
      campaignAssociationCount: input.campaignAssociations.length,
      performanceWindowStartIso: input.performanceWindow.startIso.trim(),
      performanceWindowEndIso: input.performanceWindow.endIso.trim(),
      sourceWatermark: input.sourceWatermark.trim(),
      pendingMetricLabels: pending,
      measurementChecklistComplete: true,
      readReadyStatus: "READ_READY",
      capability: "ANALYZE_ONLY",
      writeAuthorized: false,
      spendingAuthorityEnabled: false,
      adsVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F07_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "CHATGPT_ADS_CONNECTION_RECORDED_ANALYZE_ONLY",
      recoveryPath: "KEEP_ANALYZE_ONLY_EXPOSE_PENDING_METRICS",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F07 evidence package recorded (Ads not organic; broker-masked Ads API key; account identity; conversions+campaigns; bounded window; watermark+pending labels; measurement checklist; READ_READY Analyze-only); live NOT_WIRED; externalEffects NONE",
    ],
  };
}

/** Convenience fixture F07 input (never LIVE). */
export function fixtureConnectChatGptAdsInput(overrides?: {
  packageId?: string;
  integrationType?: ChatGptAdsIntegrationTypeValue;
  localTransportVerified?: boolean;
  entitlementVerified?: boolean;
  authVerified?: boolean;
  credentialKind?: ChatGptAdsCredentialKindValue;
  brokerRef?: string;
  looksLikeRawSecret?: boolean;
  intendedAccountId?: string;
  returnedAccountId?: string;
  environment?: AnalyticsEnvironmentValue;
  attemptWriteSave?: boolean;
  claimLiveVerifiedAds?: boolean;
  requestLiveProviderWiring?: boolean;
  sourceWatermark?: string;
  pendingMetricLabels?: readonly string[];
  conversionSources?: readonly ChatGptAdsConversionSource[];
  campaignAssociations?: readonly ChatGptAdsCampaignAssociation[];
}): ConnectChatGptAdsInput {
  const intended =
    overrides?.intendedAccountId ?? "ads-mgr-fixture-acct-07";
  return {
    packageId: overrides?.packageId ?? "pkg-f07-fixture",
    integrationType:
      overrides?.integrationType ?? ChatGptAdsIntegrationType.CHATGPT_ADS,
    localTransportVerified: overrides?.localTransportVerified ?? true,
    entitlementVerified: overrides?.entitlementVerified ?? true,
    authVerified: overrides?.authVerified ?? true,
    credential: {
      brokerRef: overrides?.brokerRef ?? "broker-ref-chatgpt-ads-f07-abcd1234",
      credentialKind:
        overrides?.credentialKind ?? ChatGptAdsCredentialKind.ADS_API_KEY,
      looksLikeRawSecret: overrides?.looksLikeRawSecret ?? false,
    },
    accountIdentity: {
      intendedAccountId: intended,
      returnedAccountId: overrides?.returnedAccountId ?? intended,
      displayName: "Fixture ChatGPT Ads Manager",
      currency: "USD",
    },
    conversionSources: overrides?.conversionSources ?? [
      {
        sourceId: "conv-src-lead-07",
        name: "generate_lead",
        category: "SUBMIT_LEAD_FORM",
      },
      {
        sourceId: "conv-src-tour-07",
        name: "tour_request",
        category: "CONTACT",
      },
    ],
    campaignAssociations: overrides?.campaignAssociations ?? [
      {
        campaignId: "camp-chatgpt-search-07",
        name: "Fixture ChatGPT search — coworking",
        status: "ENABLED",
        conversionSourceIds: ["conv-src-lead-07"],
      },
      {
        campaignId: "camp-chatgpt-promo-07",
        name: "Fixture ChatGPT promo — tours",
        status: "PAUSED",
        conversionSourceIds: ["conv-src-tour-07"],
      },
    ],
    performanceWindow: {
      startIso: "2026-11-01T00:00:00.000Z",
      endIso: "2026-11-14T23:59:59.000Z",
      bounded: true,
    },
    sourceWatermark:
      overrides?.sourceWatermark ?? "fixture-chatgpt-ads-wm-f07",
    pendingMetricLabels: overrides?.pendingMetricLabels ?? [
      "conversions_pending_attribution",
      "same_day_spend_incomplete",
    ],
    measurementChecklist: {
      conversionSourcesInspected: true,
      campaignAssociationsInspected: true,
      reportingDelayVisible: true,
      measurementGapsVisible: true,
      escalationOwnerChosen: true,
    },
    readReady: {
      status: "READ_READY",
      capability: ChatGptAdsCapability.ANALYZE_ONLY,
      writeAuthorized: false,
      spendingAuthorityEnabled: false,
    },
    environment: overrides?.environment ?? AnalyticsEnvironment.FIXTURE,
    attemptWriteSave: overrides?.attemptWriteSave ?? false,
    claimLiveVerifiedAds: overrides?.claimLiveVerifiedAds ?? false,
    requestLiveProviderWiring: overrides?.requestLiveProviderWiring ?? false,
  };
}

// ─── T-US-013 analyze-only save/reload ───────────────────────────────────────

export type ChatGptAdsAnalyzeOnlyInput = {
  nowIso: string;
  connectionId: string;
  localTransportVerified: boolean;
  entitlementVerified: boolean;
  authVerified: boolean;
  brokerRef: string;
  looksLikeRawSecret: boolean;
  credentialKind: ChatGptAdsCredentialKindValue;
  accountId: string;
  currency: string;
  environment: AnalyticsEnvironmentValue;
  conversionSources: readonly ChatGptAdsConversionSource[];
  campaignAssociations: readonly ChatGptAdsCampaignAssociation[];
  capability: ChatGptAdsCapabilityValue;
  sourceWatermark: string;
  pendingMetricLabels: readonly string[];
};

export type ChatGptAdsAnalyzeOnlyBinding = {
  connectionId: string;
  accountId: string;
  currency: string;
  brokerRefMasked: string;
  capability: typeof ChatGptAdsCapability.ANALYZE_ONLY;
  connectionState: typeof ConnectionState.READ_READY;
  writeReadiness: typeof WriteReadiness.NOT_AUTHORIZED;
  writeDisabled: true;
  spendingAuthorityEnabled: false;
  status: ProviderStatusView;
  conversionSourceCount: number;
  campaignAssociationCount: number;
  pendingMetricLabels: string[];
  wiring: PaidMediaWiringValue;
  liveMutationWiring: "NOT_WIRED";
  environment: AnalyticsEnvironmentValue;
  readReceiptAtIso: string;
  sourceWatermark: string;
  externalEffects: "NONE";
  reasons: string[];
};

export type ChatGptAdsAnalyzeOnlyResult =
  | ({ ok: true } & ChatGptAdsAnalyzeOnlyBinding)
  | {
      ok: false;
      code:
        | "WRITE_CAPABILITY_REFUSED"
        | "ADS_TRANSPORT_UNVERIFIED"
        | "ADS_ENTITLEMENT_UNVERIFIED"
        | "ADS_AUTH_UNVERIFIED"
        | "ADS_ACCESS_BLOCKED"
        | "LIVE_TRANSPORT_NOT_WIRED"
        | "ENVIRONMENT_UNAVAILABLE"
        | "MODEL_API_KEY_REFUSED"
        | "BROKER_CREDENTIAL_REQUIRED"
        | "RAW_SECRET_REFUSED"
        | "MISSING_ACCOUNT"
        | "INVENTORY_EMPTY"
        | "MISSING_SOURCE_WATERMARK";
      reasons: string[];
      externalEffects: "NONE";
      writeDisabled: true;
      spendingAuthorityEnabled: false;
    };

/** In-memory fixture repository — proves binding survives save→reload. */
export type ChatGptAdsAnalyzeOnlyFixtureStore = {
  byConnectionId: Map<string, ChatGptAdsAnalyzeOnlyBinding>;
};

export function createChatGptAdsAnalyzeOnlyFixtureStore(): ChatGptAdsAnalyzeOnlyFixtureStore {
  return { byConnectionId: new Map() };
}

export function persistChatGptAdsAnalyzeOnlyBinding(
  store: ChatGptAdsAnalyzeOnlyFixtureStore,
  binding: ChatGptAdsAnalyzeOnlyBinding,
): ChatGptAdsAnalyzeOnlyBinding {
  const copy: ChatGptAdsAnalyzeOnlyBinding = {
    ...binding,
    pendingMetricLabels: [...binding.pendingMetricLabels],
    reasons: [...binding.reasons],
    status: { ...binding.status, labels: { ...binding.status.labels } },
  };
  store.byConnectionId.set(copy.connectionId, copy);
  return copy;
}

export function loadChatGptAdsAnalyzeOnlyBinding(
  store: ChatGptAdsAnalyzeOnlyFixtureStore,
  connectionId: string,
): ChatGptAdsAnalyzeOnlyBinding | null {
  const found = store.byConnectionId.get(connectionId);
  if (!found) return null;
  return {
    ...found,
    pendingMetricLabels: [...found.pendingMetricLabels],
    reasons: [...found.reasons],
    status: { ...found.status, labels: { ...found.status.labels } },
  };
}

/**
 * Save a fixture ChatGPT Ads connection as analyze-only with write disabled
 * (T-US-013). Transport/entitlement/auth gates required. Never authorizes
 * spend mutations or live transport.
 */
export function saveChatGptAdsAnalyzeOnlyConnection(
  input: ChatGptAdsAnalyzeOnlyInput,
): ChatGptAdsAnalyzeOnlyResult {
  if (input.capability === ChatGptAdsCapability.WRITE) {
    return {
      ok: false,
      code: "WRITE_CAPABILITY_REFUSED",
      reasons: [
        "ChatGPT Ads initial capability must be Analyze only — spending / mutate authority disabled (T-US-013)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  const access = evaluateChatGptAdsAccess({
    localTransportVerified: input.localTransportVerified,
    entitlementVerified: input.entitlementVerified,
    authVerified: input.authVerified,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment:
      input.environment === AnalyticsEnvironment.LIVE
        ? AnalyticsEnvironment.LIVE
        : AnalyticsEnvironment.FIXTURE,
  });
  if (!access.allowed) {
    const code =
      access.code === "ADS_TRANSPORT_UNVERIFIED" ||
      access.code === "ADS_ENTITLEMENT_UNVERIFIED" ||
      access.code === "ADS_AUTH_UNVERIFIED" ||
      access.code === "ADS_LIVE_NOT_WIRED"
        ? access.code === "ADS_LIVE_NOT_WIRED"
          ? "LIVE_TRANSPORT_NOT_WIRED"
          : access.code
        : "ADS_ACCESS_BLOCKED";
    return {
      ok: false,
      code,
      reasons: [
        ...access.reasons,
        "Transport/entitlement/auth gate required for ChatGPT Ads read-ready (T-US-013)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (input.environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      reasons: [
        "Live ChatGPT Ads connect refused — live Ads query/mutate transport remains NOT_WIRED",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (
    input.environment === AnalyticsEnvironment.NOT_WIRED ||
    input.environment === AnalyticsEnvironment.UNAVAILABLE
  ) {
    return {
      ok: false,
      code: "ENVIRONMENT_UNAVAILABLE",
      reasons: [
        `Environment ${input.environment} cannot supply ChatGPT Ads inventory — refuse READ_READY`,
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.brokerRef.trim()) {
    return {
      ok: false,
      code: "BROKER_CREDENTIAL_REQUIRED",
      reasons: ["Broker-held masked credential reference required (T-US-013)"],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (input.looksLikeRawSecret) {
    return {
      ok: false,
      code: "RAW_SECRET_REFUSED",
      reasons: [
        "Raw Ads credential refused — provision via protected broker (T-US-013)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (input.credentialKind !== ChatGptAdsCredentialKind.ADS_API_KEY) {
    return {
      ok: false,
      code: "MODEL_API_KEY_REFUSED",
      reasons: [
        "Only Ads API key binds ChatGPT Ads — model/subscription credentials refused (T-US-013)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.accountId.trim()) {
    return {
      ok: false,
      code: "MISSING_ACCOUNT",
      reasons: ["Account id required for ChatGPT Ads binding"],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.sourceWatermark.trim() || input.pendingMetricLabels.length === 0) {
    return {
      ok: false,
      code: "MISSING_SOURCE_WATERMARK",
      reasons: [
        "Source watermark and pending-data labels required for ChatGPT Ads read receipt (T-US-013)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (
    input.conversionSources.length === 0 ||
    input.campaignAssociations.length === 0
  ) {
    return {
      ok: false,
      code: "INVENTORY_EMPTY",
      reasons: [
        "Bounded conversion sources and campaign associations required for analyze-only readiness",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  const status = buildProviderStatusView({
    providerId: "chatgpt_ads",
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.ACCEPTED_PENDING,
  });

  const brokerRefMasked = maskBrokerRef(input.brokerRef);
  const sourceWatermark = input.sourceWatermark.trim();
  const pendingMetricLabels = [...input.pendingMetricLabels];

  return {
    ok: true,
    connectionId: input.connectionId,
    accountId: input.accountId.trim(),
    currency: input.currency.trim() || "USD",
    brokerRefMasked,
    capability: ChatGptAdsCapability.ANALYZE_ONLY,
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    writeDisabled: true,
    spendingAuthorityEnabled: false,
    status,
    conversionSourceCount: input.conversionSources.length,
    campaignAssociationCount: input.campaignAssociations.length,
    pendingMetricLabels,
    wiring: PaidMediaWiring.FIXTURE,
    liveMutationWiring: "NOT_WIRED",
    environment: input.environment,
    readReceiptAtIso: input.nowIso,
    sourceWatermark,
    externalEffects: "NONE",
    reasons: [
      `ChatGPT Ads account ${input.accountId.trim()} bound as READ_READY / ANALYZE_ONLY`,
      `Broker ref masked=${brokerRefMasked}; currency=${input.currency.trim() || "USD"}`,
      `Conversions=${input.conversionSources.length}; campaigns=${input.campaignAssociations.length}; pendingLabels=${pendingMetricLabels.length}`,
      `Read receipt at ${input.nowIso}; source watermark=${sourceWatermark}`,
      "Spending authority disabled — write denial recorded; transport/entitlement gate retained",
      "Acceptance pending — not live VERIFIED; externalEffects=NONE",
    ],
  };
}

export function fixtureChatGptAdsAnalyzeOnlyInput(overrides?: {
  nowIso?: string;
  connectionId?: string;
  capability?: ChatGptAdsCapabilityValue;
  environment?: AnalyticsEnvironmentValue;
  localTransportVerified?: boolean;
  entitlementVerified?: boolean;
  authVerified?: boolean;
  credentialKind?: ChatGptAdsCredentialKindValue;
  brokerRef?: string;
  looksLikeRawSecret?: boolean;
  accountId?: string;
  sourceWatermark?: string;
  pendingMetricLabels?: readonly string[];
}): ChatGptAdsAnalyzeOnlyInput {
  const base = fixtureConnectChatGptAdsInput();
  return {
    nowIso: overrides?.nowIso ?? "2026-11-22T20:00:00.000Z",
    connectionId: overrides?.connectionId ?? "chatgpt-ads-conn-fixture-013",
    localTransportVerified: overrides?.localTransportVerified ?? true,
    entitlementVerified: overrides?.entitlementVerified ?? true,
    authVerified: overrides?.authVerified ?? true,
    brokerRef: overrides?.brokerRef ?? base.credential.brokerRef,
    looksLikeRawSecret: overrides?.looksLikeRawSecret ?? false,
    credentialKind:
      overrides?.credentialKind ?? ChatGptAdsCredentialKind.ADS_API_KEY,
    accountId: overrides?.accountId ?? base.accountIdentity.intendedAccountId,
    currency: base.accountIdentity.currency,
    environment: overrides?.environment ?? AnalyticsEnvironment.FIXTURE,
    conversionSources: base.conversionSources,
    campaignAssociations: base.campaignAssociations,
    capability: overrides?.capability ?? ChatGptAdsCapability.ANALYZE_ONLY,
    sourceWatermark:
      overrides?.sourceWatermark ?? "fixture-chatgpt-ads-wm-013",
    pendingMetricLabels: overrides?.pendingMetricLabels ?? [
      "conversions_pending_attribution",
    ],
  };
}

// ─── T-US-014 identity mismatch refuses bind ─────────────────────────────────

export type ChatGptAdsIdentityBindInput = {
  localTransportVerified: boolean;
  entitlementVerified: boolean;
  authVerified: boolean;
  credentialKind: ChatGptAdsCredentialKindValue;
  intendedAccountId: string;
  returnedAccountId: string;
  environment: AnalyticsEnvironmentValue;
};

export type ChatGptAdsIdentityBindDecision =
  | {
      allowed: true;
      code: "ADS_ACCOUNT_IDENTITY_MATCH_FIXTURE_BIND";
      bindRefused: false;
      fixtureOnly: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ADS_ACCOUNT_IDENTITY_MISMATCH"
        | "ADS_TRANSPORT_UNVERIFIED"
        | "ADS_ENTITLEMENT_UNVERIFIED"
        | "ADS_AUTH_UNVERIFIED"
        | "ADS_ACCESS_BLOCKED"
        | "MODEL_API_KEY_REFUSED"
        | "LIVE_TRANSPORT_NOT_WIRED"
        | "ACCOUNT_IDENTITY_REQUIRED";
      bindRefused: true;
      fixtureOnly: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      reasons: string[];
    };

/**
 * Evaluate ChatGPT Ads key/account identity bind (T-US-014).
 * Intended vs returned account mismatch → ADS_ACCOUNT_IDENTITY_MISMATCH /
 * bind refused. Match → ok for fixture bind receipt only (never live VERIFIED).
 */
export function evaluateChatGptAdsIdentityBind(
  input: ChatGptAdsIdentityBindInput,
): ChatGptAdsIdentityBindDecision {
  const base = {
    fixtureOnly: true as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
  };

  if (input.environment === AnalyticsEnvironment.LIVE) {
    return {
      allowed: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      bindRefused: true,
      ...base,
      reasons: [
        "Live ChatGPT Ads identity bind refused — live transport NOT_WIRED (T-US-014)",
      ],
    };
  }

  const access = evaluateChatGptAdsAccess({
    localTransportVerified: input.localTransportVerified,
    entitlementVerified: input.entitlementVerified,
    authVerified: input.authVerified,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment: AnalyticsEnvironment.FIXTURE,
  });
  if (!access.allowed) {
    const code =
      access.code === "ADS_TRANSPORT_UNVERIFIED" ||
      access.code === "ADS_ENTITLEMENT_UNVERIFIED" ||
      access.code === "ADS_AUTH_UNVERIFIED"
        ? access.code
        : "ADS_ACCESS_BLOCKED";
    return {
      allowed: false,
      code,
      bindRefused: true,
      ...base,
      reasons: [
        ...access.reasons,
        "Transport/entitlement gate required before identity bind (T-US-014)",
      ],
    };
  }

  if (input.credentialKind !== ChatGptAdsCredentialKind.ADS_API_KEY) {
    return {
      allowed: false,
      code: "MODEL_API_KEY_REFUSED",
      bindRefused: true,
      ...base,
      reasons: [
        "Model/subscription credential cannot bind Ads account identity (T-US-014)",
      ],
    };
  }

  if (
    !input.intendedAccountId.trim() ||
    !input.returnedAccountId.trim()
  ) {
    return {
      allowed: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
      bindRefused: true,
      ...base,
      reasons: ["Intended and returned account ids required for identity bind"],
    };
  }

  if (
    input.intendedAccountId.trim() !== input.returnedAccountId.trim()
  ) {
    return {
      allowed: false,
      code: "ADS_ACCOUNT_IDENTITY_MISMATCH",
      bindRefused: true,
      ...base,
      reasons: [
        `Intended account ${input.intendedAccountId.trim()} ≠ returned ${input.returnedAccountId.trim()} — bind refused (T-US-014)`,
      ],
    };
  }

  return {
    allowed: true,
    code: "ADS_ACCOUNT_IDENTITY_MATCH_FIXTURE_BIND",
    bindRefused: false,
    ...base,
    reasons: [
      "Account identity match — fixture bind receipt only; live NOT_WIRED; ACCEPTED ≠ VERIFIED",
    ],
  };
}
