import { describe, expect, it } from "vitest";
import {
  HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_RELATED_CASE_IDS,
  evaluateHandleAfterHoursMessagesAndTakeover,
  type HandleAfterHoursMessagesAndTakeoverInput,
} from "./handle-after-hours-messages-and-takeover.js";

function baseInput(
  overrides: Partial<HandleAfterHoursMessagesAndTakeoverInput> = {},
): HandleAfterHoursMessagesAndTakeoverInput {
  return {
    packageId: "pkg-f22-1",
    responsePolicy: {
      policyId: "policy-f22-1",
      timezone: "America/New_York",
      coverageWindows: [
        { dayOfWeek: 1, startHour: 18, endHour: 23 },
        { dayOfWeek: 2, startHour: 18, endHour: 23 },
      ],
      allowedQuestionIds: ["q-hours", "q-day-pass"],
      escalationOwner: "owner-morning-desk",
    },
    approvedFacts: {
      factSetId: "facts-f22-1",
      approvedFactIds: ["fact-hours", "fact-day-pass"],
    },
    inboxConnectionReady: true,
    inbound: {
      conversationId: "c-f22-1",
      inboundVersion: 1,
      inboundMessageId: "in-f22-1",
      customerQuestionId: "q-hours",
      channel: "WEBCHAT",
    },
    allowedAction: {
      evaluationId: "eval-f22-1",
      questionAllowed: true,
      sourcesCited: ["fact-hours"],
      proposedResponseBody:
        "Our Midtown location is open weekdays 8am–8pm. I am a virtual assistant.",
      inspectedOrAllowed: true,
    },
    sendAndLead: {
      outboundMessageId: "out-f22-1",
      preparedAtVersion: 1,
      sendReceiptId: "rcpt-f22-1",
      leadId: "lead-f22-1",
      crmRecordId: "crm-f22-1",
      sendRecorded: true,
    },
    ownershipAudit: {
      auditEventId: "own-f22-1",
      kind: "takeover",
      fromVersion: 1,
      toVersion: 2,
      actorUserId: "human-desk-1",
      humanOwned: true,
      agentSendAllowed: false,
      competingRepliesPrevented: true,
    },
    morningHandoff: {
      handoffId: "handoff-f22-1",
      nextOwner: "owner-morning-desk",
      reason: "Customer asked for tour scheduling follow-up",
      acknowledged: true,
      acknowledgedAtIso: "2026-11-22T12:30:00.000Z",
      morningReviewCompleted: true,
    },
    claimLiveVerifiedAfterHours: false,
    requestLiveProviderWiring: false,
    requestCompetingReplyAfterTakeover: false,
    ...overrides,
  };
}

describe("evaluateHandleAfterHoursMessagesAndTakeover (T-F22)", () => {
  it("records complete F22 evidence package", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.afterHoursHandledRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f22-1");
    expect(decision.evidence.policyId).toBe("policy-f22-1");
    expect(decision.evidence.coverageWindowCount).toBe(2);
    expect(decision.evidence.escalationOwner).toBe("owner-morning-desk");
    expect(decision.evidence.conversationId).toBe("c-f22-1");
    expect(decision.evidence.inboundVersion).toBe(1);
    expect(decision.evidence.takeoverToVersion).toBe(2);
    expect(decision.evidence.handoffAcknowledged).toBe(true);
    expect(decision.evidence.morningReviewCompleted).toBe(true);
    expect(decision.evidence.competingRepliesPrevented).toBe(true);
    expect(decision.evidence.afterHoursVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F22_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_RELATED_CASE_IDS).toEqual([
      "T-F22",
    ]);
  });

  it("refuses missing response policy", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ responsePolicy: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RESPONSE_POLICY_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_RESPONSE_POLICY");
  });

  it("refuses missing approved facts", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ approvedFacts: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("APPROVED_FACTS_REQUIRED");
  });

  it("refuses missing inbox connection", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ inboxConnectionReady: false }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INBOX_CONNECTION_REQUIRED");
  });

  it("refuses missing inbound conversation", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ inbound: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INBOUND_CONVERSATION_REQUIRED");
  });

  it("refuses missing allowed-action evaluation", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ allowedAction: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ALLOWED_ACTION_EVALUATION_REQUIRED");
  });

  it("refuses missing policy send and lead", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ sendAndLead: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("POLICY_SEND_AND_LEAD_REQUIRED");
  });

  it("refuses missing ownership audit", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ ownershipAudit: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OWNERSHIP_AUDIT_REQUIRED");
  });

  it("refuses missing acknowledged handoff", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ morningHandoff: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ACKNOWLEDGED_HANDOFF_REQUIRED");
  });

  it("refuses competing reply after takeover", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ requestCompetingReplyAfterTakeover: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("COMPETING_REPLY_AFTER_TAKEOVER_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ claimLiveVerifiedAfterHours: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_AFTER_HOURS_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateHandleAfterHoursMessagesAndTakeover(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
