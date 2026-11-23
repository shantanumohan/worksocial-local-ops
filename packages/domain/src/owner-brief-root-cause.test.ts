import { describe, expect, it } from "vitest";
import {
  evaluateOwnerBriefRootCause,
  type IncidentSignal,
  type OwnerBriefGroup,
  type OwnerBriefRootCauseInput,
} from "./owner-brief-root-cause.js";

function signal(
  overrides: Partial<IncidentSignal> &
    Pick<IncidentSignal, "signalId" | "rootCauseKey">,
): IncidentSignal {
  return {
    summary: `Signal ${overrides.signalId}`,
    ...overrides,
  };
}

function group(
  overrides: Partial<OwnerBriefGroup> &
    Pick<OwnerBriefGroup, "rootCauseKey" | "signalCount">,
): OwnerBriefGroup {
  return {
    title: `Group ${overrides.rootCauseKey}`,
    action: {
      kind: "ASSIGN",
      summary: `Act on ${overrides.rootCauseKey}`,
    },
    ...overrides,
  };
}

function validInput(
  overrides: Partial<OwnerBriefRootCauseInput> = {},
): OwnerBriefRootCauseInput {
  const signals = [
    signal({ signalId: "sig-1", rootCauseKey: "connector-zoho-down" }),
    signal({ signalId: "sig-2", rootCauseKey: "connector-zoho-down" }),
    signal({ signalId: "sig-3", rootCauseKey: "connector-zoho-down" }),
    signal({ signalId: "sig-4", rootCauseKey: "gsc-token-expired" }),
  ];
  return {
    briefId: "brief-2026-11-23",
    signals,
    groups: [
      group({ rootCauseKey: "connector-zoho-down", signalCount: 3 }),
      group({
        rootCauseKey: "gsc-token-expired",
        signalCount: 1,
        action: { kind: "REPAIR", summary: "Rotate GSC OAuth token" },
      }),
    ],
    emitUngroupedFlood: false,
    omitActionOnGroup: false,
    claimLiveVerifiedBrief: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

describe("evaluateOwnerBriefRootCause (T-US-050)", () => {
  it("accepts grouped root-cause brief with actionable next steps", () => {
    const decision = evaluateOwnerBriefRootCause(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("OWNER_BRIEF_ROOT_CAUSE_GROUPED_ACTIONABLE");
    expect(decision.evidence.rawSignalCount).toBe(4);
    expect(decision.evidence.groupCount).toBe(2);
    expect(decision.evidence.actionableGroupCount).toBe(2);
    expect(decision.evidence.maxSignalsInGroup).toBe(3);
    expect(decision.evidence.groupingReducedNoise).toBe(true);
    expect(decision.evidence.ungroupedFlood).toBe(false);
    expect(decision.evidence.briefVerifiedLive).toBe(false);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("refuses ungrouped notification flood for shared root cause", () => {
    const decision = evaluateOwnerBriefRootCause(
      validInput({ emitUngroupedFlood: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("UNGROUPED_FLOOD_REFUSED");
    expect(decision.evidence?.ungroupedFlood).toBe(true);
  });

  it("refuses non-actionable groups", () => {
    const decision = evaluateOwnerBriefRootCause(
      validInput({
        omitActionOnGroup: true,
        groups: [
          group({
            rootCauseKey: "connector-zoho-down",
            signalCount: 3,
            action: null,
          }),
          group({
            rootCauseKey: "gsc-token-expired",
            signalCount: 1,
            action: null,
          }),
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("NON_ACTIONABLE_GROUP_REFUSED");
  });

  it("refuses grouping mismatch when group count differs", () => {
    const decision = evaluateOwnerBriefRootCause(
      validInput({
        groups: [group({ rootCauseKey: "connector-zoho-down", signalCount: 3 })],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("GROUPING_MISMATCH");
  });

  it("refuses production write offline", () => {
    const decision = evaluateOwnerBriefRootCause(
      validInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateOwnerBriefRootCause(
      validInput({ claimLiveVerifiedBrief: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_BRIEF_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateOwnerBriefRootCause(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
