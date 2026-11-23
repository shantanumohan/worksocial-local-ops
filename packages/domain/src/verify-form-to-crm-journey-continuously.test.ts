import { describe, expect, it } from "vitest";
import {
  VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_RELATED_CASE_IDS,
  evaluateVerifyFormToCrmJourneyContinuously,
  type VerifyFormToCrmJourneyContinuouslyInput,
} from "./verify-form-to-crm-journey-continuously.js";

function baseInput(
  overrides: Partial<VerifyFormToCrmJourneyContinuouslyInput> = {},
): VerifyFormToCrmJourneyContinuouslyInput {
  return {
    packageId: "pkg-f20-1",
    canaryIdentity: {
      canaryIdentityId: "canary-f20-1",
      targetEnvironment: "fixture",
      testPermissionGranted: true,
    },
    journeySpec: {
      journeyId: "journey-form-crm-f20-1",
      journeyLabel: "Contact form → Zoho lead → booking receipt",
      device: "desktop",
    },
    safetyGate: {
      safetyGateId: "safety-f20-1",
      syntheticOnly: true,
      commercialExcluded: true,
      protectionsReviewed: true,
    },
    stepEvidence: {
      correlationId: "corr-f20-1",
      steps: [
        {
          stepId: "step-form-accept",
          stage: "FORM_ACCEPT",
          startedAtIso: "2026-11-23T04:00:00.000Z",
          endedAtIso: "2026-11-23T04:00:01.000Z",
          verified: true,
        },
        {
          stepId: "step-crm-write",
          stage: "CRM_WRITE",
          startedAtIso: "2026-11-23T04:00:01.000Z",
          endedAtIso: "2026-11-23T04:00:02.000Z",
          verified: true,
        },
        {
          stepId: "step-booking-receipt",
          stage: "BOOKING_RECEIPT",
          startedAtIso: "2026-11-23T04:00:02.000Z",
          endedAtIso: "2026-11-23T04:00:03.000Z",
          verified: true,
        },
      ],
    },
    journeyGraph: {
      graphId: "graph-f20-1",
      nodeIds: ["form-accept", "crm-write", "booking-receipt"],
      edgeLabels: ["form→crm", "crm→booking"],
    },
    journeyOutcome: {
      result: "PASS_END_TO_END",
      failedOrUnverifiedStage: null,
    },
    incident: null,
    cadenceHeartbeat: {
      cadenceId: "cadence-f20-1",
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

describe("evaluateVerifyFormToCrmJourneyContinuously (T-F20)", () => {
  it("records complete F20 evidence package on pass path", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_EVIDENCE_RECORDED",
    );
    expect(decision.liveZohoWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.commercialExcluded).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.journeyVerifiedRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f20-1");
    expect(decision.evidence.correlationId).toBe("corr-f20-1");
    expect(decision.evidence.stepCount).toBe(3);
    expect(decision.evidence.allStepsVerified).toBe(true);
    expect(decision.evidence.journeyResult).toBe("PASS_END_TO_END");
    expect(decision.evidence.failedOrUnverifiedStage).toBeNull();
    expect(decision.evidence.incidentId).toBeNull();
    expect(decision.evidence.heartbeatCount).toBe(3);
    expect(decision.evidence.journeyVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F20_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY_RELATED_CASE_IDS).toEqual([
      "T-F20",
    ]);
  });

  it("records failure path with incident + named stage", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({
        journeyOutcome: {
          result: "FAILED_OR_UNVERIFIED_STAGE",
          failedOrUnverifiedStage: "CRM_WRITE",
        },
        incident: {
          incidentId: "inc-f20-crm-write-1",
          ownerId: "owner-ops-1",
          reproducible: true,
        },
        stepEvidence: {
          correlationId: "corr-f20-fail-1",
          steps: [
            {
              stepId: "step-form-accept",
              stage: "FORM_ACCEPT",
              startedAtIso: "2026-11-23T04:00:00.000Z",
              endedAtIso: "2026-11-23T04:00:01.000Z",
              verified: true,
            },
            {
              stepId: "step-crm-write",
              stage: "CRM_WRITE",
              startedAtIso: "2026-11-23T04:00:01.000Z",
              endedAtIso: "2026-11-23T04:00:02.000Z",
              verified: false,
            },
          ],
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.journeyResult).toBe(
      "FAILED_OR_UNVERIFIED_STAGE",
    );
    expect(decision.evidence.failedOrUnverifiedStage).toBe("CRM_WRITE");
    expect(decision.evidence.incidentId).toBe("inc-f20-crm-write-1");
    expect(decision.evidence.ownerId).toBe("owner-ops-1");
    expect(decision.evidence.allStepsVerified).toBe(false);
  });

  it("refuses missing canary identity", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ canaryIdentity: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CANARY_IDENTITY_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_CANARY_IDENTITY");
  });

  it("refuses missing journey spec", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ journeySpec: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("JOURNEY_SPEC_REQUIRED");
  });

  it("refuses missing safety gate", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ safetyGate: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SAFETY_GATE_REQUIRED");
  });

  it("refuses missing step evidence", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ stepEvidence: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("STEP_EVIDENCE_REQUIRED");
  });

  it("refuses missing journey graph", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ journeyGraph: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("JOURNEY_GRAPH_REQUIRED");
  });

  it("refuses missing journey outcome", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ journeyOutcome: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("JOURNEY_OUTCOME_REQUIRED");
  });

  it("refuses failure without incident/owner", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({
        journeyOutcome: {
          result: "FAILED_OR_UNVERIFIED_STAGE",
          failedOrUnverifiedStage: "CRM_WRITE",
        },
        incident: null,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INCIDENT_OWNER_REQUIRED_ON_FAILURE");
  });

  it("refuses missing cadence/heartbeat", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ cadenceHeartbeat: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CADENCE_HEARTBEAT_REQUIRED");
  });

  it("refuses commerce pollution", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ countSyntheticInCommerce: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("COMMERCE_POLLUTION_REFUSED");
  });

  it("refuses false live-verified journey claim", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ claimLiveVerifiedJourney: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_JOURNEY_REFUSED");
  });

  it("refuses live Zoho wiring", () => {
    const decision = evaluateVerifyFormToCrmJourneyContinuously(
      baseInput({ requestLiveZohoWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_ZOHO_WIRING_NOT_WIRED");
  });
});
