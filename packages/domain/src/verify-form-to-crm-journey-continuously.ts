/**
 * T-F20 — Verify a form-to-CRM journey continuously (complete F20 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F20 evidence
 * package — controlled canary identity + target environment + test permission,
 * declared journey + device, synthetic-data safety gate, per-step timestamps
 * with correlation ID, journey graph, pass-or-named-failure outcome (incident
 * + owner when failed), and cadence/heartbeat history within allowed load.
 * Incomplete packages, commerce pollution, false live-verified claims, and
 * live Zoho wiring are refused. Live Zoho stays NOT_WIRED. Pure domain — no
 * network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-039 (`FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT`) —
 * this records the complete F20 flow evidence package (structured package +
 * Given prerequisites + journey graph + incident path), not the cadence/
 * heartbeat summary alone. Distinct from T-F10/T-US-019 (CRM map /
 * failure→recovery) and T-US-040 (thank-you ≠ CRM).
 */

export type CanaryIdentityEvidence = {
  canaryIdentityId: string;
  targetEnvironment: "fixture" | "sandbox";
  testPermissionGranted: true;
};

export type JourneySpecification = {
  journeyId: string;
  journeyLabel: string;
  device: "desktop" | "mobile" | "tablet";
};

export type SyntheticSafetyGate = {
  safetyGateId: string;
  syntheticOnly: true;
  commercialExcluded: true;
  protectionsReviewed: true;
};

export type JourneyStepEvidence = {
  stepId: string;
  stage:
    | "FORM_ACCEPT"
    | "CRM_WRITE"
    | "BOOKING_RECEIPT"
    | "NOTIFICATION"
    | "OTHER";
  startedAtIso: string;
  endedAtIso: string;
  verified: boolean;
};

export type StepTimestampsCorrelation = {
  correlationId: string;
  steps: readonly JourneyStepEvidence[];
};

export type JourneyGraphEvidence = {
  graphId: string;
  nodeIds: readonly string[];
  edgeLabels: readonly string[];
};

export type JourneyOutcomeEvidence =
  | {
      result: "PASS_END_TO_END";
      failedOrUnverifiedStage: null;
    }
  | {
      result: "FAILED_OR_UNVERIFIED_STAGE";
      failedOrUnverifiedStage:
        | "FORM_ACCEPT"
        | "CRM_WRITE"
        | "BOOKING_RECEIPT"
        | "NOTIFICATION"
        | "OTHER";
    };

export type IncidentOwnerEvidence = {
  incidentId: string;
  ownerId: string;
  reproducible: true;
};

export type CadenceHeartbeatHistory = {
  cadenceId: string;
  /** Recurring interval within allowed load (minutes). */
  intervalMinutes: number;
  /** Allowed load cap (runs per day). */
  allowedLoadPerDay: number;
  heartbeatIsos: readonly string[];
};

export type VerifyFormToCrmJourneyContinuouslyInput = {
  packageId: string;
  canaryIdentity: CanaryIdentityEvidence | null;
  journeySpec: JourneySpecification | null;
  safetyGate: SyntheticSafetyGate | null;
  stepEvidence: StepTimestampsCorrelation | null;
  journeyGraph: JourneyGraphEvidence | null;
  journeyOutcome: JourneyOutcomeEvidence | null;
  /** Required when journeyOutcome is FAILED_OR_UNVERIFIED_STAGE. */
  incident: IncidentOwnerEvidence | null;
  cadenceHeartbeat: CadenceHeartbeatHistory | null;
  /** Attempt to count synthetic canary into commerce — must refuse. */
  countSyntheticInCommerce: boolean;
  /** Claim the F20 path is live-verified — must refuse offline. */
  claimLiveVerifiedJourney: boolean;
  /** Request live Zoho wiring — must stay NOT_WIRED offline. */
  requestLiveZohoWiring: boolean;
};

