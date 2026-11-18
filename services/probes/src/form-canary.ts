/**
 * Form-to-CRM canary: controlled synthetic lead + gateway grant + correlated receipt.
 * Fixture CRM ledger produces offline receipts. Live Zoho stays NOT_WIRED.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  ActionClass,
  MONITORING_RELATED_CASE_IDS,
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  assertSyntheticExcludedFromCommercial,
  buildProbeWritePathOutcome,
  createSyntheticLead,
  reconcileCanaryIntent,
  type CanaryIntent,
  type CanaryRemoteReceipt,
  type CapabilityGrant,
  type OperatingModeValue,
  type ProbeModeValue,
  type ProbeRunRecord,
  type ProductionMappingState,
  type StandingPolicy,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import {
  createActionGateway,
  digestPayload,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
} from "@worksocial/action-gateway";

export type FormCanaryAuthority = {
  outboundStopped: boolean;
  operatingMode: OperatingModeValue;
  policies: StandingPolicy[];
  grants: CapabilityGrant[];
  productionMapping: ProductionMappingState;
};

export type FormCanaryResult = {
  run: ProbeRunRecord;
  intent: CanaryIntent | null;
  receipt: CanaryRemoteReceipt | null;
  outcome: WritePathOutcomeEvidence | null;
  gatewayAllowed: boolean;
  gatewayDecisionId: string | null;
  gatewayCode: string | null;
  /** Gateway decision fields for authority ledger persistence (API). */
  gatewayDecision: {
    decisionId: string;
    operationId: string;
    payloadDigest: string;
    allowed: boolean;
    code: string | null;
    reason: string;
    grantId: string | null;
    policyId: string | null;
    decidedAtIso: string;
  } | null;
  details: string[];
};

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function fixtureCrmReceipt(input: {
  correlationId: string;
  moduleId: string;
  fieldSnapshot: Record<string, string>;
  nowIso: string;
  /** Inject failure modes for tests. */
  omitRecordId?: boolean;
}): CanaryRemoteReceipt {
  return {
    receiptId: newId("rcpt"),
    correlationId: input.correlationId,
    moduleId: input.moduleId,
    recordId: input.omitRecordId ? null : newId("lead"),
    synthetic: true,
    observedAtIso: input.nowIso,
    source: "fixture_crm",
    fieldSnapshot: input.fieldSnapshot,
  };
}

/**
 * Run an authorized form-to-CRM canary.
 * Requires standing grant + proven ownership/read evidence on the write path.
 */
