/**
 * R1-05 monitoring domain: HTTP/DOM probes, form-to-CRM canaries, reconciliation.
 *
 * Pure types + fail-closed reconciliation. No network, Playwright, or Node APIs.
 * Fixture canaries may produce correlated receipts; live Zoho stays NOT_WIRED
 * until owner credentials exist.
 */

import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  recordWritePathOutcome,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type WritePathOutcomeEvidence,
} from "./production-mapping.js";

export const ProbeKind = {
  HTTP: "http",
  DOM_JOURNEY: "dom_journey",
  FORM_PRESENCE: "form_presence",
  FORM_TO_CRM_CANARY: "form_to_crm_canary",
  INTEGRATION_HEALTH: "integration_health",
} as const;

export type ProbeKindValue = (typeof ProbeKind)[keyof typeof ProbeKind];

export const ProbeMode = {
  FIXTURE: "fixture",
  LIVE: "live",
} as const;

export type ProbeModeValue = (typeof ProbeMode)[keyof typeof ProbeMode];

/** Probe/canary verdict — honest labels only. */
export const ProbeVerdict = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  UNKNOWN: "UNKNOWN",
  NOT_WIRED: "NOT_WIRED",
} as const;

export type ProbeVerdictValue =
  (typeof ProbeVerdict)[keyof typeof ProbeVerdict];

export const ReconciliationStatus = {
  MATCHED: "MATCHED",
  MISSING_REMOTE: "MISSING_REMOTE",
  DUPLICATE_REMOTE: "DUPLICATE_REMOTE",
  FIELD_MISMATCH: "FIELD_MISMATCH",
  AMBIGUOUS: "AMBIGUOUS",
  NOT_WIRED: "NOT_WIRED",
} as const;

export type ReconciliationStatusValue =
  (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];

export type HttpProbeExpectation = {
  /** Expected HTTP status (fixture or live). */
  statusCode: number;
  /** Substrings that must appear in the body (case-sensitive). */
  bodyContains: string[];
  /** Optional max latency ms for live probes; fixture ignores. */
  maxLatencyMs: number | null;
};

export type DomJourneyStep = {
  stepId: string;
  /** Logical selector label (not executed as CSS in domain). */
  target: string;
  action: "assert_visible" | "assert_text" | "assert_href";
  expected: string | null;
};

export type SyntheticLead = {
  correlationId: string;
  email: string;
  displayName: string;
  /** Always true for canaries — never enter commercial totals. */
  synthetic: true;
  /** Sink that must not be a marketing audience. */
  notificationSink: "controlled_internal";
  fieldValues: Record<string, string>;
};

export type CanaryIntent = {
  operationId: string;
  writePathId: string;
  formId: string;
  correlationId: string;
  payloadDigest: string;
  synthetic: true;
  submittedAtIso: string;
};

export type CanaryRemoteReceipt = {
  receiptId: string;
  correlationId: string;
  moduleId: string;
  recordId: string | null;
  synthetic: boolean;
  observedAtIso: string;
  /** Fixture CRM ledger vs live Zoho adapter. */
  source: "fixture_crm" | "live_zoho";
  fieldSnapshot: Record<string, string>;
};

export type ReconciliationResult = {
  status: ReconciliationStatusValue;
  verdict: ProbeVerdictValue;
  intentOperationId: string;
  correlationId: string;
  matchedReceiptIds: string[];
  details: string[];
  /** Fail closed — callers must not retry writes while true. */
  blocksRetry: boolean;
};

export type ProbeEvidenceArtifact = {
  evidenceId: string;
  kind: ProbeKindValue;
  mode: ProbeModeValue;
  summary: string;
  /** Non-secret structured facts (status codes, selectors, correlation ids). */
  facts: Record<string, string | number | boolean | null>;
  recordedAtIso: string;
};

export type ProbeRunRecord = {
  runId: string;
  kind: ProbeKindValue;
  mode: ProbeModeValue;
  targetId: string;
  verdict: ProbeVerdictValue;
  startedAtIso: string;
  finishedAtIso: string;
  evidence: ProbeEvidenceArtifact;
  reconciliation: ReconciliationResult | null;
  /** Linked write-path outcome when SUCCESS/FAILURE labeled for learning. */
  outcomeId: string | null;
  writePathId: string | null;
  operationId: string | null;
  gatewayDecisionId: string | null;
  acceptanceCaseIds: string[];
};

