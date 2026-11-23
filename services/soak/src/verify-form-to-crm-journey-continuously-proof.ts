/**
 * Fixture proof for T-F20 — Verify a form-to-CRM journey continuously.
 * Complete F20 evidence package: canary identity, journey spec, safety gate,
 * step timestamps+correlation, journey graph, pass-or-named-failure (+incident
 * on failure), cadence/heartbeat; unsafe claims refused; live Zoho NOT_WIRED.
 * Distinct from T-US-039 cadence/heartbeat summary, T-F10/T-US-019 CRM map /
 * failure→recovery, and T-US-040 thank-you ≠ CRM.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateVerifyFormToCrmJourneyContinuously,
  type SoakProofRecord,
  type VerifyFormToCrmJourneyContinuouslyInput,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<VerifyFormToCrmJourneyContinuouslyInput> = {},
): VerifyFormToCrmJourneyContinuouslyInput {
  return {
    packageId: "pkg-f20-soak",
    canaryIdentity: {
      canaryIdentityId: "canary-f20-soak",
      targetEnvironment: "fixture",
      testPermissionGranted: true,
    },
    journeySpec: {
      journeyId: "journey-form-crm-f20-soak",
      journeyLabel: "Contact form → Zoho lead → booking receipt",
      device: "desktop",
    },
    safetyGate: {
      safetyGateId: "safety-f20-soak",
      syntheticOnly: true,
      commercialExcluded: true,
      protectionsReviewed: true,
    },
    stepEvidence: {
      correlationId: "corr-f20-soak",
      steps: [
        {
          stepId: "step-form-accept-soak",
          stage: "FORM_ACCEPT",
          startedAtIso: "2026-11-23T04:00:00.000Z",
          endedAtIso: "2026-11-23T04:00:01.000Z",
          verified: true,
        },
        {
          stepId: "step-crm-write-soak",
          stage: "CRM_WRITE",
          startedAtIso: "2026-11-23T04:00:01.000Z",
          endedAtIso: "2026-11-23T04:00:02.000Z",
          verified: true,
        },
        {
          stepId: "step-booking-receipt-soak",
          stage: "BOOKING_RECEIPT",
          startedAtIso: "2026-11-23T04:00:02.000Z",
          endedAtIso: "2026-11-23T04:00:03.000Z",
          verified: true,
        },
      ],
    },
    journeyGraph: {
      graphId: "graph-f20-soak",
      nodeIds: ["form-accept", "crm-write", "booking-receipt"],
      edgeLabels: ["form→crm", "crm→booking"],
    },
    journeyOutcome: {
      result: "PASS_END_TO_END",
      failedOrUnverifiedStage: null,
    },
    incident: null,
    cadenceHeartbeat: {
      cadenceId: "cadence-f20-soak",
      intervalMinutes: 60,
      allowedLoadPerDay: 24,
      heartbeatIsos: [
        "2026-11-23T02:00:00.000Z",
        "2026-11-23T03:00:00.000Z",
        "2026-11-23T04:00:00.000Z",
      ],
    },
    countSyntheticInCommerce: false,
    claimLiveVerifiedJourney: false,
    requestLiveZohoWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F20 fixture ACCEPTED.
 */
