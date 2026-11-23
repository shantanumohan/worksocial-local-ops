/**
 * T-F22 — Handle after-hours messages and take over (complete F22 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F22 evidence
 * package — response policy (coverage hours, allowed questions, escalation
 * owner), inbound conversation + message versions, sources and allowed-action
 * evaluation, message receipt + CRM lead link, ownership audit (takeover),
 * and acknowledged morning handoff. Incomplete packages, competing replies,
 * false live-verified claims, and live provider wiring are refused. Live
 * provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-043 (acknowledged handoff summary), T-US-044/T-X053
 * (takeover cancels unsent), T-X055 (unknown policy escalate without promise),
 * and T-X056 (bounded automated response loop handoff).
 */

export type AfterHoursResponsePolicyEvidence = {
  policyId: string;
  timezone: string;
  /** Coverage windows (after-hours) when concierge may reply. */
  coverageWindows: readonly {
    dayOfWeek: number;
    startHour: number;
    endHour: number;
  }[];
  allowedQuestionIds: readonly string[];
  escalationOwner: string;
};

export type ApprovedFactSourcesEvidence = {
  factSetId: string;
  approvedFactIds: readonly string[];
};

export type InboundConversationEvidence = {
  conversationId: string;
  /** Conversation version at inbound receive. */
  inboundVersion: number;
  inboundMessageId: string;
  customerQuestionId: string;
  channel: "EMAIL" | "SMS" | "WEBCHAT" | "SOCIAL";
};

export type AllowedActionEvaluationEvidence = {
  evaluationId: string;
  questionAllowed: boolean;
  sourcesCited: readonly string[];
  proposedResponseBody: string;
  /** Owner inspected or allowed the proposed response. */
  inspectedOrAllowed: boolean;
};

export type PolicySendAndLeadEvidence = {
  outboundMessageId: string;
  /** Conversation version when outbound was prepared/sent. */
  preparedAtVersion: number;
  sendReceiptId: string;
  leadId: string;
  crmRecordId: string;
  /** Fixture send recorded (not live inbox). */
  sendRecorded: boolean;
};

export type OwnershipAuditEvidence = {
  auditEventId: string;
  kind: "takeover";
  fromVersion: number;
  toVersion: number;
  actorUserId: string;
  /** Post-takeover: human owns; agent send blocked. */
  humanOwned: true;
  agentSendAllowed: false;
  /** No competing agent replies after takeover. */
  competingRepliesPrevented: true;
};

export type AcknowledgedMorningHandoffEvidence = {
  handoffId: string;
  nextOwner: string;
  reason: string;
  acknowledged: true;
  acknowledgedAtIso: string;
  morningReviewCompleted: true;
};

export type HandleAfterHoursMessagesAndTakeoverInput = {
  packageId: string;
  responsePolicy: AfterHoursResponsePolicyEvidence | null;
  approvedFacts: ApprovedFactSourcesEvidence | null;
  inboxConnectionReady: boolean;
  inbound: InboundConversationEvidence | null;
  allowedAction: AllowedActionEvaluationEvidence | null;
  sendAndLead: PolicySendAndLeadEvidence | null;
  ownershipAudit: OwnershipAuditEvidence | null;
  morningHandoff: AcknowledgedMorningHandoffEvidence | null;
  /** Claim the F22 path is live-verified — must refuse offline. */
  claimLiveVerifiedAfterHours: boolean;
  /** Request live inbox/CRM apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt a competing agent reply after takeover — must refuse
   * (no competing replies).
   */
  requestCompetingReplyAfterTakeover: boolean;
};

