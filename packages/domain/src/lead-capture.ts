/**
 * M5 / NEXT-16 — lead capture protection + bounded repair bridge.
 *
 * Browser/form → fixture CRM → verify → cleanup; on delivery failure →
 * incident → bounded repair → re-verify. Pure types + helpers. No network.
 * Live Zoho stays NOT_WIRED. External effects: none.
 */

import type { CanaryIntent, CanaryRemoteReceipt, ProbeVerdictValue } from "./monitoring.js";
import type { IncidentRecord, RepairProposal, RepairTicket } from "./repair.js";

export const LeadCaptureStage = {
  BROWSER: "browser",
  FORM_ACCEPT: "form_accept",
  CRM_WRITE: "crm_write",
  VERIFY: "verify",
  CLEANUP: "cleanup",
  INCIDENT: "incident",
  REPAIR: "repair",
  REVERIFY: "reverify",
} as const;

export type LeadCaptureStageValue =
  (typeof LeadCaptureStage)[keyof typeof LeadCaptureStage];

export const LeadCaptureJourneyStatus = {
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REPAIRING: "REPAIRING",
  RECOVERED: "RECOVERED",
  ESCALATED: "ESCALATED",
  CLEANED: "CLEANED",
} as const;

export type LeadCaptureJourneyStatusValue =
  (typeof LeadCaptureJourneyStatus)[keyof typeof LeadCaptureJourneyStatus];

export const CleanupStatus = {
  PENDING: "pending",
  DONE: "done",
  SKIPPED: "skipped",
  FAILED: "failed",
} as const;

export type CleanupStatusValue =
  (typeof CleanupStatus)[keyof typeof CleanupStatus];

export type LeadCaptureArtifactRefs = {
  screenshotId: string | null;
  traceId: string | null;
  htmlSnapshotId: string | null;
};

export type LeadCaptureFailure = {
  stage: LeadCaptureStageValue;
  verdict: ProbeVerdictValue | "FAILURE";
  details: string[];
  atIso: string;
};

export type LeadCaptureRepairLink = {
  incidentId: string;
  ticketId: string | null;
  proposalId: string | null;
  state: string;
  /** Bounded repair attempts for this journey (max 2). */
  attemptCount: number;
};

export type LeadCaptureCleanupRecord = {
  status: CleanupStatusValue;
  cleanedRecordId: string | null;
  cleanedAtIso: string | null;
  details: string[];
};

export type LeadCaptureJourney = {
  journeyId: string;
  correlationId: string;
  status: LeadCaptureJourneyStatusValue;
  stagesCompleted: LeadCaptureStageValue[];
  lastSuccessAtIso: string | null;
  currentFailure: LeadCaptureFailure | null;
  submission: CanaryIntent | null;
  crmReceipt: CanaryRemoteReceipt | null;
  artifactRefs: LeadCaptureArtifactRefs;
  repair: LeadCaptureRepairLink | null;
  cleanup: LeadCaptureCleanupRecord;
  durableOperationId: string | null;
  probeRunId: string | null;
  gatewayDecisionId: string | null;
  fieldVerifyPassed: boolean | null;
  commercialExcluded: true;
  fixtureOnly: true;
  playwrightMode: "FIXTURE" | "OPTIONAL_LIVE" | "NOT_WIRED";
  liveZohoWiring: "NOT_WIRED";
  createdAtIso: string;
  updatedAtIso: string;
};

export type CommerceLeadRow = {
  recordId: string;
  synthetic: boolean;
  revenueMinor: number;
  countedInCommerce: boolean;
};

export type CommerceTotalsProjection = {
  leadCount: number;
  revenueMinor: number;
  bookingCount: number;
  syntheticExcludedCount: number;
  /** Revenue that stayed on the ledger but was projected out of commerce. */
  syntheticExcludedRevenueMinor: number;
  rows: CommerceLeadRow[];
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
};

export type LeadCaptureState = {
  version: 1;
  updatedAtIso: string;
  journeys: LeadCaptureJourney[];
  cleanupEvents: Array<{
    cleanupId: string;
    correlationId: string;
    receiptId: string;
    recordId: string | null;
    cleanedAtIso: string;
  }>;
  /** Fixture commerce ledger — synthetics never contribute to totals. */
  commerceLeads: CommerceLeadRow[];
  liveZohoWiring: "NOT_WIRED";
  playwrightWiring: "FIXTURE" | "OPTIONAL_LIVE" | "NOT_WIRED";
  temporalWiring: "NOT_WIRED";
  r1CompleteClaim: false;
};

export const LEAD_CAPTURE_RELATED_CASE_IDS = [
  "T-F20",
  "T-F21",
  "T-US-020",
  "T-US-040",
  "T-X052",
] as const;

export function emptyLeadCaptureState(nowIso: string): LeadCaptureState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    journeys: [],
    cleanupEvents: [],
    commerceLeads: [],
    liveZohoWiring: "NOT_WIRED",
    playwrightWiring: "FIXTURE",
    temporalWiring: "NOT_WIRED",
    r1CompleteClaim: false,
  };
}