export type MonitoringState = {
  version: 1;
  updatedAtIso: string;
  runs: ProbeRunRecord[];
  /** Fixture CRM receipts keyed for reconciliation demos. */
  fixtureReceipts: CanaryRemoteReceipt[];
  liveZohoWiring: "NOT_WIRED";
  playwrightWiring: "FIXTURE" | "OPTIONAL_LIVE" | "NOT_WIRED";
};

export function emptyMonitoringState(nowIso: string): MonitoringState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    runs: [],
    fixtureReceipts: [],
    liveZohoWiring: "NOT_WIRED",
    playwrightWiring: "FIXTURE",
  };
}

export function createSyntheticLead(input: {
  correlationId: string;
  email?: string;
  displayName?: string;
  fieldValues?: Record<string, string>;
}): SyntheticLead {
  if (!input.correlationId.trim()) {
    throw new Error("Synthetic lead requires a non-empty correlationId");
  }
  const email =
    input.email ?? `canary+${input.correlationId}@worksocial.test.local`;
  const displayName = input.displayName ?? `Canary ${input.correlationId}`;
  return {
    correlationId: input.correlationId,
    email,
    displayName,
    synthetic: true,
    notificationSink: "controlled_internal",
    fieldValues: {
      Email: email,
      Last_Name: displayName,
      ...(input.fieldValues ?? {}),
      ws_synthetic: "true",
      ws_correlation_id: input.correlationId,
    },
  };
}

/**
 * Assert commercial exclusion — synthetic leads must never be treated as revenue.
 */
export function assertSyntheticExcludedFromCommercial(
  lead: Pick<SyntheticLead, "synthetic">,
): void {
  if (lead.synthetic !== true) {
    throw new Error("Canary lead must be flagged synthetic=true");
  }
}

/**
 * Reconcile a canary intent against remote/fixture receipts.
 * Ambiguous outcomes fail closed (blocksRetry=true, verdict UNKNOWN).
 */