export type HandleAfterHoursMessagesAndTakeoverDecision =
  | {
      allowed: true;
      code: "HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_EVIDENCE_RECORDED";
      afterHoursHandledRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        policyId: string;
        timezone: string;
        coverageWindowCount: number;
        allowedQuestionIds: string[];
        escalationOwner: string;
        factSetId: string;
        approvedFactIds: string[];
        conversationId: string;
        inboundVersion: number;
        inboundMessageId: string;
        customerQuestionId: string;
        channel: InboundConversationEvidence["channel"];
        evaluationId: string;
        questionAllowed: true;
        sourcesCited: string[];
        inspectedOrAllowed: true;
        outboundMessageId: string;
        preparedAtVersion: number;
        sendReceiptId: string;
        leadId: string;
        crmRecordId: string;
        sendRecorded: true;
        auditEventId: string;
        takeoverFromVersion: number;
        takeoverToVersion: number;
        actorUserId: string;
        humanOwned: true;
        agentSendAllowed: false;
        competingRepliesPrevented: true;
        handoffId: string;
        handoffNextOwner: string;
        handoffAcknowledged: true;
        morningReviewCompleted: true;
        afterHoursVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F22_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "AFTER_HOURS_HANDLED_HANDOFF_ACKNOWLEDGED";
        recoveryPath: "KEEP_FIXTURE_AFTER_HOURS_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "RESPONSE_POLICY_REQUIRED"
        | "APPROVED_FACTS_REQUIRED"
        | "INBOX_CONNECTION_REQUIRED"
        | "INBOUND_CONVERSATION_REQUIRED"
        | "ALLOWED_ACTION_EVALUATION_REQUIRED"
        | "POLICY_SEND_AND_LEAD_REQUIRED"
        | "OWNERSHIP_AUDIT_REQUIRED"
        | "ACKNOWLEDGED_HANDOFF_REQUIRED"
        | "COMPETING_REPLY_AFTER_TAKEOVER_REFUSED"
        | "FALSE_LIVE_VERIFIED_AFTER_HOURS_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      afterHoursHandledRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        policyId: string | null;
        timezone: string | null;
        coverageWindowCount: number;
        allowedQuestionIds: string[];
        escalationOwner: string | null;
        factSetId: string | null;
        approvedFactIds: string[];
        conversationId: string | null;
        inboundVersion: number;
        inboundMessageId: string | null;
        customerQuestionId: string | null;
        channel: InboundConversationEvidence["channel"] | null;
        evaluationId: string | null;
        questionAllowed: boolean;
        sourcesCited: string[];
        inspectedOrAllowed: boolean;
        outboundMessageId: string | null;
        preparedAtVersion: number;
        sendReceiptId: string | null;
        leadId: string | null;
        crmRecordId: string | null;
        sendRecorded: boolean;
        auditEventId: string | null;
        takeoverFromVersion: number;
        takeoverToVersion: number;
        actorUserId: string | null;
        humanOwned: boolean;
        agentSendAllowed: boolean;
        competingRepliesPrevented: boolean;
        handoffId: string | null;
        handoffNextOwner: string | null;
        handoffAcknowledged: boolean;
        morningReviewCompleted: boolean;
        afterHoursVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_RESPONSE_POLICY"
          | "AWAITING_APPROVED_FACTS"
          | "AWAITING_INBOX_CONNECTION"
          | "AWAITING_INBOUND_CONVERSATION"
          | "AWAITING_ALLOWED_ACTION_EVALUATION"
          | "AWAITING_POLICY_SEND_AND_LEAD"
          | "AWAITING_OWNERSHIP_AUDIT"
          | "AWAITING_ACKNOWLEDGED_HANDOFF";
        recoveryPath:
          | "SET_COVERAGE_ALLOWED_QUESTIONS_ESCALATION"
          | "APPROVE_BUSINESS_FACTS"
          | "CONNECT_SUPPORTED_INBOX"
          | "RECEIVE_INBOUND_CONVERSATION"
          | "INSPECT_OR_ALLOW_PROPOSED_RESPONSE"
          | "SEND_WITHIN_POLICY_AND_LOG_LEAD"
          | "TAKE_OVER_AND_RECORD_OWNERSHIP_AUDIT"
          | "ACKNOWLEDGE_MORNING_HANDOFF"
          | "KEEP_FIXTURE_AFTER_HOURS_NO_LIVE_PROVIDER"
          | "REFUSE_COMPETING_REPLY";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_RELATED_CASE_IDS = [
  "T-F22",
] as const;

function preservedInputCount(
  input: HandleAfterHoursMessagesAndTakeoverInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.responsePolicy?.policyId.trim() ? 1 : 0) +
    (input.approvedFacts?.factSetId.trim() ? 1 : 0) +
    (input.inboxConnectionReady ? 1 : 0) +
    (input.inbound?.conversationId.trim() ? 1 : 0) +
    (input.allowedAction?.evaluationId.trim() ? 1 : 0) +
    (input.sendAndLead?.outboundMessageId.trim() ? 1 : 0) +
    (input.ownershipAudit?.auditEventId.trim() ? 1 : 0) +
    (input.morningHandoff?.handoffId.trim() ? 1 : 0)
  );
}