export type VerifyFormToCrmJourneyContinuouslyDecision =
  | {
      allowed: true;
      code: "VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_EVIDENCE_RECORDED";
      journeyVerifiedRecorded: true;
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      commercialExcluded: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        canaryIdentityId: string;
        targetEnvironment: "fixture" | "sandbox";
        testPermissionGranted: true;
        journeyId: string;
        journeyLabel: string;
        device: JourneySpecification["device"];
        safetyGateId: string;
        protectionsReviewed: true;
        correlationId: string;
        stepIds: string[];
        stepCount: number;
        allStepsVerified: boolean;
        graphId: string;
        nodeIds: string[];
        edgeLabels: string[];
        journeyResult: JourneyOutcomeEvidence["result"];
        failedOrUnverifiedStage: string | null;
        incidentId: string | null;
        ownerId: string | null;
        cadenceId: string;
        intervalMinutes: number;
        allowedLoadPerDay: number;
        heartbeatCount: number;
        journeyVerifiedLive: false;
        commercialExcluded: true;
        productionWrites: false;
        blockingDecision: "F20_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "FORM_TO_CRM_JOURNEY_CONTINUOUSLY_VERIFIED";
        recoveryPath: "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "CANARY_IDENTITY_REQUIRED"
        | "JOURNEY_SPEC_REQUIRED"
        | "SAFETY_GATE_REQUIRED"
        | "STEP_EVIDENCE_REQUIRED"
        | "JOURNEY_GRAPH_REQUIRED"
        | "JOURNEY_OUTCOME_REQUIRED"
        | "INCIDENT_OWNER_REQUIRED_ON_FAILURE"
        | "CADENCE_HEARTBEAT_REQUIRED"
        | "PRODUCTION_ENVIRONMENT_REFUSED"
        | "COMMERCE_POLLUTION_REFUSED"
        | "FALSE_LIVE_VERIFIED_JOURNEY_REFUSED"
        | "LIVE_ZOHO_WIRING_NOT_WIRED";
      journeyVerifiedRecorded: false;
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      commercialExcluded: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        canaryIdentityId: string | null;
        targetEnvironment: "fixture" | "sandbox" | null;
        testPermissionGranted: boolean;
        journeyId: string | null;
        journeyLabel: string | null;
        device: JourneySpecification["device"] | null;
        safetyGateId: string | null;
        protectionsReviewed: boolean;
        correlationId: string | null;
        stepIds: string[];
        stepCount: number;
        allStepsVerified: boolean;
        graphId: string | null;
        nodeIds: string[];
        edgeLabels: string[];
        journeyResult: JourneyOutcomeEvidence["result"] | null;
        failedOrUnverifiedStage: string | null;
        incidentId: string | null;
        ownerId: string | null;
        cadenceId: string | null;
        intervalMinutes: number;
        allowedLoadPerDay: number;
        heartbeatCount: number;
        journeyVerifiedLive: false;
        commercialExcluded: true;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_CANARY_IDENTITY"
          | "AWAITING_JOURNEY_SPEC"
          | "AWAITING_SAFETY_GATE"
          | "AWAITING_STEP_EVIDENCE"
          | "AWAITING_JOURNEY_GRAPH"
          | "AWAITING_JOURNEY_OUTCOME"
          | "AWAITING_INCIDENT_OWNER"
          | "AWAITING_CADENCE_HEARTBEAT";
        recoveryPath:
          | "DECLARE_CANARY_IDENTITY_AND_TEST_PERMISSION"
          | "SELECT_DECLARED_JOURNEY_AND_DEVICE"
          | "REVIEW_SYNTHETIC_DATA_PROTECTIONS"
          | "INSPECT_EACH_STEP_WITH_CORRELATION"
          | "RECORD_JOURNEY_GRAPH"
          | "PASS_OR_NAME_FAILED_STAGE"
          | "CREATE_INCIDENT_WITH_OWNER"
          | "SET_CADENCE_WITHIN_ALLOWED_LOAD"
          | "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_RELATED_CASE_IDS = [
  "T-F20",
] as const;