export function proofVerifyFormToCrmJourneyContinuously(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateVerifyFormToCrmJourneyContinuously(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_EVIDENCE_RECORDED" &&
    happy.evidence.journeyVerifiedLive === false &&
    happy.journeyVerifiedRecorded === true &&
    happy.evidence.journeyResult === "PASS_END_TO_END" &&
    happy.evidence.stepCount >= 2 &&
    happy.evidence.heartbeatCount >= 1 &&
    happy.liveZohoWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F20 evidence package → VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_EVIDENCE_RECORDED; canary identity; journey spec; safety gate; step timestamps+correlation; journey graph; pass end-to-end; cadence/heartbeat; journeyVerifiedLive=false; live Zoho NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const failNamed = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({
      journeyOutcome: {
        result: "FAILED_OR_UNVERIFIED_STAGE",
        failedOrUnverifiedStage: "CRM_WRITE",
      },
      incident: {
        incidentId: "inc-f20-soak-crm",
        ownerId: "owner-ops-soak",
        reproducible: true,
      },
    }),
  );
  if (
    failNamed.allowed &&
    failNamed.evidence.failedOrUnverifiedStage === "CRM_WRITE" &&
    failNamed.evidence.incidentId === "inc-f20-soak-crm"
  ) {
    details.push(
      "FAILED_OR_UNVERIFIED_STAGE+incident → named CRM_WRITE with owner",
    );
  } else {
    passed = false;
    details.push(`Named failure unexpectedly ${JSON.stringify(failNamed)}`);
  }

  const noCanary = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ canaryIdentity: null }),
  );
  if (!noCanary.allowed && noCanary.code === "CANARY_IDENTITY_REQUIRED") {
    details.push("canaryIdentity=null → CANARY_IDENTITY_REQUIRED");
  } else {
    passed = false;
    details.push(`Canary identity unexpectedly ${JSON.stringify(noCanary)}`);
  }

  const noSpec = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ journeySpec: null }),
  );
  if (!noSpec.allowed && noSpec.code === "JOURNEY_SPEC_REQUIRED") {
    details.push("journeySpec=null → JOURNEY_SPEC_REQUIRED");
  } else {
    passed = false;
    details.push(`Journey spec unexpectedly ${JSON.stringify(noSpec)}`);
  }

  const noGate = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ safetyGate: null }),
  );
  if (!noGate.allowed && noGate.code === "SAFETY_GATE_REQUIRED") {
    details.push("safetyGate=null → SAFETY_GATE_REQUIRED");
  } else {
    passed = false;
    details.push(`Safety gate unexpectedly ${JSON.stringify(noGate)}`);
  }

  const noSteps = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ stepEvidence: null }),
  );
  if (!noSteps.allowed && noSteps.code === "STEP_EVIDENCE_REQUIRED") {
    details.push("stepEvidence=null → STEP_EVIDENCE_REQUIRED");
  } else {
    passed = false;
    details.push(`Step evidence unexpectedly ${JSON.stringify(noSteps)}`);
  }

  const noGraph = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ journeyGraph: null }),
  );
  if (!noGraph.allowed && noGraph.code === "JOURNEY_GRAPH_REQUIRED") {
    details.push("journeyGraph=null → JOURNEY_GRAPH_REQUIRED");
  } else {
    passed = false;
    details.push(`Journey graph unexpectedly ${JSON.stringify(noGraph)}`);
  }

  const noOutcome = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ journeyOutcome: null }),
  );
  if (!noOutcome.allowed && noOutcome.code === "JOURNEY_OUTCOME_REQUIRED") {
    details.push("journeyOutcome=null → JOURNEY_OUTCOME_REQUIRED");
  } else {
    passed = false;
    details.push(`Journey outcome unexpectedly ${JSON.stringify(noOutcome)}`);
  }

  const noIncident = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({
      journeyOutcome: {
        result: "FAILED_OR_UNVERIFIED_STAGE",
        failedOrUnverifiedStage: "CRM_WRITE",
      },
      incident: null,
    }),
  );
  if (
    !noIncident.allowed &&
    noIncident.code === "INCIDENT_OWNER_REQUIRED_ON_FAILURE"
  ) {
    details.push(
      "failure without incident → INCIDENT_OWNER_REQUIRED_ON_FAILURE",
    );
  } else {
    passed = false;
    details.push(`Incident gate unexpectedly ${JSON.stringify(noIncident)}`);
  }

  const noCadence = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ cadenceHeartbeat: null }),
  );
  if (!noCadence.allowed && noCadence.code === "CADENCE_HEARTBEAT_REQUIRED") {
    details.push("cadenceHeartbeat=null → CADENCE_HEARTBEAT_REQUIRED");
  } else {
    passed = false;
    details.push(`Cadence unexpectedly ${JSON.stringify(noCadence)}`);
  }

  const commerce = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ countSyntheticInCommerce: true }),
  );
  if (!commerce.allowed && commerce.code === "COMMERCE_POLLUTION_REFUSED") {
    details.push("countSyntheticInCommerce → COMMERCE_POLLUTION_REFUSED");
  } else {
    passed = false;
    details.push(`Commerce pollution unexpectedly ${JSON.stringify(commerce)}`);
  }

  const liveClaim = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ claimLiveVerifiedJourney: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_JOURNEY_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedJourney → FALSE_LIVE_VERIFIED_JOURNEY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateVerifyFormToCrmJourneyContinuously(
    baseInput({ requestLiveZohoWiring: true }),
  );
  if (!liveWire.allowed && liveWire.code === "LIVE_ZOHO_WIRING_NOT_WIRED") {
    details.push("requestLiveZohoWiring → LIVE_ZOHO_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveZohoWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-039 (cadence/heartbeat summary), T-F10/T-US-019 (CRM map / failure→recovery), and T-US-040 (thank-you ≠ CRM) — complete F20 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-verify-form-to-crm-journey-continuously-f20",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