function policyOk(
  policy: AfterHoursResponsePolicyEvidence | null,
): policy is AfterHoursResponsePolicyEvidence {
  if (!policy) return false;
  return (
    policy.policyId.trim().length > 0 &&
    policy.timezone.trim().length > 0 &&
    policy.coverageWindows.length > 0 &&
    policy.coverageWindows.every(
      (w) =>
        Number.isFinite(w.dayOfWeek) &&
        w.dayOfWeek >= 0 &&
        w.dayOfWeek <= 6 &&
        Number.isFinite(w.startHour) &&
        Number.isFinite(w.endHour) &&
        w.startHour >= 0 &&
        w.endHour <= 24 &&
        w.startHour < w.endHour,
    ) &&
    policy.allowedQuestionIds.length > 0 &&
    policy.allowedQuestionIds.every((id) => id.trim().length > 0) &&
    policy.escalationOwner.trim().length > 0
  );
}

function factsOk(
  facts: ApprovedFactSourcesEvidence | null,
): facts is ApprovedFactSourcesEvidence {
  if (!facts) return false;
  return (
    facts.factSetId.trim().length > 0 &&
    facts.approvedFactIds.length > 0 &&
    facts.approvedFactIds.every((id) => id.trim().length > 0)
  );
}

function inboundOk(
  inbound: InboundConversationEvidence | null,
): inbound is InboundConversationEvidence {
  if (!inbound) return false;
  return (
    inbound.conversationId.trim().length > 0 &&
    inbound.inboundMessageId.trim().length > 0 &&
    inbound.customerQuestionId.trim().length > 0 &&
    Number.isFinite(inbound.inboundVersion) &&
    inbound.inboundVersion >= 1
  );
}

function actionOk(
  action: AllowedActionEvaluationEvidence | null,
  policy: AfterHoursResponsePolicyEvidence,
  facts: ApprovedFactSourcesEvidence,
  inbound: InboundConversationEvidence,
): action is AllowedActionEvaluationEvidence {
  if (!action) return false;
  if (
    !action.evaluationId.trim() ||
    !action.proposedResponseBody.trim() ||
    action.questionAllowed !== true ||
    action.inspectedOrAllowed !== true
  ) {
    return false;
  }
  if (!policy.allowedQuestionIds.includes(inbound.customerQuestionId)) {
    return false;
  }
  if (action.sourcesCited.length === 0) return false;
  return action.sourcesCited.every((id) => facts.approvedFactIds.includes(id));
}

function sendOk(
  send: PolicySendAndLeadEvidence | null,
  inbound: InboundConversationEvidence,
): send is PolicySendAndLeadEvidence {
  if (!send) return false;
  return (
    send.outboundMessageId.trim().length > 0 &&
    send.sendReceiptId.trim().length > 0 &&
    send.leadId.trim().length > 0 &&
    send.crmRecordId.trim().length > 0 &&
    send.sendRecorded === true &&
    Number.isFinite(send.preparedAtVersion) &&
    send.preparedAtVersion === inbound.inboundVersion
  );
}

function auditOk(
  audit: OwnershipAuditEvidence | null,
  send: PolicySendAndLeadEvidence,
): audit is OwnershipAuditEvidence {
  if (!audit) return false;
  return (
    audit.auditEventId.trim().length > 0 &&
    audit.kind === "takeover" &&
    audit.actorUserId.trim().length > 0 &&
    audit.fromVersion === send.preparedAtVersion &&
    audit.toVersion === send.preparedAtVersion + 1 &&
    audit.humanOwned === true &&
    audit.agentSendAllowed === false &&
    audit.competingRepliesPrevented === true
  );
}