function preservedInputCount(
  input: VerifyFormToCrmJourneyContinuouslyInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.canaryIdentity?.canaryIdentityId.trim() ? 1 : 0) +
    (input.journeySpec?.journeyId.trim() ? 1 : 0) +
    (input.safetyGate?.safetyGateId.trim() ? 1 : 0) +
    (input.stepEvidence?.correlationId.trim() ? 1 : 0) +
    (input.journeyGraph?.graphId.trim() ? 1 : 0) +
    (input.journeyOutcome ? 1 : 0) +
    (input.incident?.incidentId.trim() ? 1 : 0) +
    (input.cadenceHeartbeat?.cadenceId.trim() ? 1 : 0)
  );
}

function canaryIdentityOk(
  c: CanaryIdentityEvidence | null,
): c is CanaryIdentityEvidence {
  if (!c) return false;
  return (
    c.canaryIdentityId.trim().length > 0 &&
    (c.targetEnvironment === "fixture" || c.targetEnvironment === "sandbox") &&
    c.testPermissionGranted === true
  );
}

function journeySpecOk(
  j: JourneySpecification | null,
): j is JourneySpecification {
  if (!j) return false;
  return (
    j.journeyId.trim().length > 0 &&
    j.journeyLabel.trim().length > 0 &&
    (j.device === "desktop" || j.device === "mobile" || j.device === "tablet")
  );
}

function safetyGateOk(
  g: SyntheticSafetyGate | null,
): g is SyntheticSafetyGate {
  if (!g) return false;
  return (
    g.safetyGateId.trim().length > 0 &&
    g.syntheticOnly === true &&
    g.commercialExcluded === true &&
    g.protectionsReviewed === true
  );
}

function stepEvidenceOk(
  s: StepTimestampsCorrelation | null,
): s is StepTimestampsCorrelation {
  if (!s) return false;
  if (!s.correlationId.trim() || s.steps.length === 0) return false;
  return s.steps.every(
    (step) =>
      step.stepId.trim().length > 0 &&
      step.startedAtIso.trim().length > 0 &&
      step.endedAtIso.trim().length > 0,
  );
}

function journeyGraphOk(
  g: JourneyGraphEvidence | null,
): g is JourneyGraphEvidence {
  if (!g) return false;
  return (
    g.graphId.trim().length > 0 &&
    g.nodeIds.length > 0 &&
    g.nodeIds.every((id) => id.trim().length > 0) &&
    g.edgeLabels.length > 0 &&
    g.edgeLabels.every((e) => e.trim().length > 0)
  );
}

function journeyOutcomeOk(
  o: JourneyOutcomeEvidence | null,
): o is JourneyOutcomeEvidence {
  if (!o) return false;
  if (o.result === "PASS_END_TO_END") {
    return o.failedOrUnverifiedStage === null;
  }
  if (o.result === "FAILED_OR_UNVERIFIED_STAGE") {
    return (
      o.failedOrUnverifiedStage === "FORM_ACCEPT" ||
      o.failedOrUnverifiedStage === "CRM_WRITE" ||
      o.failedOrUnverifiedStage === "BOOKING_RECEIPT" ||
      o.failedOrUnverifiedStage === "NOTIFICATION" ||
      o.failedOrUnverifiedStage === "OTHER"
    );
  }
  return false;
}

function incidentOk(
  i: IncidentOwnerEvidence | null,
): i is IncidentOwnerEvidence {
  if (!i) return false;
  return (
    i.incidentId.trim().length > 0 &&
    i.ownerId.trim().length > 0 &&
    i.reproducible === true
  );
}