export function createLeadCaptureJourney(input: {
  journeyId: string;
  correlationId: string;
  createdAtIso: string;
  playwrightMode?: LeadCaptureJourney["playwrightMode"];
}): LeadCaptureJourney {
  if (!input.correlationId.trim()) {
    throw new Error("Lead capture journey requires correlationId");
  }
  return {
    journeyId: input.journeyId,
    correlationId: input.correlationId,
    status: LeadCaptureJourneyStatus.RUNNING,
    stagesCompleted: [],
    lastSuccessAtIso: null,
    currentFailure: null,
    submission: null,
    crmReceipt: null,
    artifactRefs: {
      screenshotId: null,
      traceId: null,
      htmlSnapshotId: null,
    },
    repair: null,
    cleanup: {
      status: CleanupStatus.PENDING,
      cleanedRecordId: null,
      cleanedAtIso: null,
      details: [],
    },
    durableOperationId: null,
    probeRunId: null,
    gatewayDecisionId: null,
    fieldVerifyPassed: null,
    commercialExcluded: true,
    fixtureOnly: true,
    playwrightMode: input.playwrightMode ?? "FIXTURE",
    liveZohoWiring: "NOT_WIRED",
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export function markStageComplete(
  journey: LeadCaptureJourney,
  stage: LeadCaptureStageValue,
  nowIso: string,
): LeadCaptureJourney {
  const stagesCompleted = journey.stagesCompleted.includes(stage)
    ? journey.stagesCompleted
    : [...journey.stagesCompleted, stage];
  return {
    ...journey,
    stagesCompleted,
    updatedAtIso: nowIso,
  };
}

export function markJourneyFailure(
  journey: LeadCaptureJourney,
  failure: LeadCaptureFailure,
): LeadCaptureJourney {
  return {
    ...journey,
    status: LeadCaptureJourneyStatus.FAILED,
    currentFailure: failure,
    updatedAtIso: failure.atIso,
  };
}

export function markJourneySuccess(
  journey: LeadCaptureJourney,
  nowIso: string,
): LeadCaptureJourney {
  return {
    ...journey,
    status: LeadCaptureJourneyStatus.SUCCESS,
    lastSuccessAtIso: nowIso,
    currentFailure: null,
    updatedAtIso: nowIso,
  };
}

/**
 * Project commerce totals — synthetic canary / conversion contaminants are
 * never counted (T-X052). Defense-in-depth: even a slipped
 * synthetic+countedInCommerce row is projected out. Live NOT_WIRED.
 */
export function projectCommerceTotals(
  leads: readonly CommerceLeadRow[],
): CommerceTotalsProjection {
  const commercial = leads.filter((l) => !l.synthetic && l.countedInCommerce);
  const synthetics = leads.filter((l) => l.synthetic);
  return {
    leadCount: commercial.length,
    revenueMinor: commercial.reduce((n, l) => n + l.revenueMinor, 0),
    bookingCount: 0,
    syntheticExcludedCount: synthetics.length,
    syntheticExcludedRevenueMinor: synthetics.reduce(
      (n, l) => n + l.revenueMinor,
      0,
    ),
    rows: [...leads],
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
  };
}

export function appendCommerceLead(
  state: LeadCaptureState,
  lead: CommerceLeadRow,
  nowIso: string,
): LeadCaptureState {
  if (lead.synthetic && lead.countedInCommerce) {
    throw new Error(
      "Synthetic canary leads must not be marked countedInCommerce",
    );
  }
  return {
    ...state,
    commerceLeads: [...state.commerceLeads, lead],
    updatedAtIso: nowIso,
  };
}

/** Required CRM fields for fixture canary verification. */
export const REQUIRED_CANARY_CRM_FIELDS = [
  "Email",
  "Last_Name",
  "ws_synthetic",
  "ws_correlation_id",
] as const;

export type CrmFieldVerifyResult = {
  passed: boolean;
  missingFields: string[];
  mismatchedFields: string[];
  details: string[];
};

export function verifyCanaryCrmFields(input: {
  expected: Record<string, string>;
  observed: Record<string, string>;
  correlationId: string;
}): CrmFieldVerifyResult {
  const missingFields: string[] = [];
  const mismatchedFields: string[] = [];
  const details: string[] = [];

  for (const field of REQUIRED_CANARY_CRM_FIELDS) {
    if (!(field in input.observed) || !String(input.observed[field] ?? "").trim()) {
      missingFields.push(field);
    }
  }

  if (input.observed.ws_synthetic !== "true") {
    mismatchedFields.push("ws_synthetic");
    details.push("ws_synthetic must be 'true' for canary leads");
  }
  if (input.observed.ws_correlation_id !== input.correlationId) {
    mismatchedFields.push("ws_correlation_id");
    details.push("ws_correlation_id does not match journey correlation");
  }
  if (
    input.expected.Email &&
    input.observed.Email &&
    input.observed.Email !== input.expected.Email
  ) {
    mismatchedFields.push("Email");
    details.push("Email field mismatch vs submission");
  }
  if (
    input.expected.Last_Name &&
    input.observed.Last_Name &&
    input.observed.Last_Name !== input.expected.Last_Name
  ) {
    mismatchedFields.push("Last_Name");
    details.push("Last_Name field mismatch vs submission");
  }
  if (
    input.observed.Email &&
    !String(input.observed.Email).includes(input.correlationId)
  ) {
    mismatchedFields.push("Email");
    details.push("Email must embed correlation id for synthetic sink");
  }
  if (
    input.observed.Email &&
    !String(input.observed.Email).endsWith("@worksocial.test.local")
  ) {
    mismatchedFields.push("Email");
    details.push("Email must use controlled @worksocial.test.local sink");
  }

  const passed = missingFields.length === 0 && mismatchedFields.length === 0;
  if (passed) {
    details.push("All required canary CRM fields matched");
  }
  return { passed, missingFields, mismatchedFields, details };
}

export function linkRepairToJourney(
  journey: LeadCaptureJourney,
  link: LeadCaptureRepairLink,
  nowIso: string,
): LeadCaptureJourney {
  return {
    ...journey,
    status: LeadCaptureJourneyStatus.REPAIRING,
    repair: {
      ...link,
      attemptCount: link.attemptCount ?? 0,
    },
    stagesCompleted: journey.stagesCompleted.includes(LeadCaptureStage.INCIDENT)
      ? journey.stagesCompleted
      : [...journey.stagesCompleted, LeadCaptureStage.INCIDENT],
    updatedAtIso: nowIso,
  };
}

/** Stages eligible for CRM delivery repair (not browser/gateway pre-submit failures). */
export const CRM_DELIVERY_FAILURE_STAGES: readonly LeadCaptureStageValue[] = [
  LeadCaptureStage.CRM_WRITE,
  LeadCaptureStage.VERIFY,
  LeadCaptureStage.CLEANUP,
];

export function isCrmDeliveryFailure(
  journey: Pick<LeadCaptureJourney, "currentFailure" | "submission">,
): boolean {
  if (!journey.currentFailure || !journey.submission) {
    return false;
  }
  return CRM_DELIVERY_FAILURE_STAGES.includes(journey.currentFailure.stage);
}

export function summarizeLeadCaptureStatus(state: LeadCaptureState): {
  lastSuccess: {
    journeyId: string;
    correlationId: string;
    atIso: string;
    recordId: string | null;
  } | null;
  currentFailure: LeadCaptureFailure & { journeyId: string; correlationId: string } | null;
  openRepairCount: number;
  journeyCount: number;
  commerce: CommerceTotalsProjection;
  liveZohoWiring: "NOT_WIRED";
  playwrightWiring: LeadCaptureState["playwrightWiring"];
  temporalWiring: "NOT_WIRED";
  r1CompleteClaim: false;
  acceptanceCaseIds: readonly string[];
} {
  const successes = state.journeys
    .filter(
      (j) =>
        j.lastSuccessAtIso &&
        (j.status === LeadCaptureJourneyStatus.SUCCESS ||
          j.status === LeadCaptureJourneyStatus.CLEANED ||
          j.status === LeadCaptureJourneyStatus.RECOVERED),
    )
    .sort((a, b) =>
      String(b.lastSuccessAtIso).localeCompare(String(a.lastSuccessAtIso)),
    );
  const last = successes[0] ?? null;
  // Keep unresolved failures visible while REPAIRING (until recovered/cleared).
  const failures = state.journeys
    .filter(
      (j) =>
        j.currentFailure &&
        (j.status === LeadCaptureJourneyStatus.FAILED ||
          j.status === LeadCaptureJourneyStatus.REPAIRING ||
          j.status === LeadCaptureJourneyStatus.ESCALATED),
    )
    .sort((a, b) =>
      String(b.currentFailure?.atIso).localeCompare(
        String(a.currentFailure?.atIso),
      ),
    );
  const fail = failures[0] ?? null;
  const openRepairCount = state.journeys.filter(
    (j) =>
      j.repair &&
      (j.status === LeadCaptureJourneyStatus.REPAIRING ||
        j.status === LeadCaptureJourneyStatus.FAILED),
  ).length;

  return {
    lastSuccess: last
      ? {
          journeyId: last.journeyId,
          correlationId: last.correlationId,
          atIso: last.lastSuccessAtIso!,
          recordId: last.crmReceipt?.recordId ?? null,
        }
      : null,
    currentFailure: fail?.currentFailure
      ? {
          ...fail.currentFailure,
          journeyId: fail.journeyId,
          correlationId: fail.correlationId,
        }
      : null,
    openRepairCount,
    journeyCount: state.journeys.length,
    commerce: projectCommerceTotals(state.commerceLeads),
    liveZohoWiring: "NOT_WIRED",
    playwrightWiring: state.playwrightWiring,
    temporalWiring: "NOT_WIRED",
    r1CompleteClaim: false,
    acceptanceCaseIds: LEAD_CAPTURE_RELATED_CASE_IDS,
  };
}

/** Type helpers for incident bridge callers. */
export type DeliveryFailureIncidentBundle = {
  incident: IncidentRecord;
  ticket: RepairTicket;
  proposal: RepairProposal;
};