function handoffOk(
  handoff: AcknowledgedMorningHandoffEvidence | null,
  policy: AfterHoursResponsePolicyEvidence,
): handoff is AcknowledgedMorningHandoffEvidence {
  if (!handoff) return false;
  return (
    handoff.handoffId.trim().length > 0 &&
    handoff.nextOwner.trim().length > 0 &&
    handoff.reason.trim().length > 0 &&
    handoff.acknowledged === true &&
    handoff.acknowledgedAtIso.trim().length > 0 &&
    handoff.morningReviewCompleted === true &&
    handoff.nextOwner === policy.escalationOwner
  );
}

function emptyEvidence(
  input: HandleAfterHoursMessagesAndTakeoverInput,
  blockingDecision: string,
  currentState: Extract<
    HandleAfterHoursMessagesAndTakeoverDecision,
    { allowed: false }
  >["evidence"] extends infer E
    ? E extends { currentState: infer S }
      ? S
      : never
    : never,
  recoveryPath: Extract<
    HandleAfterHoursMessagesAndTakeoverDecision,
    { allowed: false }
  >["evidence"] extends infer E
    ? E extends { recoveryPath: infer R }
      ? R
      : never
    : never,
): NonNullable<
  Extract<HandleAfterHoursMessagesAndTakeoverDecision, { allowed: false }>["evidence"]
> {
  return {
    packageId: input.packageId.trim() || null,
    policyId: input.responsePolicy?.policyId ?? null,
    timezone: input.responsePolicy?.timezone ?? null,
    coverageWindowCount: input.responsePolicy?.coverageWindows.length ?? 0,
    allowedQuestionIds: [...(input.responsePolicy?.allowedQuestionIds ?? [])],
    escalationOwner: input.responsePolicy?.escalationOwner ?? null,
    factSetId: input.approvedFacts?.factSetId ?? null,
    approvedFactIds: [...(input.approvedFacts?.approvedFactIds ?? [])],
    conversationId: input.inbound?.conversationId ?? null,
    inboundVersion: input.inbound?.inboundVersion ?? 0,
    inboundMessageId: input.inbound?.inboundMessageId ?? null,
    customerQuestionId: input.inbound?.customerQuestionId ?? null,
    channel: input.inbound?.channel ?? null,
    evaluationId: input.allowedAction?.evaluationId ?? null,
    questionAllowed: input.allowedAction?.questionAllowed ?? false,
    sourcesCited: [...(input.allowedAction?.sourcesCited ?? [])],
    inspectedOrAllowed: input.allowedAction?.inspectedOrAllowed ?? false,
    outboundMessageId: input.sendAndLead?.outboundMessageId ?? null,
    preparedAtVersion: input.sendAndLead?.preparedAtVersion ?? 0,
    sendReceiptId: input.sendAndLead?.sendReceiptId ?? null,
    leadId: input.sendAndLead?.leadId ?? null,
    crmRecordId: input.sendAndLead?.crmRecordId ?? null,
    sendRecorded: input.sendAndLead?.sendRecorded ?? false,
    auditEventId: input.ownershipAudit?.auditEventId ?? null,
    takeoverFromVersion: input.ownershipAudit?.fromVersion ?? 0,
    takeoverToVersion: input.ownershipAudit?.toVersion ?? 0,
    actorUserId: input.ownershipAudit?.actorUserId ?? null,
    humanOwned: input.ownershipAudit?.humanOwned ?? false,
    agentSendAllowed: input.ownershipAudit?.agentSendAllowed ?? true,
    competingRepliesPrevented:
      input.ownershipAudit?.competingRepliesPrevented ?? false,
    handoffId: input.morningHandoff?.handoffId ?? null,
    handoffNextOwner: input.morningHandoff?.nextOwner ?? null,
    handoffAcknowledged: input.morningHandoff?.acknowledged ?? false,
    morningReviewCompleted:
      input.morningHandoff?.morningReviewCompleted ?? false,
    afterHoursVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preservedInputCount(input),
  };
}

/**
 * Evaluate the T-F22 handle-after-hours-messages-and-takeover path offline.
 * Complete F22 evidence package → HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_EVIDENCE_RECORDED;
 * incomplete / unsafe claims refuse closed. Live NOT_WIRED; externalEffects NONE.
 */