export function runFormToCrmCanary(input: {
  writePathId?: string;
  mode?: ProbeModeValue;
  nowIso: string;
  authority: FormCanaryAuthority;
  gateway?: ActionGateway;
  /** Request live Zoho (will return NOT_WIRED without credentials). */
  liveZoho?: boolean;
  /** Test hook: skip writing fixture receipt. */
  skipFixtureReceipt?: boolean;
  /** Test hook: ambiguous receipt without recordId. */
  ambiguousReceipt?: boolean;
  targetAccountId?: string;
}): FormCanaryResult {
  const mode = input.mode ?? ProbeMode.FIXTURE;
  const gateway = input.gateway ?? createActionGateway();
  const mapping = input.authority.productionMapping;
  const writePathId =
    input.writePathId ??
    mapping.writePaths.find((p) => p.operation === "submit_form_canary")
      ?.writePathId ??
    null;

  const startedAtIso = input.nowIso;
  const runId = newId("canary");
  const correlationId = newId("corr");
  const operationId = newId("op");
  const details: string[] = [];

  if (!writePathId) {
    const run = baseRun({
      runId,
      mode,
      targetId: "unmapped",
      verdict: ProbeVerdict.FAILURE,
      startedAtIso,
      finishedAtIso: input.nowIso,
      details: ["No form-to-CRM write path mapped"],
      operationId,
    });
    return {
      run,
      intent: null,
      receipt: null,
      outcome: null,
      gatewayAllowed: false,
      gatewayDecisionId: null,
      gatewayCode: "WRITE_PATH_MISSING",
      gatewayDecision: null,
      details: run.evidence.facts.detail
        ? [String(run.evidence.facts.detail)]
        : ["No form-to-CRM write path mapped"],
    };
  }

  const path = mapping.writePaths.find((p) => p.writePathId === writePathId);
  if (!path) {
    const run = baseRun({
      runId,
      mode,
      targetId: writePathId,
      verdict: ProbeVerdict.FAILURE,
      startedAtIso,
      finishedAtIso: input.nowIso,
      details: [`Unknown write path id: ${writePathId}`],
      operationId,
      writePathId,
    });
    return {
      run,
      intent: null,
      receipt: null,
      outcome: null,
      gatewayAllowed: false,
      gatewayDecisionId: null,
      gatewayCode: "WRITE_PATH_MISSING",
      gatewayDecision: null,
      details: [`Unknown write path id: ${writePathId}`],
    };
  }
  const form = path.formId
    ? mapping.forms.find((f) => f.formId === path.formId)
    : undefined;
  const crm = path.crmOwnershipId
    ? mapping.crmOwnership.find((c) => c.crmOwnershipId === path.crmOwnershipId)
    : undefined;

  if (input.liveZoho || mode === ProbeMode.LIVE) {
    const recon = reconcileCanaryIntent({
      intent: {
        operationId,
        writePathId,
        formId: path.formId ?? "unknown",
        correlationId,
        payloadDigest: "n/a",
        synthetic: true,
        submittedAtIso: input.nowIso,
      },
      receipts: [],
      expectedModuleId: crm?.moduleId ?? form?.crmModuleId ?? "Leads",
      liveRequested: true,
      liveWired: false,
    });
    const run = baseRun({
      runId,
      mode: ProbeMode.LIVE,
      targetId: writePathId,
      verdict: ProbeVerdict.NOT_WIRED,
      startedAtIso,
      finishedAtIso: input.nowIso,
      details: recon.details,
      operationId,
      writePathId,
      reconciliation: recon,
    });
    return {
      run,
      intent: null,
      receipt: null,
      outcome: null,
      gatewayAllowed: false,
      gatewayDecisionId: null,
      gatewayCode: "NOT_WIRED",
      gatewayDecision: null,
      details: recon.details,
    };
  }

  const lead = createSyntheticLead({ correlationId });
  assertSyntheticExcludedFromCommercial(lead);

  const payload: Record<string, unknown> = {
    ...lead.fieldValues,
    synthetic: true,
    correlationId,
    commercialExcluded: true,
  };
  const payloadDigest = digestPayload(payload);

  const snapshot: GatewayAuthoritySnapshot = {
    outboundStopped: input.authority.outboundStopped,
    operatingMode: input.authority.operatingMode,
    policies: input.authority.policies,
    grants: input.authority.grants,
    nowIso: input.nowIso,
    productionMapping: mapping,
  };

  const submitted = gateway.submitIntent(
    {
      operationId,
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      channelId: path.channelId,
      targetAccountId: input.targetAccountId ?? "acct-fixture-canary",
      operation: path.operation,
      assetId: path.assetId,
      contentRevision: null,
      writePathId,
      payload,
    },
    snapshot,
  );

  const gatewayDecision = {
    decisionId: submitted.decision.decisionId,
    operationId: submitted.decision.operationId,
    payloadDigest: submitted.decision.payloadDigest,
    allowed: submitted.decision.allowed,
    code: submitted.decision.code,
    reason: submitted.decision.reason,
    grantId: submitted.decision.grantId,
    policyId: submitted.decision.policyId,
    decidedAtIso: submitted.decision.decidedAtIso,
  };

  if (!submitted.decision.allowed) {
    details.push(submitted.decision.reason);
    const run = baseRun({
      runId,
      mode,
      targetId: writePathId,
      verdict: ProbeVerdict.FAILURE,
      startedAtIso,
      finishedAtIso: input.nowIso,
      details,
      operationId,
      writePathId,
      gatewayDecisionId: submitted.decision.decisionId,
    });
    const outcome = buildProbeWritePathOutcome({
      outcomeId: newId("out"),
      writePathId,
      operationId,
      verdict: ProbeVerdict.FAILURE,
      mode,
      summary: `Canary denied by gateway: ${submitted.decision.code ?? submitted.decision.reason}`,
      recordedAtIso: input.nowIso,
      featureHints: {
        gatewayCode: submitted.decision.code,
        stage: "gateway_authorize",
      },
    });
    return {
      run: { ...run, outcomeId: outcome?.outcomeId ?? null },
      intent: null,
      receipt: null,
      outcome,
      gatewayAllowed: false,
      gatewayDecisionId: submitted.decision.decisionId,
      gatewayCode: submitted.decision.code,
      gatewayDecision,
      details,
    };
  }

  const intent: CanaryIntent = {
    operationId,
    writePathId,
    formId: path.formId ?? "unknown",
    correlationId,
    payloadDigest,
    synthetic: true,
    submittedAtIso: input.nowIso,
  };

  let receipt: CanaryRemoteReceipt | null = null;
  if (!input.skipFixtureReceipt) {
    receipt = fixtureCrmReceipt({
      correlationId,
      moduleId: crm?.moduleId ?? form?.crmModuleId ?? "Leads",
      fieldSnapshot: lead.fieldValues,
      nowIso: input.nowIso,
      omitRecordId: input.ambiguousReceipt === true,
    });
  }

  const recon = reconcileCanaryIntent({
    intent,
    receipts: receipt ? [receipt] : [],
    expectedModuleId: crm?.moduleId ?? form?.crmModuleId ?? "Leads",
  });
  details.push(...recon.details);

  // Gateway acceptance is not verification — mark verified only after matched reconciliation.
  let gatewayDecisionId = submitted.decision.decisionId;
  if (recon.verdict === ProbeVerdict.SUCCESS && receipt) {
    const verified = gateway.markVerified(operationId, input.nowIso);
    gatewayDecisionId = verified.decisionId;
  }

  const outcome = buildProbeWritePathOutcome({
    outcomeId: newId("out"),
    writePathId,
    operationId,
    verdict: recon.verdict,
    mode,
    summary: details.join("; ") || `Canary ${recon.verdict}`,
    recordedAtIso: input.nowIso,
    featureHints: {
      reconciliationStatus: recon.status,
      correlationId,
      synthetic: true,
      commercialExcluded: true,
      stage: "form_to_crm_canary",
    },
  });

  const run = baseRun({
    runId,
    mode,
    targetId: writePathId,
    verdict: recon.verdict,
    startedAtIso,
    finishedAtIso: input.nowIso,
    details,
    operationId,
    writePathId,
    gatewayDecisionId,
    reconciliation: recon,
    outcomeId: outcome?.outcomeId ?? null,
  });

  return {
    run,
    intent,
    receipt,
    outcome,
    gatewayAllowed: true,
    gatewayDecisionId,
    gatewayCode: null,
    gatewayDecision: {
      ...gatewayDecision,
      decisionId: gatewayDecisionId,
    },
    details,
  };
}