function cadenceOk(
  c: CadenceHeartbeatHistory | null,
): c is CadenceHeartbeatHistory {
  if (!c) return false;
  return (
    c.cadenceId.trim().length > 0 &&
    c.intervalMinutes > 0 &&
    c.allowedLoadPerDay > 0 &&
    c.heartbeatIsos.length > 0 &&
    c.heartbeatIsos.every((iso) => iso.trim().length > 0) &&
    c.heartbeatIsos.length <= c.allowedLoadPerDay
  );
}

/**
 * Evaluate the T-F20 form-to-CRM continuous journey path offline.
 * Complete F20 evidence package → VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_EVIDENCE_RECORDED;
 * live Zoho stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateVerifyFormToCrmJourneyContinuously(
  input: VerifyFormToCrmJourneyContinuouslyInput,
): VerifyFormToCrmJourneyContinuouslyDecision {
  const base = {
    liveZohoWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    commercialExcluded: true as const,
    productionWrites: false as const,
    journeyVerifiedRecorded: false as const,
  };
  const preserved = preservedInputCount(input);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_CANARY_IDENTITY"
      | "AWAITING_JOURNEY_SPEC"
      | "AWAITING_SAFETY_GATE"
      | "AWAITING_STEP_EVIDENCE"
      | "AWAITING_JOURNEY_GRAPH"
      | "AWAITING_JOURNEY_OUTCOME"
      | "AWAITING_INCIDENT_OWNER"
      | "AWAITING_CADENCE_HEARTBEAT",
    recoveryPath:
      | "DECLARE_CANARY_IDENTITY_AND_TEST_PERMISSION"
      | "SELECT_DECLARED_JOURNEY_AND_DEVICE"
      | "REVIEW_SYNTHETIC_DATA_PROTECTIONS"
      | "INSPECT_EACH_STEP_WITH_CORRELATION"
      | "RECORD_JOURNEY_GRAPH"
      | "PASS_OR_NAME_FAILED_STAGE"
      | "CREATE_INCIDENT_WITH_OWNER"
      | "SET_CADENCE_WITHIN_ALLOWED_LOAD"
      | "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO",
  ): NonNullable<
    Extract<
      VerifyFormToCrmJourneyContinuouslyDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    canaryIdentityId: input.canaryIdentity?.canaryIdentityId.trim() || null,
    targetEnvironment: input.canaryIdentity?.targetEnvironment ?? null,
    testPermissionGranted:
      input.canaryIdentity?.testPermissionGranted === true,
    journeyId: input.journeySpec?.journeyId.trim() || null,
    journeyLabel: input.journeySpec?.journeyLabel.trim() || null,
    device: input.journeySpec?.device ?? null,
    safetyGateId: input.safetyGate?.safetyGateId.trim() || null,
    protectionsReviewed: input.safetyGate?.protectionsReviewed === true,
    correlationId: input.stepEvidence?.correlationId.trim() || null,
    stepIds: input.stepEvidence?.steps.map((s) => s.stepId.trim()) ?? [],
    stepCount: input.stepEvidence?.steps.length ?? 0,
    allStepsVerified:
      input.stepEvidence?.steps.every((s) => s.verified === true) === true,
    graphId: input.journeyGraph?.graphId.trim() || null,
    nodeIds: input.journeyGraph?.nodeIds.map((id) => id.trim()) ?? [],
    edgeLabels: input.journeyGraph?.edgeLabels.map((e) => e.trim()) ?? [],
    journeyResult: input.journeyOutcome?.result ?? null,
    failedOrUnverifiedStage:
      input.journeyOutcome?.failedOrUnverifiedStage ?? null,
    incidentId: input.incident?.incidentId.trim() || null,
    ownerId: input.incident?.ownerId.trim() || null,
    cadenceId: input.cadenceHeartbeat?.cadenceId.trim() || null,
    intervalMinutes: input.cadenceHeartbeat?.intervalMinutes ?? 0,
    allowedLoadPerDay: input.cadenceHeartbeat?.allowedLoadPerDay ?? 0,
    heartbeatCount: input.cadenceHeartbeat?.heartbeatIsos.length ?? 0,
    journeyVerifiedLive: false,
    commercialExcluded: true,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveZohoWiring) {
    return {
      allowed: false,
      code: "LIVE_ZOHO_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live Zoho wiring remains NOT_WIRED — refuse live form-to-CRM continuous journey (T-F20)",
      ],
    };
  }

  if (input.claimLiveVerifiedJourney) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_JOURNEY_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified form-to-CRM continuous journey claim offline (T-F20) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.countSyntheticInCommerce) {
    return {
      allowed: false,
      code: "COMMERCE_POLLUTION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "COMMERCE_POLLUTION_REFUSED",
        "BLOCKED",
        "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO",
      ),
      reasons: [
        "Synthetic canary records must not enter commerce denominators (T-F20)",
      ],
    };
  }

  if (!input.packageId.trim() || !canaryIdentityOk(input.canaryIdentity)) {
    return {
      allowed: false,
      code: "CANARY_IDENTITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CANARY_IDENTITY_INCOMPLETE",
        "AWAITING_CANARY_IDENTITY",
        "DECLARE_CANARY_IDENTITY_AND_TEST_PERMISSION",
      ),
      reasons: [
        "F20 requires controlled canary identity, fixture/sandbox target environment, and test permission (T-F20)",
      ],
    };
  }

  // Production target is not representable on CanaryIdentityEvidence targetEnvironment
  // union; guard remains for honesty if callers cast.
  if (
    (input.canaryIdentity.targetEnvironment as string) === "production" ||
    (input.canaryIdentity.targetEnvironment as string) === "authorized_production"
  ) {
    return {
      allowed: false,
      code: "PRODUCTION_ENVIRONMENT_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_ENVIRONMENT_REFUSED",
        "BLOCKED",
        "DECLARE_CANARY_IDENTITY_AND_TEST_PERMISSION",
      ),
      reasons: [
        "Production target environment refused for offline F20 evidence package (T-F20)",
      ],
    };
  }

  if (!journeySpecOk(input.journeySpec)) {
    return {
      allowed: false,
      code: "JOURNEY_SPEC_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "JOURNEY_SPEC_INCOMPLETE",
        "AWAITING_JOURNEY_SPEC",
        "SELECT_DECLARED_JOURNEY_AND_DEVICE",
      ),
      reasons: [
        "F20 requires declared journey specification with journeyId, label, and device (T-F20)",
      ],
    };
  }

  if (!safetyGateOk(input.safetyGate)) {
    return {
      allowed: false,
      code: "SAFETY_GATE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SAFETY_GATE_INCOMPLETE",
        "AWAITING_SAFETY_GATE",
        "REVIEW_SYNTHETIC_DATA_PROTECTIONS",
      ),
      reasons: [
        "F20 requires synthetic-data safety gate with protections reviewed (commercialExcluded) (T-F20)",
      ],
    };
  }

  if (!stepEvidenceOk(input.stepEvidence)) {
    return {
      allowed: false,
      code: "STEP_EVIDENCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "STEP_EVIDENCE_INCOMPLETE",
        "AWAITING_STEP_EVIDENCE",
        "INSPECT_EACH_STEP_WITH_CORRELATION",
      ),
      reasons: [
        "F20 requires per-step timestamps and a correlation ID (inspect each step, not page status alone) (T-F20)",
      ],
    };
  }

  if (!journeyGraphOk(input.journeyGraph)) {
    return {
      allowed: false,
      code: "JOURNEY_GRAPH_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "JOURNEY_GRAPH_INCOMPLETE",
        "AWAITING_JOURNEY_GRAPH",
        "RECORD_JOURNEY_GRAPH",
      ),
      reasons: [
        "F20 requires journey graph with nodes and edges (T-F20)",
      ],
    };
  }

  if (!journeyOutcomeOk(input.journeyOutcome)) {
    return {
      allowed: false,
      code: "JOURNEY_OUTCOME_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "JOURNEY_OUTCOME_INCOMPLETE",
        "AWAITING_JOURNEY_OUTCOME",
        "PASS_OR_NAME_FAILED_STAGE",
      ),
      reasons: [
        "F20 requires journey outcome: pass end-to-end or name the failed/unverified stage (T-F20)",
      ],
    };
  }

  if (
    input.journeyOutcome.result === "FAILED_OR_UNVERIFIED_STAGE" &&
    !incidentOk(input.incident)
  ) {
    return {
      allowed: false,
      code: "INCIDENT_OWNER_REQUIRED_ON_FAILURE",
      ...base,
      evidence: blockedEvidence(
        "INCIDENT_OWNER_INCOMPLETE",
        "AWAITING_INCIDENT_OWNER",
        "CREATE_INCIDENT_WITH_OWNER",
      ),
      reasons: [
        "F20 requires incident + owner for reproducible failure when a stage fails/unverified (T-F20)",
      ],
    };
  }

  if (!cadenceOk(input.cadenceHeartbeat)) {
    return {
      allowed: false,
      code: "CADENCE_HEARTBEAT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CADENCE_HEARTBEAT_INCOMPLETE",
        "AWAITING_CADENCE_HEARTBEAT",
        "SET_CADENCE_WITHIN_ALLOWED_LOAD",
      ),
      reasons: [
        "F20 requires recurring cadence within allowed load and heartbeat history (T-F20)",
      ],
    };
  }

  const canary = input.canaryIdentity;
  const spec = input.journeySpec;
  const gate = input.safetyGate;
  const steps = input.stepEvidence;
  const graph = input.journeyGraph;
  const outcome = input.journeyOutcome;
  const cadence = input.cadenceHeartbeat;
  const allStepsVerified = steps.steps.every((s) => s.verified === true);

  return {
    allowed: true,
    code: "VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_EVIDENCE_RECORDED",
    journeyVerifiedRecorded: true,
    liveZohoWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    commercialExcluded: true,
    productionWrites: false,
    evidence: {
      packageId: input.packageId.trim(),
      canaryIdentityId: canary.canaryIdentityId.trim(),
      targetEnvironment: canary.targetEnvironment,
      testPermissionGranted: true,
      journeyId: spec.journeyId.trim(),
      journeyLabel: spec.journeyLabel.trim(),
      device: spec.device,
      safetyGateId: gate.safetyGateId.trim(),
      protectionsReviewed: true,
      correlationId: steps.correlationId.trim(),
      stepIds: steps.steps.map((s) => s.stepId.trim()),
      stepCount: steps.steps.length,
      allStepsVerified,
      graphId: graph.graphId.trim(),
      nodeIds: graph.nodeIds.map((id) => id.trim()),
      edgeLabels: graph.edgeLabels.map((e) => e.trim()),
      journeyResult: outcome.result,
      failedOrUnverifiedStage: outcome.failedOrUnverifiedStage,
      incidentId: input.incident?.incidentId.trim() || null,
      ownerId: input.incident?.ownerId.trim() || null,
      cadenceId: cadence.cadenceId.trim(),
      intervalMinutes: cadence.intervalMinutes,
      allowedLoadPerDay: cadence.allowedLoadPerDay,
      heartbeatCount: cadence.heartbeatIsos.length,
      journeyVerifiedLive: false,
      commercialExcluded: true,
      productionWrites: false,
      blockingDecision: "F20_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "FORM_TO_CRM_JOURNEY_CONTINUOUSLY_VERIFIED",
      recoveryPath: "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F20 evidence package recorded (canary identity, journey spec, safety gate, step timestamps+correlation, journey graph, pass-or-named-failure, cadence/heartbeat); commercialExcluded; live Zoho NOT_WIRED; externalEffects NONE",
    ],
  };
}