export function reconcileCanaryIntent(input: {
  intent: CanaryIntent;
  receipts: readonly CanaryRemoteReceipt[];
  expectedModuleId: string;
  /** When live Zoho is requested but unwired. */
  liveRequested?: boolean;
  liveWired?: boolean;
}): ReconciliationResult {
  const { intent, receipts, expectedModuleId } = input;

  if (input.liveRequested && !input.liveWired) {
    return {
      status: ReconciliationStatus.NOT_WIRED,
      verdict: ProbeVerdict.NOT_WIRED,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [],
      details: [
        "Live Zoho CRM write/read is NOT_WIRED until owner credentials exist",
      ],
      blocksRetry: true,
    };
  }

  if (!intent.synthetic) {
    return {
      status: ReconciliationStatus.AMBIGUOUS,
      verdict: ProbeVerdict.UNKNOWN,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [],
      details: ["Canary intent missing synthetic=true — fail closed"],
      blocksRetry: true,
    };
  }

  const correlated = receipts.filter(
    (r) => r.correlationId === intent.correlationId,
  );

  if (correlated.length === 0) {
    return {
      status: ReconciliationStatus.MISSING_REMOTE,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [],
      details: [
        `No remote/fixture receipt for correlation ${intent.correlationId}`,
      ],
      blocksRetry: true,
    };
  }

  if (correlated.length > 1) {
    return {
      status: ReconciliationStatus.DUPLICATE_REMOTE,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: correlated.map((r) => r.receiptId),
      details: [
        `Expected exactly one receipt; found ${correlated.length} for ${intent.correlationId}`,
      ],
      blocksRetry: true,
    };
  }

  const receipt = correlated[0]!;

  if (!receipt.synthetic) {
    return {
      status: ReconciliationStatus.AMBIGUOUS,
      verdict: ProbeVerdict.UNKNOWN,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: [
        "Receipt is not flagged synthetic — refuse to treat as canary success",
      ],
      blocksRetry: true,
    };
  }

  if (receipt.moduleId !== expectedModuleId) {
    return {
      status: ReconciliationStatus.FIELD_MISMATCH,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: [
        `Module mismatch: expected ${expectedModuleId}, got ${receipt.moduleId}`,
      ],
      blocksRetry: true,
    };
  }

  if (!receipt.recordId) {
    return {
      status: ReconciliationStatus.AMBIGUOUS,
      verdict: ProbeVerdict.UNKNOWN,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: [
        "Receipt lacks durable recordId — ambiguous write; fail closed before retry",
      ],
      blocksRetry: true,
    };
  }

  const expectedEmail = receipt.fieldSnapshot.Email;
  if (!expectedEmail) {
    return {
      status: ReconciliationStatus.FIELD_MISMATCH,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: ["Receipt missing Email field"],
      blocksRetry: true,
    };
  }
  // Email must embed this canary's correlation ID — domain alone is not enough
  // (another canary's address at @worksocial.test.local must not MATCH).
  if (!expectedEmail.includes(intent.correlationId)) {
    return {
      status: ReconciliationStatus.FIELD_MISMATCH,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: [
        "Receipt email does not embed this canary correlation ID — refuse stale/mismatched synthetic identity",
      ],
      blocksRetry: true,
    };
  }
  if (!expectedEmail.endsWith("@worksocial.test.local")) {
    return {
      status: ReconciliationStatus.FIELD_MISMATCH,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: [
        "Receipt email is not a controlled synthetic sink — refuse commercial identity",
      ],
      blocksRetry: true,
    };
  }

  if (receipt.fieldSnapshot.ws_correlation_id !== intent.correlationId) {
    return {
      status: ReconciliationStatus.FIELD_MISMATCH,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId: intent.correlationId,
      matchedReceiptIds: [receipt.receiptId],
      details: [
        `Correlation field mismatch on receipt ${receipt.receiptId}`,
      ],
      blocksRetry: true,
    };
  }

  return {
    status: ReconciliationStatus.MATCHED,
    verdict: ProbeVerdict.SUCCESS,
    intentOperationId: intent.operationId,
    correlationId: intent.correlationId,
    matchedReceiptIds: [receipt.receiptId],
    details: [
      `Matched exactly one synthetic receipt ${receipt.receiptId} / record ${receipt.recordId}`,
    ],
    blocksRetry: false,
  };
}

/**
 * Map probe/canary SUCCESS|FAILURE into write-path learning evidence.
 * UNKNOWN / NOT_WIRED do not become training labels.
 */
export function probeVerdictToOutcomeLabel(
  verdict: ProbeVerdictValue,
): OutcomeLabelValue | null {
  if (verdict === ProbeVerdict.SUCCESS) {
    return OutcomeLabel.SUCCESS;
  }
  if (verdict === ProbeVerdict.FAILURE) {
    return OutcomeLabel.FAILURE;
  }
  return null;
}

export function buildProbeWritePathOutcome(input: {
  outcomeId: string;
  writePathId: string;
  operationId: string;
  verdict: ProbeVerdictValue;
  mode: ProbeModeValue;
  summary: string;
  featureHints?: Record<string, string | number | boolean | null>;
  recordedAtIso: string;
  /** Override source; defaults to journey_verification for canaries / fixture for fixture mode. */
  source?: OutcomeEvidenceSourceValue;
}): WritePathOutcomeEvidence | null {
  const label = probeVerdictToOutcomeLabel(input.verdict);
  if (!label) {
    return null;
  }
  const fixtureOnly = input.mode === ProbeMode.FIXTURE;
  const source =
    input.source ??
    (fixtureOnly
      ? OutcomeEvidenceSource.FIXTURE
      : OutcomeEvidenceSource.JOURNEY_VERIFICATION);

  return recordWritePathOutcome({
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    label,
    source,
    fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.recordedAtIso,
    featureHints: {
      probeVerdict: input.verdict,
      probeMode: input.mode,
      ...(input.featureHints ?? {}),
    },
  });
}

