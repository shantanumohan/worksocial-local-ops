/**
 * Fixture proof for T-US-050 — Owner brief groups root cause; actionable.
 * Groups repeated incident signals by rootCauseKey with actionable next
 * steps; refuses ungrouped floods and non-actionable groups; live NOT_WIRED.
 * Distinct from T-US-049 (operating knowledge) and T-X068 (thirty alerts
 * one outage). External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateOwnerBriefRootCause,
  type OwnerBriefRootCauseInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<OwnerBriefRootCauseInput> = {},
): OwnerBriefRootCauseInput {
  return {
    briefId: "brief-2026-11-23",
    signals: [
      {
        signalId: "sig-1",
        rootCauseKey: "connector-zoho-down",
        summary: "Agent A22 saw Zoho 503",
      },
      {
        signalId: "sig-2",
        rootCauseKey: "connector-zoho-down",
        summary: "Agent A21 saw Zoho timeout",
      },
      {
        signalId: "sig-3",
        rootCauseKey: "connector-zoho-down",
        summary: "Agent A23 saw Zoho 503",
      },
      {
        signalId: "sig-4",
        rootCauseKey: "gsc-token-expired",
        summary: "Search Console watermark stall",
      },
    ],
    groups: [
      {
        rootCauseKey: "connector-zoho-down",
        title: "Zoho connector outage",
        signalCount: 3,
        action: {
          kind: "ASSIGN",
          summary: "Assign A23 to restore Zoho sync and acknowledge outage",
        },
      },
      {
        rootCauseKey: "gsc-token-expired",
        title: "GSC token expired",
        signalCount: 1,
        action: {
          kind: "REPAIR",
          summary: "Rotate Search Console OAuth token",
        },
      },
    ],
    emitUngroupedFlood: false,
    omitActionOnGroup: false,
    claimLiveVerifiedBrief: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-US-050 fixture ACCEPTED.
 */
export function proofOwnerBriefRootCause(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateOwnerBriefRootCause(baseInput());
  if (
    happy.allowed &&
    happy.code === "OWNER_BRIEF_ROOT_CAUSE_GROUPED_ACTIONABLE" &&
    happy.evidence.rawSignalCount === 4 &&
    happy.evidence.groupCount === 2 &&
    happy.evidence.actionableGroupCount === 2 &&
    happy.evidence.maxSignalsInGroup === 3 &&
    happy.evidence.groupingReducedNoise === true &&
    happy.evidence.ungroupedFlood === false &&
    happy.evidence.briefVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "4 signals → 2 root-cause groups with actions → OWNER_BRIEF_ROOT_CAUSE_GROUPED_ACTIONABLE; briefVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const flood = evaluateOwnerBriefRootCause(
    baseInput({ emitUngroupedFlood: true }),
  );
  if (!flood.allowed && flood.code === "UNGROUPED_FLOOD_REFUSED") {
    details.push(
      "emitUngroupedFlood with shared root cause → UNGROUPED_FLOOD_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Ungrouped flood unexpectedly ${JSON.stringify(flood)}`);
  }

  const nonActionable = evaluateOwnerBriefRootCause(
    baseInput({
      omitActionOnGroup: true,
      groups: [
        {
          rootCauseKey: "connector-zoho-down",
          title: "Zoho connector outage",
          signalCount: 3,
          action: null,
        },
        {
          rootCauseKey: "gsc-token-expired",
          title: "GSC token expired",
          signalCount: 1,
          action: null,
        },
      ],
    }),
  );
  if (
    !nonActionable.allowed &&
    nonActionable.code === "NON_ACTIONABLE_GROUP_REFUSED"
  ) {
    details.push(
      "omitActionOnGroup → NON_ACTIONABLE_GROUP_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Non-actionable unexpectedly ${JSON.stringify(nonActionable)}`,
    );
  }

  const mismatch = evaluateOwnerBriefRootCause(
    baseInput({
      groups: [
        {
          rootCauseKey: "connector-zoho-down",
          title: "Zoho connector outage",
          signalCount: 3,
          action: {
            kind: "ASSIGN",
            summary: "Assign A23 to restore Zoho sync",
          },
        },
      ],
    }),
  );
  if (!mismatch.allowed && mismatch.code === "GROUPING_MISMATCH") {
    details.push("groupCount≠distinct root causes → GROUPING_MISMATCH");
  } else {
    passed = false;
    details.push(`Grouping mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  const prodWrite = evaluateOwnerBriefRootCause(
    baseInput({ attemptProductionWrite: true }),
  );
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  const falseLive = evaluateOwnerBriefRootCause(
    baseInput({ claimLiveVerifiedBrief: true }),
  );
  if (
    !falseLive.allowed &&
    falseLive.code === "FALSE_LIVE_VERIFIED_BRIEF_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedBrief → FALSE_LIVE_VERIFIED_BRIEF_REFUSED",
    );
  } else {
    passed = false;
    details.push(`False live unexpectedly ${JSON.stringify(falseLive)}`);
  }

  const liveWire = evaluateOwnerBriefRootCause(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push(
      "requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-049 (operating knowledge) and T-X068 (thirty alerts one outage)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-owner-brief-root-cause-${randomUUID()}`,
    kind: SoakProofKind.OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-owner-brief-root-cause-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