export function evaluateHandleAfterHoursMessagesAndTakeover(
  input: HandleAfterHoursMessagesAndTakeoverInput,
): HandleAfterHoursMessagesAndTakeoverDecision {
  const refuse = (
    code: Extract<
      HandleAfterHoursMessagesAndTakeoverDecision,
      { allowed: false }
    >["code"],
    reason: string,
    blockingDecision: string,
    currentState: NonNullable<
      Extract<
        HandleAfterHoursMessagesAndTakeoverDecision,
        { allowed: false }
      >["evidence"]
    >["currentState"],
    recoveryPath: NonNullable<
      Extract<
        HandleAfterHoursMessagesAndTakeoverDecision,
        { allowed: false }
      >["evidence"]
    >["recoveryPath"],
  ): HandleAfterHoursMessagesAndTakeoverDecision => ({
    allowed: false,
    code,
    afterHoursHandledRecorded: false,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    productionWrites: false,
    evidence: emptyEvidence(input, blockingDecision, currentState, recoveryPath),
    reasons: [reason],
  });

  if (input.requestLiveProviderWiring) {
    return refuse(
      "LIVE_PROVIDER_WIRING_NOT_WIRED",
      "Live after-hours inbox/CRM apply remains NOT_WIRED — refuse live wiring (T-F22)",
      "LIVE_PROVIDER_WIRING_REFUSED",
      "BLOCKED",
      "KEEP_FIXTURE_AFTER_HOURS_NO_LIVE_PROVIDER",
    );
  }

  if (input.claimLiveVerifiedAfterHours) {
    return refuse(
      "FALSE_LIVE_VERIFIED_AFTER_HOURS_REFUSED",
      "Refused false live-verified after-hours / takeover claim offline (T-F22) — fixture ACCEPTED ≠ VERIFIED",
      "FALSE_LIVE_VERIFIED_REFUSED",
      "BLOCKED",
      "KEEP_FIXTURE_AFTER_HOURS_NO_LIVE_PROVIDER",
    );
  }

  if (input.requestCompetingReplyAfterTakeover) {
    return refuse(
      "COMPETING_REPLY_AFTER_TAKEOVER_REFUSED",
      "Competing agent reply after takeover refused (T-F22); no competing replies",
      "COMPETING_REPLY_REFUSED",
      "BLOCKED",
      "REFUSE_COMPETING_REPLY",
    );
  }

  if (!input.packageId.trim() || !policyOk(input.responsePolicy)) {
    return refuse(
      "RESPONSE_POLICY_REQUIRED",
      "F22 requires package id and response policy with coverage windows, allowed questions, and escalation owner (T-F22)",
      "RESPONSE_POLICY_REQUIRED",
      "AWAITING_RESPONSE_POLICY",
      "SET_COVERAGE_ALLOWED_QUESTIONS_ESCALATION",
    );
  }

  if (!factsOk(input.approvedFacts)) {
    return refuse(
      "APPROVED_FACTS_REQUIRED",
      "F22 requires approved facts with factSetId + at least one approvedFactId (T-F22)",
      "APPROVED_FACTS_REQUIRED",
      "AWAITING_APPROVED_FACTS",
      "APPROVE_BUSINESS_FACTS",
    );
  }

  if (!input.inboxConnectionReady) {
    return refuse(
      "INBOX_CONNECTION_REQUIRED",
      "F22 requires a supported inbox connection (T-F22)",
      "INBOX_CONNECTION_REQUIRED",
      "AWAITING_INBOX_CONNECTION",
      "CONNECT_SUPPORTED_INBOX",
    );
  }

  if (!inboundOk(input.inbound)) {
    return refuse(
      "INBOUND_CONVERSATION_REQUIRED",
      "F22 requires inbound conversation with conversationId, versions, message, and question (T-F22)",
      "INBOUND_CONVERSATION_REQUIRED",
      "AWAITING_INBOUND_CONVERSATION",
      "RECEIVE_INBOUND_CONVERSATION",
    );
  }

  if (
    !actionOk(
      input.allowedAction,
      input.responsePolicy,
      input.approvedFacts,
      input.inbound,
    )
  ) {
    return refuse(
      "ALLOWED_ACTION_EVALUATION_REQUIRED",
      "F22 requires allowed-action evaluation: question in policy, sources from approved facts, inspected/allowed (T-F22)",
      "ALLOWED_ACTION_EVALUATION_REQUIRED",
      "AWAITING_ALLOWED_ACTION_EVALUATION",
      "INSPECT_OR_ALLOW_PROPOSED_RESPONSE",
    );
  }

  if (!sendOk(input.sendAndLead, input.inbound)) {
    return refuse(
      "POLICY_SEND_AND_LEAD_REQUIRED",
      "F22 requires policy send receipt + CRM lead link at inbound conversation version (T-F22)",
      "POLICY_SEND_AND_LEAD_REQUIRED",
      "AWAITING_POLICY_SEND_AND_LEAD",
      "SEND_WITHIN_POLICY_AND_LOG_LEAD",
    );
  }

  if (!auditOk(input.ownershipAudit, input.sendAndLead)) {
    return refuse(
      "OWNERSHIP_AUDIT_REQUIRED",
      "F22 requires ownership audit takeover event (version bump, humanOwned, no competing replies) (T-F22)",
      "OWNERSHIP_AUDIT_REQUIRED",
      "AWAITING_OWNERSHIP_AUDIT",
      "TAKE_OVER_AND_RECORD_OWNERSHIP_AUDIT",
    );
  }

  if (!handoffOk(input.morningHandoff, input.responsePolicy)) {
    return refuse(
      "ACKNOWLEDGED_HANDOFF_REQUIRED",
      "F22 requires acknowledged morning handoff to escalation owner (T-F22)",
      "ACKNOWLEDGED_HANDOFF_REQUIRED",
      "AWAITING_ACKNOWLEDGED_HANDOFF",
      "ACKNOWLEDGE_MORNING_HANDOFF",
    );
  }

  return {
    allowed: true,
    code: "HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_EVIDENCE_RECORDED",
    afterHoursHandledRecorded: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    productionWrites: false,
    evidence: {
      packageId: input.packageId,
      policyId: input.responsePolicy.policyId,
      timezone: input.responsePolicy.timezone,
      coverageWindowCount: input.responsePolicy.coverageWindows.length,
      allowedQuestionIds: [...input.responsePolicy.allowedQuestionIds],
      escalationOwner: input.responsePolicy.escalationOwner,
      factSetId: input.approvedFacts.factSetId,
      approvedFactIds: [...input.approvedFacts.approvedFactIds],
      conversationId: input.inbound.conversationId,
      inboundVersion: input.inbound.inboundVersion,
      inboundMessageId: input.inbound.inboundMessageId,
      customerQuestionId: input.inbound.customerQuestionId,
      channel: input.inbound.channel,
      evaluationId: input.allowedAction.evaluationId,
      questionAllowed: true,
      sourcesCited: [...input.allowedAction.sourcesCited],
      inspectedOrAllowed: true,
      outboundMessageId: input.sendAndLead.outboundMessageId,
      preparedAtVersion: input.sendAndLead.preparedAtVersion,
      sendReceiptId: input.sendAndLead.sendReceiptId,
      leadId: input.sendAndLead.leadId,
      crmRecordId: input.sendAndLead.crmRecordId,
      sendRecorded: true,
      auditEventId: input.ownershipAudit.auditEventId,
      takeoverFromVersion: input.ownershipAudit.fromVersion,
      takeoverToVersion: input.ownershipAudit.toVersion,
      actorUserId: input.ownershipAudit.actorUserId,
      humanOwned: true,
      agentSendAllowed: false,
      competingRepliesPrevented: true,
      handoffId: input.morningHandoff.handoffId,
      handoffNextOwner: input.morningHandoff.nextOwner,
      handoffAcknowledged: true,
      morningReviewCompleted: true,
      afterHoursVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F22_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "AFTER_HOURS_HANDLED_HANDOFF_ACKNOWLEDGED",
      recoveryPath: "KEEP_FIXTURE_AFTER_HOURS_NO_LIVE_PROVIDER",
      preservedInputCount: preservedInputCount(input),
    },
    reasons: [
      "Complete F22 evidence package recorded offline — fixture ACCEPTED only; not live VERIFIED",
    ],
  };
}