/** Evaluate deterministic HTTP expectations against an observed response. */
export function evaluateHttpProbe(input: {
  observedStatus: number;
  observedBody: string;
  expectation: HttpProbeExpectation;
  latencyMs: number | null;
}): { verdict: ProbeVerdictValue; details: string[] } {
  const details: string[] = [];
  if (input.observedStatus !== input.expectation.statusCode) {
    details.push(
      `Status ${input.observedStatus} ≠ expected ${input.expectation.statusCode}`,
    );
  }
  for (const needle of input.expectation.bodyContains) {
    if (!input.observedBody.includes(needle)) {
      details.push(`Body missing required substring: ${needle}`);
    }
  }
  if (
    input.expectation.maxLatencyMs != null &&
    input.latencyMs != null &&
    input.latencyMs > input.expectation.maxLatencyMs
  ) {
    details.push(
      `Latency ${input.latencyMs}ms exceeds max ${input.expectation.maxLatencyMs}ms`,
    );
  }
  return {
    verdict: details.length === 0 ? ProbeVerdict.SUCCESS : ProbeVerdict.FAILURE,
    details,
  };
}

/** Evaluate fixture DOM journey steps against an HTML document string. */
export function evaluateDomJourneyFixture(input: {
  html: string;
  steps: readonly DomJourneyStep[];
}): { verdict: ProbeVerdictValue; details: string[]; passedStepIds: string[] } {
  const details: string[] = [];
  const passedStepIds: string[] = [];
  for (const step of input.steps) {
    const haystack = input.html;
    if (step.action === "assert_visible") {
      if (!haystack.includes(step.target)) {
        details.push(`Step ${step.stepId}: target not found (${step.target})`);
        continue;
      }
      passedStepIds.push(step.stepId);
      continue;
    }
    if (step.action === "assert_text") {
      const expected = step.expected ?? "";
      if (!haystack.includes(step.target) || !haystack.includes(expected)) {
        details.push(
          `Step ${step.stepId}: text assertion failed for ${step.target}`,
        );
        continue;
      }
      passedStepIds.push(step.stepId);
      continue;
    }
    if (step.action === "assert_href") {
      const expected = step.expected ?? "";
      if (!haystack.includes(step.target) || !haystack.includes(expected)) {
        details.push(
          `Step ${step.stepId}: href assertion failed for ${step.target}`,
        );
        continue;
      }
      passedStepIds.push(step.stepId);
    }
  }
  return {
    verdict: details.length === 0 ? ProbeVerdict.SUCCESS : ProbeVerdict.FAILURE,
    details,
    passedStepIds,
  };
}

/**
 * Gate an SEO/content optimization against CTA journey regression (T-X043).
 * When post-optimization HTML fails the CTA journey, release is blocked —
 * journey regression fails; never silently allowed.
 */
export function evaluateOptimizationCtaJourneyGate(input: {
  /** Rendered page HTML after the proposed optimization. */
  optimizedHtml: string;
  journeySteps: readonly DomJourneyStep[];
}): {
  allowed: boolean;
  code: "JOURNEY_REGRESSION_FAILED" | null;
  reasons: string[];
  journeyVerdict: ProbeVerdictValue;
  failedStepDetails: string[];
} {
  const journey = evaluateDomJourneyFixture({
    html: input.optimizedHtml,
    steps: input.journeySteps,
  });
  if (journey.verdict === ProbeVerdict.SUCCESS) {
    return {
      allowed: true,
      code: null,
      reasons: ["CTA journey regression passed"],
      journeyVerdict: journey.verdict,
      failedStepDetails: [],
    };
  }
  return {
    allowed: false,
    code: "JOURNEY_REGRESSION_FAILED",
    reasons: [
      "Optimization breaks CTA — journey regression failed",
      ...journey.details,
    ],
    journeyVerdict: journey.verdict,
    failedStepDetails: [...journey.details],
  };
}

/** Catalog case ids related to monitoring (do not mark VERIFIED without evidence). */
export const MONITORING_RELATED_CASE_IDS = [
  "T-F20", // form-to-CRM continuous canary journey (catalog)
  "T-US-039", // Form→CRM continuous verify / cadence
  "T-US-040", // thank-you without Zoho record fails at CRM
  "T-X049", // thank-you but no CRM record — fail at delivery
  "T-X001", // host sleeps during scheduled monitoring
  "T-X043", // optimization breaks CTA — journey regression fails
] as const;