/** Deterministic digest helper exported for tests. */
export function hashCanaryPayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function baseRun(input: {
  runId: string;
  mode: ProbeModeValue;
  targetId: string;
  verdict: ProbeRunRecord["verdict"];
  startedAtIso: string;
  finishedAtIso: string;
  details: string[];
  operationId: string;
  writePathId?: string | null;
  gatewayDecisionId?: string | null;
  reconciliation?: ProbeRunRecord["reconciliation"];
  outcomeId?: string | null;
}): ProbeRunRecord {
  return {
    runId: input.runId,
    kind: ProbeKind.FORM_TO_CRM_CANARY,
    mode: input.mode,
    targetId: input.targetId,
    verdict: input.verdict,
    startedAtIso: input.startedAtIso,
    finishedAtIso: input.finishedAtIso,
    evidence: {
      evidenceId: newId("ev"),
      kind: ProbeKind.FORM_TO_CRM_CANARY,
      mode: input.mode,
      summary: input.details[0] ?? `Canary ${input.verdict}`,
      facts: {
        detail: input.details.join(" | ") || null,
        detailCount: input.details.length,
      },
      recordedAtIso: input.finishedAtIso,
    },
    reconciliation: input.reconciliation ?? null,
    outcomeId: input.outcomeId ?? null,
    writePathId: input.writePathId ?? null,
    operationId: input.operationId,
    gatewayDecisionId: input.gatewayDecisionId ?? null,
    acceptanceCaseIds: [...MONITORING_RELATED_CASE_IDS],
  };
}
