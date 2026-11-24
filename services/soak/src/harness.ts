/**
 * Soak / recovery harness — crash-restart, no duplicate effects,
 * durable job/effect continuity, unknown-remote reconcile,
 * backup/omit-receipt post-restore reconcile (T-X066),
 * recover/rotate/reconcile/offboard (T-F24 / T-US-047),
 * competing-supervisor / singleton host lease (T-US-002 / T-X002),
 * self-approval rejected / independent A25 (T-X018 / T-US-054),
 * offboard ACTIVE_TOKEN residual incomplete-until-revoked (T-X073),
 * emergency stop at commit (T-US-060),
 * forged browser role ignored (T-X005),
 * cross-workspace reference denied (T-X006),
 * approved payload edit / stale approval invalidated (T-X019 / T-US-036),
 * cross-workspace resource substitution (T-US-057),
 * agent cannot widen grant (T-US-024),
 * repair weaken test rejected (T-US-042 / T-X057),
 * takeover cancels unsent replies (T-US-044 / T-X053),
 * EVAL_ONLY operational tool forbidden (T-US-018 / T-X037),
 * repair attempt limit escalated (T-X058),
 * imported doc quarantined as data (T-X069),
 * eval no-grounding fail closed (T-X038),
 * metric denominators honest (T-X039 / T-US-058),
 * hard search constraints no invention (T-US-046 / T-X048),
 * GSC omitted rows unknown not zero (T-US-010 / T-X033),
 * GA4 debug not delivered conversion (T-US-008 / T-X032),
 * GA4 wrong property kind refused (T-X031),
 * thank-you without CRM fails delivery (T-US-040 / T-X049),
 * stop after provider dispatch reconcile (T-X017),
 * old fence after reassignment (T-X024),
 * output bomb bounded/quarantined (T-X011),
 * symlink escape after root verification (T-X003),
 * public synthetic flag requires server grant (T-X050),
 * malicious prompt no shell injection (T-X010).
 * DST recurring schedule no duplicates (T-X015).
 * wrong CMS environment no production op (T-X007).
 * stop before dispatch claim — no adapter mutation (T-X016),
 * idempotency key payload mismatch (T-X022).
 * worker browser auth state OS deny (T-X065).
 * external human edit during staging conflict retained (T-X025).
 * validated payload not collected separate failure states (T-X070).
 * unbound write path fail closed (T-US-006).
 * rate-limit bounded backoff preserves deadline (T-X030).
 * low-sample trend spike insufficient evidence (T-X040).
 * incomparable trend indices rejected/labeled (T-X041).
 * schema differs from page gate fails (T-X042).
 * unsupported blog destination no fake publication (T-X046).
 * layout-specific capacity mismatch filters (T-X047).
 * wrong Zoho organization identity mismatch (T-X051).
 * SSE gap after offline UI full-state resync (T-X062).
 * Google Ads test vs production access separated (T-US-012).
 * Connect Claude Code + test API EVAL_ONLY (T-US-015).
 * Connect Gemini Evaluation EVAL_ONLY (T-US-017).
 * Grant standing autonomy control receipts (T-US-023).
 * Launch workstream schedule mission outcome (T-US-025).
 * Missed schedule coalesce no burst republish (T-US-026).
 * Demand page improvement release receipt (T-US-027).
 * Keyword proliferation → one useful page update (T-US-028).
 * Original campaign distribution campaign manifest (T-US-029).
 * Uncertain post reconcile before retry (T-US-030).
 * Paid-media recommendation mutation or failure (T-US-031).
 * Eval suite adjudication + backlog (T-US-033).
 * Provider error ≠ bad answer or pass (T-US-034).
 * Review/revise/release receipt or blocked exception (T-US-035).
 * Daily owner review operating knowledge (T-US-049).
 * Owner brief root-cause actionable (T-US-050).
 * exact financial boundaries preserved (T-US-032).
 * portable analysis artifact (T-US-037).
 * trusted workspace readiness blockers + next actions (T-US-001).
 * approval wait survives restart / no slot hold (T-X014),
 * Uses file-backed durable stores so a second process image can resume.
 * External effects: none (fake provider only).
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ApprovalWaitManifestIntegrity,
  ApprovalWaitPhase,
  ApprovalWaitSlotLease,
  EffectState, OutagePlane, SOAK_FIXTURE_HARNESS_NOW_ISO, SoakProofKind,
  classifyRecoveryObservation, evaluateUnknownRemoteReconcile,
  recordTimeoutAfterProviderAcceptance, unknownRemoteBlocksBlindResend,
  unknownRemoteHonestyPins, isUnknownRemoteResumeAuthorized,
  unknownRemoteDistinctFromUncertainPost, type SoakProofKindValue, type SoakProofRecord,
} from "@worksocial/domain";
import {
  createDurableExecutionService,
  createFileDurableStores,
  newJobId,
  type AcceptPendingInput,
  type DurableExecutionService,
  type FakeProviderEffect,
} from "@worksocial/persistence";
import { proofRecoverRotateReconcile } from "./recover-rotate-proof.js";
import { proofCompetingSupervisorLease } from "./competing-supervisor-proof.js";
import { proofSelfApprovalRejected } from "./self-approval-proof.js";
import { proofOffboardActiveTokenResidual } from "./offboard-active-token-proof.js";
import { proofEmergencyStopAtCommit } from "./emergency-stop-proof.js";
import { proofForgedBrowserRoleIgnored } from "./forged-browser-role-proof.js";
import { proofCrossWorkspaceReferenceDenied } from "./cross-workspace-reference-proof.js";
import { proofApprovedPayloadEditInvalidated } from "./approved-payload-edit-proof.js";
import { proofExternalHumanEditConflictRetained } from "./external-human-edit-staging-proof.js";
import { proofOptimizationBreaksCtaJourneyFails } from "./optimization-breaks-cta-proof.js";
import { proofConcurrentFinalBudgetReservationCap } from "./concurrent-final-budget-reservation-proof.js";
import { proofSyntheticConversionContaminationExcluded } from "./synthetic-conversion-contamination-proof.js";
import { proofReplySentCrmReconcilesNoResend } from "./reply-sent-crm-reconcile-proof.js";
import { proofUnknownPolicyQuestionEscalatesWithoutPromise } from "./unknown-policy-question-proof.js";
import { proofAutomatedResponseLoopBoundedHandoff } from "./automated-response-loop-proof.js";
import { proofSsrfRedirectDnsRebindBlockedEveryHop } from "./ssrf-redirect-dns-rebind-proof.js";
import { proofHostOfflinePublicDiscoveryUnavailable } from "./host-offline-public-discovery-proof.js";
import { proofIncompatibleWorkflowUpgradeBlockedOrRetained } from "./incompatible-workflow-upgrade-proof.js";
import {
  proofApprovalWaitFromObservedJobContinuity,
  proofApprovalWaitFromObservedRestart,
} from "./approval-wait-survives-restart-proof.js";
import { proofAdsTestProjectProductionBlocked } from "./ads-test-project-production-proof.js";
import { proofSharedAdBudgetExternalChangeInvalidates } from "./shared-ad-budget-external-change-proof.js";
import { proofRecentAdsConversionBlankPending } from "./recent-ads-conversion-blank-proof.js";
import { proofDuplicatePlatformAttributionOneBooking } from "./duplicate-platform-attribution-proof.js";
import { proofCurrencyTimezoneMismatchNoSilentSum } from "./currency-timezone-mismatch-proof.js";
import { proofValidatedPayloadNotCollectedSeparateStates } from "./validated-payload-not-collected-proof.js";
import { proofUnboundWritePathFailClosed } from "./unbound-write-path-proof.js";
import { proofEventualConsistencyFalseNotFound } from "./eventual-consistency-false-not-found-proof.js";
import { proofMockedConnectorNotProductionReady } from "./mocked-connector-not-production-ready-proof.js";
import { proofRateLimitBoundedBackoffPreservesDeadline } from "./rate-limit-deadline-proof.js";
import { proofHonestOutageHostedContact } from "./honest-outage-hosted-contact-proof.js";
import { proofLowSampleTrendSpikeInsufficientEvidence } from "./low-sample-trend-spike-proof.js";
import { proofIncomparableTrendIndicesRejected } from "./incomparable-trend-indices-proof.js";
import { proofSchemaDiffersFromPageGateFails } from "./schema-differs-from-page-proof.js";
import { proofUnsupportedBlogDestinationNoFakePublication } from "./unsupported-blog-destination-proof.js";
import { proofLayoutSpecificCapacityMismatchFilters } from "./layout-capacity-mismatch-proof.js";
import { proofWrongZohoOrganizationIdentityMismatch } from "./wrong-zoho-organization-proof.js";
import { proofSseGapFullStateResync } from "./sse-gap-full-resync-proof.js";
import { proofKeyboardFocusRestoreAfterDialog } from "./keyboard-focus-restore-proof.js";
import { proofThirtyAlertsOneOutageGrouped } from "./alert-outage-grouping-proof.js";
import { proofCustomerDataEvalRedactionBlocks } from "./customer-eval-redaction-proof.js";
import { proofGoogleAdsTestProductionAccessSeparated } from "./google-ads-test-production-access-proof.js";
import { proofConnectClaudeCodeTestApiEvalOnly } from "./claude-code-test-api-connect-proof.js";
import { proofClaudeRuntimeEvalAuthSeparated } from "./claude-runtime-eval-auth-proof.js";
import { proofConnectGeminiEvaluationEvalOnly } from "./gemini-evaluation-connect-proof.js";
import { proofMapCrmFormsBookingFailureRecovery } from "./crm-forms-booking-map-proof.js";
import { proofSyntheticLeadsClassifiedNoCommercePollution } from "./synthetic-lead-classification-proof.js";
import { proofConnectLocalSocialInboxTestArtifact } from "./local-social-inbox-connect-proof.js";
import { proofUnsupportedDestinationCapabilitiesRespected } from "./unsupported-destination-capabilities-proof.js";
import { proofStandingAutonomyGrantControlReceipts } from "./standing-autonomy-grant-proof.js";
import { proofLaunchWorkstreamScheduleMissionOutcome } from "./workstream-schedule-launch-proof.js";
import { proofMissedScheduleCoalesceNoBurst } from "./missed-schedule-coalesce-proof.js";
import { proofDemandPageImprovementReleaseReceipt } from "./demand-page-improvement-proof.js";
import { proofKeywordProliferationOneUsefulUpdate } from "./keyword-proliferation-gate-proof.js";
import { proofCampaignManifestDistribution } from "./campaign-manifest-distribution-proof.js";
import { proofUncertainPostReconcileBeforeRetry } from "./uncertain-post-reconcile-proof.js";
import { proofPaidMediaRecommendationMutationOrFailure } from "./paid-media-recommendation-mutation-proof.js";
import { proofEvalSuiteAdjudicationBacklog } from "./eval-suite-adjudication-proof.js";
import { proofProviderErrorNotPass } from "./provider-error-not-pass-proof.js";
import { proofReviewReviseRelease } from "./review-revise-release-proof.js";
import { proofDailyOwnerReview } from "./daily-owner-review-proof.js";
import { proofOwnerBriefRootCause } from "./owner-brief-root-cause-proof.js";
import { proofDesignReleaseReadiness } from "./design-release-readiness-proof.js";
import { proofSecretsNeverBrowserAssets } from "./secrets-never-browser-assets-proof.js";
import { proofKeyboardJourneyReducedMotion } from "./keyboard-journey-reduced-motion-proof.js";
import { proofSharedBriefsRedactedPrivateRetained } from "./shared-briefs-redacted-private-retained-proof.js";
import { proofCreateTrustedLocalWorkspace } from "./create-trusted-local-workspace-proof.js";
import { proofChooseFoldersEstablishBusinessTruth } from "./choose-folders-establish-business-truth-proof.js";
import { proofBusinessTruthFoldersRestoreSecretsExcluded } from "./business-truth-folders-proof.js";
import { proofMapSitesPagesEditableSources } from "./map-sites-pages-editable-sources-proof.js";
import { proofConnectGoogleAnalytics4 } from "./connect-google-analytics-4-proof.js";
import { proofConnectSearchConsoleOrganicVisibility } from "./connect-search-console-organic-visibility-proof.js";
import { proofConnectGoogleAdsControlledAnalysis } from "./connect-google-ads-controlled-analysis-proof.js";
import { proofConnectClaudeCodeAndTestApi } from "./connect-claude-code-and-test-api-proof.js";
import { proofConnectGeminiIndependentTesting } from "./connect-gemini-independent-testing-proof.js";
import { proofMapCrmFormsBookingTruth } from "./map-crm-forms-booking-truth-proof.js";
import { proofConnectLocalSocialInboxChannels } from "./connect-local-social-inbox-channels-proof.js";
import { proofGrantStandingAutonomySafely } from "./grant-standing-autonomy-safely-proof.js";
import { proofLaunchWorkstreamRecurringSchedule } from "./launch-workstream-recurring-schedule-proof.js";
import { proofTurnDemandIntoPageImprovement } from "./turn-demand-into-page-improvement-proof.js";
import { proofCreateAndDistributeOriginalCampaign } from "./create-and-distribute-original-campaign-proof.js";
import { proofReviewPaidMediaRecommendations } from "./review-paid-media-recommendations-proof.js";
import { proofVerifyFormToCrmJourneyContinuously } from "./verify-form-to-crm-journey-continuously-proof.js";
import { proofHandleAfterHoursMessagesAndTakeover } from "./handle-after-hours-messages-and-takeover-proof.js";
import { proofAnalyzePerformanceAndTestHypothesis } from "./analyze-performance-and-test-hypothesis-proof.js";
import { proofReviewReviseAndReleaseAChange } from "./review-revise-and-release-a-change-proof.js";
import { proofDiagnoseAndRepairPermittedDefect } from "./diagnose-and-repair-permitted-defect-proof.js";
import { proofCalibrateDesignReleaseReadiness } from "./calibrate-design-release-readiness-proof.js";
import { runExplicitAccountRebindProof } from "@worksocial/credential-rotation";
import { proofCrossWorkspaceResourceSubstitution } from "./cross-workspace-substitution-proof.js";
import { proofAgentCannotWidenGrant } from "./agent-cannot-widen-grant-proof.js";
import { proofRepairWeakenTestRejected } from "./repair-weaken-test-proof.js";
import { proofTakeoverCancelsUnsentReplies } from "./takeover-cancel-unsent-proof.js";
import { proofEvalOnlyOperationalToolForbidden } from "./eval-only-operational-tool-proof.js";
import { proofRepairAttemptLimitEscalated } from "./repair-attempt-limit-proof.js";
import { proofImportedDocQuarantinedAsData } from "./imported-doc-quarantine-proof.js";
import { proofEvalNoGroundingFailClosed } from "./eval-no-grounding-proof.js";
import { proofMetricDenominatorsHonest } from "./metric-denominators-proof.js";
import { proofHardSearchConstraintsNoInvention } from "./hard-search-constraints-proof.js";
import { proofGscOmittedRowsUnknownNotZero } from "./gsc-omitted-rows-proof.js";
import { proofGa4DebugNotDeliveredConversion } from "./ga4-debug-not-delivered-proof.js";
import { proofGa4WrongPropertyKindRefused } from "./ga4-wrong-property-kind-proof.js";
import { proofThankYouWithoutCrmFailsDelivery } from "./thank-you-without-crm-proof.js";
import { proofStopAfterDispatchReconcile } from "./stop-after-dispatch-proof.js";
import { proofOldFenceAfterReassignment } from "./old-fence-after-reassignment-proof.js";
import { proofOutputBombBoundedQuarantined } from "./output-bomb-proof.js";
import { proofSymlinkEscapeAfterRootVerification } from "./symlink-escape-proof.js";
import { proofPublicSyntheticFlagRequiresServerGrant } from "./public-synthetic-flag-proof.js";
import { proofMaliciousPromptNoShellInjection } from "./malicious-prompt-interpolation-proof.js";
import { proofCliErrorDespiteExitZero } from "./cli-error-despite-exit-zero-proof.js";
import { proofDstRecurringScheduleNoDuplicates } from "./dst-recurring-schedule-proof.js";
import { proofHostSleepMonitoringCoverageGap } from "./host-sleep-monitoring-proof.js";
import { proofConcurrentIdempotentRelease } from "./concurrent-idempotent-release-proof.js";
import { proofFactChangesAfterReviewStale } from "./fact-changes-after-review-proof.js";
import { proofOrphanWorkerDeadlineTreeStopped } from "./orphan-worker-deadline-proof.js";
import { proofWrongCmsEnvironmentNoProductionOp } from "./wrong-cms-environment-proof.js";
import { proofStopBeforeDispatchClaim } from "./stop-before-dispatch-proof.js";
import { proofIndirectPromptInjectionExfilDenied } from "./indirect-prompt-injection-exfil-proof.js";
import { proofUnlicensedVenueMediaPublishBlocked } from "./unlicensed-venue-media-proof.js";
import { proofPartialCampaignDestinationsPerState } from "./partial-campaign-destinations-proof.js";
import { proofIdempotencyKeyPayloadMismatch } from "./idempotency-key-payload-mismatch-proof.js";
import { proofWorkerBrowserAuthStateOsDenied } from "./browser-auth-state-proof.js";
import { proofUnknownUsageCancelHoldsResidual } from "./unknown-usage-cancel-proof.js";
import { proofActualCostExceedsEstimateOverrunVisible } from "./actual-cost-exceeds-estimate-proof.js";
import { proofReplayHistoricalNoRepeatIo } from "./replay-historical-workflow-proof.js";
import { proofDiskFullEvidenceNoPartialCompleted } from "./disk-full-evidence-proof.js";
import { proofTestSemanticSearchImproveNoResult } from "./test-semantic-search-improve-no-result-proof.js";
import { proofRunClaudeGeminiEvaluationSuites } from "./run-claude-gemini-evaluation-suites-proof.js";
import { proofOperateDailyOwnerReview } from "./operate-daily-owner-review-proof.js";
import { proofUnsafeFoldersUnresolvedFactsBlocked } from "./unsafe-folders-unresolved-facts-proof.js";
import { proofSitePageEditableSourcesBaseline } from "./site-page-editable-sources-proof.js";
import { proofDiagnoseRepairDefectResolvedOrHandoff } from "./diagnose-repair-defect-proof.js";
import { proofExactFinancialBoundariesPreserved } from "./exact-financial-boundaries-proof.js";
import { proofConnectGa4ReadReadyNextSync } from "./connect-ga4-read-ready-proof.js";
import { proofConnectGscScheduleWatermark } from "./connect-gsc-schedule-watermark-proof.js";
import { proofConnectGoogleAdsAnalyzeOnlyWriteDisabled } from "./connect-google-ads-analyze-only-proof.js";
import { proofSemanticSearchNoResultEvalComparison } from "./semantic-search-no-result-eval-proof.js";
import { proofPortableAnalysisArtifact } from "./portable-analysis-artifact-proof.js";
import { proofTrustedWorkspaceReadinessBlockersNextActions } from "./trusted-workspace-readiness-proof.js";
import { proofFormCrmContinuousVerifyCadenceHeartbeat } from "./form-crm-continuous-verify-proof.js";
import { proofAfterHoursHandoffAcknowledged } from "./after-hours-handoff-ack-proof.js";

type FileLedgerSnapshot = {
  version: 1;
  jobs: unknown[];
  intents: unknown[];
  attempts: unknown[];
  decisions: unknown[];
  receipts: unknown[];
  providerEffects: FakeProviderEffect[];
};

export type SoakHarnessResult = {
  proofs: SoakProofRecord[];
  allPassed: boolean;
  details: string[];
};

function openService(stateDir: string): DurableExecutionService {
  return createDurableExecutionService(createFileDurableStores(stateDir));
}

function nowPlus(baseIso: string, ms: number): string {
  return new Date(Date.parse(baseIso) + ms).toISOString();
}

function decisionFields(
  operationId: string,
  payloadDigest: string,
  nowIso: string,
  reason: string,
): AcceptPendingInput["decision"] {
  return {
    decisionId: `dec-${operationId}`,
    operationId,
    payloadDigest,
    allowed: true,
    code: null,
    reason,
    grantId: "grant-soak",
    policyId: "pol-soak",
    decidedAtIso: nowIso,
    writePathId: "wp-soak",
    gateDetails: ["soak_harness"],
  };
}

function jobFields(operationId: string, jobId: string, idem: string) {
  return {
    jobId,
    roleId: "A19",
    workflowId: `wf-${operationId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_harness",
    policyVersion: "m9",
    inputArtifactIds: [] as string[],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 2,
    deadlineSeconds: 600,
    idempotencyKey: idem,
    expectedOutcome: "verified_publish",
  };
}

async function proofCrashRestart(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-restart-${randomUUID()}`;
  const bizKey = `biz-soak-restart-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();

  const a = openService(stateDir);
  const accepted = await a.acceptPending({
    job: jobFields(operationId, jobId, `soak/restart/${operationId}`),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak crash-restart accept"),
    nowIso,
  });
  details.push(`Accepted ACCEPTED_PENDING applyCount=${accepted.applyAttemptCount}`);

  const b = openService(stateDir);
  const decision = await b.getDecision(operationId);
  if (!decision || decision.outcome !== "ACCEPTED_PENDING") {
    details.push(`After restart decision=${decision?.outcome ?? "missing"}`);
    return failProof(
      SoakProofKind.CRASH_RESTART,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }
  details.push("Rehydrated ACCEPTED_PENDING after restart");

  const applyAfterRestart = await b.stores.effects.countApplyAttempts(
    operationId,
  );

  const c = openService(stateDir);
  const decisionAfterSecond = await c.getDecision(operationId);
  if (
    !decisionAfterSecond ||
    decisionAfterSecond.outcome !== "ACCEPTED_PENDING"
  ) {
    details.push(
      `After 2nd restart decision=${decisionAfterSecond?.outcome ?? "missing"}`,
    );
    return failProof(
      SoakProofKind.CRASH_RESTART,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }
  details.push("Rehydrated ACCEPTED_PENDING after 2nd restart");
  const applyAfterSecond = await c.stores.effects.countApplyAttempts(
    operationId,
  );

  const mapOutcome = (outcome: string | undefined) =>
    outcome === "ACCEPTED_PENDING"
      ? ApprovalWaitPhase.WAITING_APPROVAL
      : outcome === "VERIFIED"
        ? ApprovalWaitPhase.AUTO_VERIFIED
        : ApprovalWaitPhase.REJECTED;

  const domain = proofApprovalWaitFromObservedRestart({
    operationId,
    jobId: accepted.job.jobId,
    phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
    phaseAfterRestart: mapOutcome(decision.outcome),
    holdsWorkerSlot: false,
    slotLease: ApprovalWaitSlotLease.RELEASED,
    applyAttemptCountBeforeRestart: accepted.applyAttemptCount,
    applyAttemptCountAfterRestart: applyAfterRestart,
    restartCount: 1,
    waitIdentityKeyBeforeRestart: bizKey,
    waitIdentityKeyAfterRestart: bizKey,
    manifestIntegrity: ApprovalWaitManifestIntegrity.OK,
    phaseAfterSecondRestart: mapOutcome(decisionAfterSecond.outcome),
    applyAttemptCountAfterSecondRestart: applyAfterSecond,
    slotLeaseAfterSecondRestart: ApprovalWaitSlotLease.RELEASED,
  });
  details.push(...domain.details);
  if (!domain.passed) {
    return failProof(
      SoakProofKind.CRASH_RESTART,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }

  const verified = await c.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 1000),
  });
  details.push(
    `Verified matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );
  const passed =
    verified.matched &&
    verified.applyAttemptCount === 1 &&
    verified.decision.outcome === "VERIFIED" &&
    domain.passed;

  return {
    proofId: `proof-crash-${operationId}`,
    kind: SoakProofKind.CRASH_RESTART,
    passed,
    details,
    applyAttemptCount: verified.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 1000),
    fixtureOnly: true,
  };
}

async function proofNoDuplicateEffects(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-nodup-${randomUUID()}`;
  const bizKey = `biz-soak-nodup-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/nodup/${operationId}`;

  const svc = openService(stateDir);
  const first = await svc.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak no-dup first"),
    nowIso,
  });
  details.push(`First apply created=${first.providerCreated}`);

  const second = await svc.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowPlus(nowIso, 500),
      "soak no-dup retry",
    ),
    nowIso: nowPlus(nowIso, 500),
  });
  details.push(
    `Retry providerCreated=${second.providerCreated} applyCount=${second.applyAttemptCount}`,
  );

  const passed =
    first.providerCreated === true &&
    second.providerCreated === false &&
    second.applyAttemptCount === 1;

  return {
    proofId: `proof-nodup-${operationId}`,
    kind: SoakProofKind.NO_DUPLICATE_EFFECTS,
    passed,
    details,
    applyAttemptCount: second.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 500),
    fixtureOnly: true,
  };
}

async function proofJobContinuity(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-job-${randomUUID()}`;
  const bizKey = `biz-soak-job-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/job/${operationId}`;

  const a = openService(stateDir);
  const accepted = await a.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak job continuity"),
    nowIso,
  });
  details.push(`Job ${accepted.job.jobId} recorded`);

  const b = openService(stateDir);
  const again = await b.stores.jobs.insertIdempotent(
    jobFields(operationId, newJobId(), idem),
  );
  details.push(
    `After restart created=${again.created} sameJob=${again.job.jobId === accepted.job.jobId}`,
  );

  const decision = await b.getDecision(operationId);
  const domain = proofApprovalWaitFromObservedJobContinuity({
    operationId,
    jobIdBeforeRestart: accepted.job.jobId,
    jobIdAfterRestart: again.job.jobId,
    jobCreatedAfterRestart: again.created,
    phaseBeforeRestart: ApprovalWaitPhase.WAITING_APPROVAL,
    phaseAfterRestart:
      decision?.outcome === "ACCEPTED_PENDING"
        ? ApprovalWaitPhase.WAITING_APPROVAL
        : decision?.outcome === "VERIFIED"
          ? ApprovalWaitPhase.AUTO_VERIFIED
          : ApprovalWaitPhase.REJECTED,
    holdsWorkerSlot: false,
    slotLease: ApprovalWaitSlotLease.RELEASED,
    waitIdentityKeyBeforeRestart: bizKey,
    waitIdentityKeyAfterRestart: bizKey,
  });
  details.push(...domain.details);
  const passed =
    again.created === false &&
    again.job.jobId === accepted.job.jobId &&
    decision?.outcome === "ACCEPTED_PENDING" &&
    domain.passed;

  return {
    proofId: `proof-job-${operationId}`,
    kind: SoakProofKind.JOB_CONTINUITY,
    passed,
    details,
    applyAttemptCount: accepted.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 200),
    fixtureOnly: true,
  };
}

async function proofUnknownRemoteReconcile(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-reconcile-${randomUUID()}`;
  const bizKey = `biz-soak-reconcile-${operationId}`;
  const digest = `digest-${operationId}`;

  // Domain gate honesty: blind resend / false success / live wiring refused
  // while unknown (T-X020 / T-US-048). Distinct from T-US-030 uncertain post.
  const blind = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "ACCEPTED_PENDING",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: true,
    reconciledRemoteRef: null,
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const falseSuccess = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "ACCEPTED_PENDING",
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: null,
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: true,
    requestLiveProviderWiring: false,
  });
  const live = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "ACCEPTED_PENDING",
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: null,
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: true,
  });
  // Edge honesty (S4): ACCEPTED_PENDING phase cannot certify resume; sandbox
  // VERIFIED promotion refused (ACCEPTED ≠ VERIFIED).
  const phaseEdge = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "ACCEPTED_PENDING",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const sandboxVerified = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
    claimSandboxOrProdVerified: true,
  });
  // Edge honesty (S5): blank remoteRef vs verify-mismatch; applyCount=0.
  const blankRef = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "  ",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const verifyMismatch = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const neverApplied = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 0,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S6): negative apply; incoherent blind+reconcile; honesty pins.
  const negativeApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: -1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const incoherentBlind = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: true,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S7): non-finite apply; already-terminal COMPLETE.
  const nonFiniteApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: Number.NaN,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const terminalComplete = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.COMPLETE,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S8): Infinity apply; FAILED_RETRYABLE; distinct-from T-US-030.
  const infinityApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: Number.POSITIVE_INFINITY,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const retryableNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.FAILED_RETRYABLE,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S9): CANCELLED/QUARANTINED terminal; -Infinity apply; expanded distinct pins.
  const terminalCancelled = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.CANCELLED,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const terminalQuarantined = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.QUARANTINED,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const negInfinityApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: Number.NEGATIVE_INFINITY,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S10): fractional apply; WAITING_HUMAN not URO.
  const fractionalApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1.5,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const waitingNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.WAITING_HUMAN,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S11): RUNNING pre-apply not URO timeout path.
  const preApplyNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.RUNNING,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S12): APPLYING in-flight not URO timeout.
  const applyingNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.APPLYING,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  // Edge honesty (S13): VERIFYING post-apply verify not URO timeout.
  const verifyingNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.VERIFYING,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const pins = unknownRemoteHonestyPins();
  const distinct = unknownRemoteDistinctFromUncertainPost();
  const pinsOk =
    pins.liveProviderWiring === "NOT_WIRED" &&
    pins.externalEffects === "NONE" &&
    pins.fixtureOnly === true &&
    pins.acceptedEqualsVerified === false &&
    pins.relatedCaseIds.includes("T-X020") &&
    pins.relatedCaseIds.includes("T-US-048") &&
    distinct.thisRecoveryPath === "UNKNOWN_REMOTE_RECONCILE" &&
    distinct.distinctFromCaseIds.includes("T-US-030") &&
    distinct.distinctFromCaseIds.includes("T-US-060") &&
    distinct.distinctFromCaseIds.includes("T-X005") &&
    distinct.distinctFromCaseIds.includes("T-X006") &&
    distinct.distinctFromCaseIds.includes("T-X007") &&
    distinct.distinctFromCaseIds.includes("T-X016") &&
    distinct.distinctFromCaseIds.includes("T-X017") &&
    distinct.distinctFromCaseIds.includes("T-X018") &&
    distinct.distinctFromCaseIds.includes("T-X021") &&
    distinct.distinctFromCaseIds.includes("T-X022") &&
    distinct.distinctFromCaseIds.includes("T-X023") &&
    distinct.distinctFromCaseIds.includes("T-X024") &&
    distinct.distinctFromCaseIds.includes("T-X025") &&
    distinct.distinctFromCaseIds.includes("T-X026") &&
    distinct.distinctFromCaseIds.includes("T-X027") &&
    distinct.distinctFromCaseIds.includes("T-X028") &&
    distinct.distinctFromCaseIds.includes("T-X029") &&
    distinct.distinctFromCaseIds.includes("T-X030") &&
    distinct.distinctFromCaseIds.includes("T-X066") &&
    distinct.distinctFromProofs.includes("EMERGENCY_STOP_AT_COMMIT") &&
    distinct.distinctFromProofs.includes("FORGED_BROWSER_ROLE_IGNORED") &&
    distinct.distinctFromProofs.includes("CROSS_WORKSPACE_REFERENCE_DENIED") &&
    distinct.distinctFromProofs.includes("WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP") &&
    distinct.distinctFromProofs.includes("STOP_BEFORE_DISPATCH_NO_MUTATION") &&
    distinct.distinctFromProofs.includes("STOP_AFTER_DISPATCH_RECONCILE") &&
    distinct.distinctFromProofs.includes("SELF_APPROVAL_REJECTED") &&
    distinct.distinctFromProofs.includes("CONCURRENT_IDEMPOTENT_RELEASE") &&
    distinct.distinctFromProofs.includes("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH") &&
    distinct.distinctFromProofs.includes(
      "EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND",
    ) &&
    distinct.distinctFromProofs.includes("OLD_FENCE_AFTER_REASSIGNMENT") &&
    distinct.distinctFromProofs.includes(
      "EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED",
    ) &&
    distinct.distinctFromProofs.includes(
      "ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE",
    ) &&
    distinct.distinctFromProofs.includes(
      "CONCURRENT_FINAL_BUDGET_RESERVATION_CAP",
    ) &&
    distinct.distinctFromProofs.includes(
      "UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL",
    ) &&
    distinct.distinctFromProofs.includes("EXPLICIT_ACCOUNT_REBIND") &&
    distinct.distinctFromProofs.includes(
      "RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE",
    ) &&
    distinct.distinctFromProofs.includes("BACKUP_OMIT_RECEIPT") &&
    distinct.acceptedEqualsVerified === false;
  const domainGatesOk =
    blind.allowed === false &&
    blind.code === "BLIND_RESEND_REFUSED" &&
    falseSuccess.allowed === false &&
    falseSuccess.code === "FALSE_SUCCESS_CLAIM_REFUSED" &&
    live.allowed === false &&
    live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED" &&
    live.liveProviderWiring === "NOT_WIRED" &&
    phaseEdge.allowed === false &&
    phaseEdge.code === "PHASE_ACCEPTED_PENDING_NOT_URO" &&
    sandboxVerified.allowed === false &&
    sandboxVerified.code === "SANDBOX_VERIFIED_CLAIM_REFUSED" &&
    blankRef.allowed === false &&
    blankRef.code === "REMOTE_REF_REQUIRED" &&
    verifyMismatch.allowed === false &&
    verifyMismatch.code === "INDEPENDENT_VERIFY_REQUIRED" &&
    neverApplied.allowed === false &&
    neverApplied.code === "APPLY_NEVER_HAPPENED" &&
    negativeApply.allowed === false &&
    negativeApply.code === "APPLY_COUNT_NEGATIVE" &&
    incoherentBlind.allowed === false &&
    incoherentBlind.code === "INCOHERENT_BLIND_WITH_RECONCILE" &&
    nonFiniteApply.allowed === false &&
    nonFiniteApply.code === "APPLY_COUNT_NON_FINITE" &&
    infinityApply.allowed === false &&
    infinityApply.code === "APPLY_COUNT_NON_FINITE" &&
    terminalComplete.allowed === false &&
    terminalComplete.code === "EFFECT_STATE_ALREADY_TERMINAL" &&
    retryableNotUro.allowed === false &&
    retryableNotUro.code === "EFFECT_STATE_RETRYABLE_NOT_URO" &&
    terminalCancelled.allowed === false &&
    terminalCancelled.code === "EFFECT_STATE_ALREADY_TERMINAL" &&
    terminalQuarantined.allowed === false &&
    terminalQuarantined.code === "EFFECT_STATE_ALREADY_TERMINAL" &&
    negInfinityApply.allowed === false &&
    negInfinityApply.code === "APPLY_COUNT_NON_FINITE" &&
    fractionalApply.allowed === false &&
    fractionalApply.code === "APPLY_COUNT_NON_INTEGER" &&
    waitingNotUro.allowed === false &&
    waitingNotUro.code === "EFFECT_STATE_WAITING_NOT_URO" &&
    preApplyNotUro.allowed === false &&
    preApplyNotUro.code === "EFFECT_STATE_PRE_APPLY_NOT_URO" &&
    applyingNotUro.allowed === false &&
    applyingNotUro.code === "EFFECT_STATE_IN_FLIGHT_NOT_URO" &&
    verifyingNotUro.allowed === false &&
    verifyingNotUro.code === "EFFECT_STATE_VERIFYING_NOT_URO" &&
    pinsOk &&
    unknownRemoteBlocksBlindResend(EffectState.UNKNOWN_REMOTE_OUTCOME);
  if (domainGatesOk) {
    details.push(
      "Domain gate: blind/false/live/phase/sandbox/blankRef/verify/apply0/neg/incoherent/nonFinite/inf/terminal/retryable refused; distinct-from T-US-030/T-X017/T-X066; cancelled/quarantined/-inf/frac/waiting/preApply/applying/verifying; honesty pins OK (T-X020/T-US-048)",
    );
  } else {
    details.push(
      `Domain gate unexpected blind=${blind.code} falseSuccess=${falseSuccess.code} live=${live.code}`,
    );
  }

  const a = openService(stateDir);
  const accepted = await a.acceptPending({
    job: jobFields(operationId, newJobId(), `soak/reconcile/${operationId}`),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(operationId, digest, nowIso, "soak unknown remote"),
    nowIso,
  });
  details.push(
    `Left ACCEPTED_PENDING after provider ack apply=${accepted.applyAttemptCount}`,
  );

  // Simulate timeout after provider acceptance: drive persisted effect through
  // UNKNOWN_REMOTE_OUTCOME before reconcile (T-X020). Do not re-apply.
  const timeoutTargets = recordTimeoutAfterProviderAcceptance();
  const timedOut = await a.stores.effects.settle(
    operationId,
    timeoutTargets.outcome,
    timeoutTargets.effectState,
  );
  const decisionBefore = await a.getDecision(operationId);
  if (decisionBefore) {
    await a.stores.decisions.put({
      ...decisionBefore,
      // Keep ACCEPTED_PENDING outcome (provider ack); surface URO on effectState.
      effectState: timeoutTargets.effectState,
      reason: "Timeout after provider acceptance — unknown until independent read",
    });
  }
  const applyAfterTimeout = await a.stores.effects.countApplyAttempts(
    operationId,
  );
  const classified = classifyRecoveryObservation({
    nowMs: Date.parse(nowIso),
    lastObservedAtIso: nowIso,
    confirmedOutage: false,
    plane: OutagePlane.PROVIDER,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
  });
  const classificationOk =
    classified.classification === "UNKNOWN_REMOTE_OUTCOME" &&
    classified.blocksProviderRetry === true;
  if (classificationOk) {
    details.push(
      "Recovery classification UNKNOWN_REMOTE_OUTCOME blocksProviderRetry=true",
    );
  } else {
    details.push(
      `Recovery classification unexpected class=${classified.classification} blocksRetry=${classified.blocksProviderRetry}`,
    );
  }
  const persistedUro =
    timedOut.outcome === "UNKNOWN_REMOTE_OUTCOME" &&
    timedOut.effectState === EffectState.UNKNOWN_REMOTE_OUTCOME &&
    applyAfterTimeout === 1 &&
    timeoutTargets.liveProviderWiring === "NOT_WIRED" &&
    timeoutTargets.externalEffects === "NONE" &&
    classificationOk;
  if (persistedUro) {
    details.push(
      `Persisted UNKNOWN_REMOTE_OUTCOME after timeout (effectState=${timedOut.effectState} applyCount=${applyAfterTimeout}) — reconcile before resume`,
    );
  } else {
    details.push(
      `Expected persisted UNKNOWN_REMOTE_OUTCOME applyCount=1; got outcome=${timedOut.outcome} effectState=${timedOut.effectState} apply=${applyAfterTimeout}`,
    );
  }

  const b = openService(stateDir);
  const uroAfterRestart = await b.stores.effects.get(operationId);
  const decisionAfterRestart = await b.getDecision(operationId);
  const uroSurvivedRestart =
    uroAfterRestart?.outcome === "UNKNOWN_REMOTE_OUTCOME" &&
    uroAfterRestart.effectState === EffectState.UNKNOWN_REMOTE_OUTCOME &&
    decisionAfterRestart?.effectState === EffectState.UNKNOWN_REMOTE_OUTCOME &&
    decisionAfterRestart.outcome === "ACCEPTED_PENDING";
  if (uroSurvivedRestart) {
    details.push(
      "UNKNOWN_REMOTE_OUTCOME survived restart (decision ACCEPTED_PENDING+URO effectState; no re-apply)",
    );
  } else {
    details.push(
      `URO did not survive restart outcome=${uroAfterRestart?.outcome} effectState=${uroAfterRestart?.effectState} decision=${decisionAfterRestart?.outcome}/${decisionAfterRestart?.effectState}`,
    );
  }

  const provider = await b.stores.fakeProvider.getByBusinessKey(bizKey);
  if (!provider) {
    details.push("Missing provider effect after restart — cannot reconcile");
    return failProof(
      SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }
  details.push(`Reconciled remoteRef=${provider.remoteRef} without re-apply`);

  const verified = await b.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 1500),
  });
  details.push(
    `Post-reconcile verified matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );

  const gateAfter = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: verified.applyAttemptCount,
    requestBlindResend: false,
    reconciledRemoteRef: provider.remoteRef,
    independentVerifyMatched: verified.matched,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const gateOk =
    gateAfter.allowed &&
    gateAfter.code === "RECONCILED_VERIFIED_NO_RESEND" &&
    gateAfter.applyAttemptCount === 1 &&
    gateAfter.externalEffects === "NONE" &&
    gateAfter.fixtureOnly === true &&
    gateAfter.liveProviderWiring === "NOT_WIRED" &&
    isUnknownRemoteResumeAuthorized(gateAfter);
  if (gateOk) {
    details.push(
      "Domain gate: RECONCILED_VERIFIED_NO_RESEND authorized helper fixtureOnly externalEffects=NONE live NOT_WIRED",
    );
  } else {
    details.push(
      `Domain gate post-reconcile unexpected allowed=${gateAfter.allowed} code=${gateAfter.code}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  const passed =
    domainGatesOk &&
    persistedUro &&
    uroSurvivedRestart &&
    gateOk &&
    verified.matched &&
    verified.applyAttemptCount === 1 &&
    verified.decision.outcome === "VERIFIED";

  return {
    proofId: `proof-reconcile-${operationId}`,
    kind: SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
    passed,
    details,
    applyAttemptCount: verified.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 1500),
    fixtureOnly: true,
  };
}

function readLedger(stateDir: string): FileLedgerSnapshot {
  const ledgerPath = join(stateDir, "durable", "ledger.json");
  if (!existsSync(ledgerPath)) {
    throw new Error(`Missing ledger at ${ledgerPath}`);
  }
  return JSON.parse(readFileSync(ledgerPath, "utf8")) as FileLedgerSnapshot;
}

function writeLedger(stateDir: string, snap: FileLedgerSnapshot): void {
  const ledgerPath = join(stateDir, "durable", "ledger.json");
  mkdirSync(join(stateDir, "durable"), { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify(snap, null, 2), "utf8");
}

/**
 * T-X066: backup omits remote receipt → restore → reconcile from remote
 * system-of-record → verify / retry without a second apply.
 * Distinct from NO_DUPLICATE_EFFECTS (retry-only idempotency).
 */
async function proofBackupOmitReceipt(
  stateDir: string,
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  const operationId = `soak-backup-${randomUUID()}`;
  const bizKey = `biz-soak-backup-${operationId}`;
  const digest = `digest-${operationId}`;
  const jobId = newJobId();
  const idem = `soak/backup/${operationId}`;
  const primaryDir = join(stateDir, "backup-primary");
  const restoreDir = join(stateDir, "backup-restore");
  const remotePath = join(stateDir, "remote-provider-effects.json");
  const omitBackupPath = join(stateDir, "omit-receipt-backup.json");

  const primary = openService(primaryDir);
  const accepted = await primary.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowIso,
      "soak backup omit-receipt apply",
    ),
    nowIso,
  });
  details.push(
    `Applied ACCEPTED_PENDING applyCount=${accepted.applyAttemptCount} remoteRef=${accepted.provider.remoteRef}`,
  );

  const full = readLedger(primaryDir);
  if (full.providerEffects.length === 0 || full.receipts.length === 0) {
    details.push("Primary ledger missing provider effect or receipt after apply");
    return failProof(
      SoakProofKind.BACKUP_OMIT_RECEIPT,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }

  // Remote system of record still holds the effect (not part of the local backup).
  writeFileSync(
    remotePath,
    JSON.stringify(full.providerEffects, null, 2),
    "utf8",
  );

  // Backup intentionally omits remote receipt + local provider ledger copy.
  const omitBackup: FileLedgerSnapshot = {
    ...full,
    providerEffects: [],
    receipts: [],
  };
  writeFileSync(omitBackupPath, JSON.stringify(omitBackup, null, 2), "utf8");
  details.push(
    "Omit-receipt backup written (providerEffects=[] receipts=[]); remote ledger preserved separately",
  );

  writeLedger(restoreDir, omitBackup);

  const afterRestore = openService(restoreDir);
  const restoredDecision = await afterRestore.getDecision(operationId);
  const omittedLocal = await afterRestore.stores.fakeProvider.getByOperation(
    operationId,
  );
  const omittedReceipts = await afterRestore.stores.receipts.listForOperation(
    operationId,
  );
  details.push(
    `Post-restore decision=${restoredDecision?.outcome ?? "missing"} localProvider=${omittedLocal ? "present" : "omitted"} receipts=${omittedReceipts.length}`,
  );

  if (
    restoredDecision?.outcome !== "ACCEPTED_PENDING" ||
    omittedLocal !== undefined ||
    omittedReceipts.length !== 0
  ) {
    details.push("Restore did not produce ACCEPTED_PENDING with omitted receipt");
    return failProof(
      SoakProofKind.BACKUP_OMIT_RECEIPT,
      details,
      accepted.applyAttemptCount,
      operationId,
      nowIso,
    );
  }

  // Reconcile: rehydrate provider effects from remote SoR without a new apply.
  const remoteEffects = JSON.parse(
    readFileSync(remotePath, "utf8"),
  ) as FakeProviderEffect[];
  const restoredSnap = readLedger(restoreDir);
  writeLedger(restoreDir, {
    ...restoredSnap,
    providerEffects: remoteEffects,
  });
  details.push(
    `Reconciled remoteRef=${remoteEffects[0]?.remoteRef ?? "missing"} from remote SoR without re-apply`,
  );

  const reconciled = openService(restoreDir);
  const applyBeforeVerify =
    await reconciled.stores.effects.countApplyAttempts(operationId);
  const verified = await reconciled.verifyIndependent({
    operationId,
    observedDigest: digest,
    nowIso: nowPlus(nowIso, 2000),
  });
  details.push(
    `Post-reconcile verified matched=${verified.matched} applyCount=${verified.applyAttemptCount}`,
  );

  const retry = await reconciled.acceptPending({
    job: jobFields(operationId, jobId, idem),
    operationId,
    payloadDigest: digest,
    businessIdempotencyKey: bizKey,
    decision: decisionFields(
      operationId,
      digest,
      nowPlus(nowIso, 2500),
      "soak backup post-reconcile retry",
    ),
    nowIso: nowPlus(nowIso, 2500),
  });
  details.push(
    `Post-reconcile retry providerCreated=${retry.providerCreated} applyCount=${retry.applyAttemptCount}`,
  );

  const opRemoteEffects = remoteEffects.filter(
    (e) => e.operationId === operationId,
  );
  const remoteRefMatches =
    opRemoteEffects.length === 1 &&
    opRemoteEffects[0]?.remoteRef === accepted.provider.remoteRef;
  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from NO_DUPLICATE_EFFECTS (retry-only), UNKNOWN_REMOTE_RECONCILE (T-X020/T-US-048), and RECOVER_ROTATE_RECONCILE (T-F24/T-US-047)",
  );

  const passed =
    applyBeforeVerify === 1 &&
    remoteRefMatches &&
    verified.matched === true &&
    verified.applyAttemptCount === 1 &&
    verified.decision.outcome === "VERIFIED" &&
    retry.providerCreated === false &&
    retry.applyAttemptCount === 1;

  return {
    proofId: `proof-backup-${operationId}`,
    kind: SoakProofKind.BACKUP_OMIT_RECEIPT,
    passed,
    details,
    applyAttemptCount: verified.applyAttemptCount,
    operationId,
    createdAtIso: nowPlus(nowIso, 2500),
    fixtureOnly: true,
  };
}

function failProof(
  kind: SoakProofKindValue,
  details: string[],
  applyAttemptCount: number | null,
  operationId: string,
  nowIso: string,
): SoakProofRecord {
  return {
    proofId: `proof-fail-${kind}-${randomUUID()}`,
    kind,
    passed: false,
    details,
    applyAttemptCount,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}

/**
 * Run soak proofs (incl. T-X066 backup/omit-receipt, T-F24/T-US-047
 * recover/rotate/reconcile, T-US-002/T-X002 competing-supervisor lease,
 * T-X018/T-US-054 self-approval rejected, T-X073 offboard ACTIVE_TOKEN
 * residual, and T-US-060 emergency stop at commit) against a dedicated
 * durable state directory.
 * Safe for CI and documented 72h owner soak wrappers.
 * Pilot gate still requires the original four recovery proofs; backup proof
 * feeds fixture ACCEPTED for T-X066 only; recover/rotate feeds T-F24/T-US-047;
 * competing-supervisor lease feeds T-US-002/T-X002; self-approval feeds
 * T-X018/T-US-054; offboard ACTIVE_TOKEN residual feeds T-X073; emergency
 * stop feeds T-US-060; forged browser role feeds T-X005; cross-workspace
 * reference feeds T-X006; approved payload edit feeds T-X019/T-US-036; explicit rebind feeds T-X029;
 * cross-workspace substitution feeds T-US-057; agent cannot widen grant feeds T-US-024;
 * repair weaken test feeds T-US-042/T-X057; takeover cancel feeds T-US-044/T-X053;
 * EVAL_ONLY operational tool forbid feeds T-US-018/T-X037;
 * repair attempt limit feeds T-X058;
 * imported-doc quarantine feeds T-X069; eval no-grounding feeds T-X038;
 * metric denominators honest feeds T-X039/T-US-058;
 * hard search constraints feeds T-US-046/T-X048;
 * GSC omitted rows feeds T-US-010/T-X033;
 * GA4 debug not delivered feeds T-US-008/T-X032;
 * GA4 wrong property kind feeds T-X031;
 * thank-you without CRM feeds T-US-040/T-X049.
 */
export async function runSoakRecoveryHarness(input: {
  stateDir: string;
  nowIso?: string;
}): Promise<SoakHarnessResult> {
  // Default to deterministic after-hours fixture clock (not wall clock).
  const nowIso = input.nowIso ?? SOAK_FIXTURE_HARNESS_NOW_ISO;
  const durableDir = join(input.stateDir, "durable-soak");
  if (existsSync(durableDir)) {
    rmSync(durableDir, { recursive: true, force: true });
  }
  mkdirSync(durableDir, { recursive: true });
  const proofs: SoakProofRecord[] = [];

  proofs.push(await proofCrashRestart(durableDir, nowIso));
  proofs.push(await proofNoDuplicateEffects(durableDir, nowPlus(nowIso, 10_000)));
  proofs.push(await proofJobContinuity(durableDir, nowPlus(nowIso, 20_000)));
  proofs.push(
    await proofUnknownRemoteReconcile(durableDir, nowPlus(nowIso, 30_000)),
  );
  proofs.push(
    await proofBackupOmitReceipt(durableDir, nowPlus(nowIso, 40_000)),
  );
  proofs.push(
    await proofRecoverRotateReconcile(durableDir, nowPlus(nowIso, 50_000)),
  );
  proofs.push(proofCompetingSupervisorLease(nowPlus(nowIso, 60_000)));
  proofs.push(proofSelfApprovalRejected(nowPlus(nowIso, 70_000)));
  proofs.push(
    await proofOffboardActiveTokenResidual(durableDir, nowPlus(nowIso, 80_000)),
  );
  proofs.push(proofEmergencyStopAtCommit(nowPlus(nowIso, 90_000)));
  proofs.push(proofForgedBrowserRoleIgnored(nowPlus(nowIso, 100_000)));
  proofs.push(proofCrossWorkspaceReferenceDenied(nowPlus(nowIso, 110_000)));
  proofs.push(proofApprovedPayloadEditInvalidated(nowPlus(nowIso, 120_000)));
  proofs.push(
    await runExplicitAccountRebindProof({
      stateDir: join(input.stateDir, `credential-rebind-${randomUUID().slice(0, 8)}`),
      nowIso: nowPlus(nowIso, 130_000),
    }),
  );
  proofs.push(proofCrossWorkspaceResourceSubstitution(nowPlus(nowIso, 140_000)));
  proofs.push(proofAgentCannotWidenGrant(nowPlus(nowIso, 150_000)));
  proofs.push(proofRepairWeakenTestRejected(nowPlus(nowIso, 160_000)));
  proofs.push(proofTakeoverCancelsUnsentReplies(nowPlus(nowIso, 170_000)));
  proofs.push(proofEvalOnlyOperationalToolForbidden(nowPlus(nowIso, 180_000)));
  proofs.push(proofRepairAttemptLimitEscalated(nowPlus(nowIso, 190_000)));
  proofs.push(proofImportedDocQuarantinedAsData(nowPlus(nowIso, 200_000)));
  proofs.push(proofEvalNoGroundingFailClosed(nowPlus(nowIso, 210_000)));
  proofs.push(proofMetricDenominatorsHonest(nowPlus(nowIso, 220_000)));
  proofs.push(proofHardSearchConstraintsNoInvention(nowPlus(nowIso, 230_000)));
  proofs.push(proofGscOmittedRowsUnknownNotZero(nowPlus(nowIso, 240_000)));
  proofs.push(proofGa4DebugNotDeliveredConversion(nowPlus(nowIso, 250_000)));
  proofs.push(proofGa4WrongPropertyKindRefused(nowPlus(nowIso, 260_000)));
  proofs.push(proofThankYouWithoutCrmFailsDelivery(nowPlus(nowIso, 270_000)));
  proofs.push(proofStopAfterDispatchReconcile(nowPlus(nowIso, 280_000)));
  proofs.push(await proofOldFenceAfterReassignment(nowPlus(nowIso, 290_000)));
  proofs.push(
    await proofOutputBombBoundedQuarantined(nowPlus(nowIso, 300_000)),
  );
  proofs.push(
    await proofPublicSyntheticFlagRequiresServerGrant(nowPlus(nowIso, 320_000)),
  );
  proofs.push(proofMaliciousPromptNoShellInjection(nowPlus(nowIso, 330_000)));
  proofs.push(proofSymlinkEscapeAfterRootVerification(nowPlus(nowIso, 310_000)));
  proofs.push(proofCliErrorDespiteExitZero(nowPlus(nowIso, 340_000)));
  proofs.push(
    await proofDstRecurringScheduleNoDuplicates(
      join(input.stateDir, `dst-schedule-${randomUUID().slice(0, 8)}`),
      nowPlus(nowIso, 350_000),
    ),
  );
  proofs.push(proofHostSleepMonitoringCoverageGap(nowPlus(nowIso, 360_000)));
  proofs.push(
    await proofConcurrentIdempotentRelease(nowPlus(nowIso, 370_000)),
  );
  proofs.push(proofFactChangesAfterReviewStale(nowPlus(nowIso, 380_000)));
  proofs.push(
    await proofOrphanWorkerDeadlineTreeStopped(nowPlus(nowIso, 390_000)),
  );
  proofs.push(proofWrongCmsEnvironmentNoProductionOp(nowPlus(nowIso, 400_000)));
  proofs.push(await proofStopBeforeDispatchClaim(nowPlus(nowIso, 410_000)));
  proofs.push(
    await proofIdempotencyKeyPayloadMismatch(
      durableDir,
      nowPlus(nowIso, 420_000),
    ),
  );
  proofs.push(proofWorkerBrowserAuthStateOsDenied(nowPlus(nowIso, 430_000)));
  proofs.push(proofUnknownUsageCancelHoldsResidual(nowPlus(nowIso, 460_000)));
  proofs.push(
    proofIndirectPromptInjectionExfilDenied(nowPlus(nowIso, 440_000)),
  );
  proofs.push(
    await proofReplayHistoricalNoRepeatIo(
      durableDir,
      nowPlus(nowIso, 430_000),
    ),
  );
  proofs.push(
    proofDiskFullEvidenceNoPartialCompleted(nowPlus(nowIso, 460_000)),
  );
  proofs.push(
    proofExternalHumanEditConflictRetained(nowPlus(nowIso, 490_000)),
  );
  proofs.push(
    proofOptimizationBreaksCtaJourneyFails(nowPlus(nowIso, 480_000)),
  );
  proofs.push(
    await proofConcurrentFinalBudgetReservationCap(nowPlus(nowIso, 510_000)),
  );
  proofs.push(
    proofSyntheticConversionContaminationExcluded(nowPlus(nowIso, 520_000)),
  );
  proofs.push(
    proofReplySentCrmReconcilesNoResend(nowPlus(nowIso, 530_000)),
  );
  proofs.push(
    proofUnknownPolicyQuestionEscalatesWithoutPromise(
      nowPlus(nowIso, 540_000),
    ),
  );
  proofs.push(
    proofAutomatedResponseLoopBoundedHandoff(nowPlus(nowIso, 550_000)),
  );
  proofs.push(
    proofDuplicatePlatformAttributionOneBooking(nowPlus(nowIso, 560_000)),
  );
  proofs.push(
    proofCurrencyTimezoneMismatchNoSilentSum(nowPlus(nowIso, 570_000)),
  );
  proofs.push(
    proofValidatedPayloadNotCollectedSeparateStates(nowPlus(nowIso, 580_000)),
  );
  proofs.push(
    proofActualCostExceedsEstimateOverrunVisible(nowPlus(nowIso, 560_000)),
  );
  proofs.push(
    proofUnlicensedVenueMediaPublishBlocked(nowPlus(nowIso, 600_000)),
  );
  proofs.push(
    proofPartialCampaignDestinationsPerState(nowPlus(nowIso, 610_000)),
  );
  proofs.push(proofUnboundWritePathFailClosed(nowPlus(nowIso, 610_000)));
  proofs.push(
    proofEventualConsistencyFalseNotFound(nowPlus(nowIso, 630_000)),
  );
  proofs.push(
    proofMockedConnectorNotProductionReady(nowPlus(nowIso, 640_000)),
  );
  proofs.push(
    proofRateLimitBoundedBackoffPreservesDeadline(nowPlus(nowIso, 650_000)),
  );
  proofs.push(
    proofLowSampleTrendSpikeInsufficientEvidence(nowPlus(nowIso, 660_000)),
  );
  proofs.push(
    proofGoogleAdsTestProductionAccessSeparated(nowPlus(nowIso, 670_000)),
  );
  proofs.push(
    proofConnectClaudeCodeTestApiEvalOnly(nowPlus(nowIso, 680_000)),
  );
  proofs.push(
    proofConnectGeminiEvaluationEvalOnly(nowPlus(nowIso, 690_000)),
  );
  proofs.push(
    proofMapCrmFormsBookingFailureRecovery(nowPlus(nowIso, 700_000)),
  );
  proofs.push(
    proofSyntheticLeadsClassifiedNoCommercePollution(nowPlus(nowIso, 710_000)),
  );
  proofs.push(
    proofConnectLocalSocialInboxTestArtifact(nowPlus(nowIso, 720_000)),
  );
  proofs.push(
    proofUnsupportedDestinationCapabilitiesRespected(
      nowPlus(nowIso, 730_000),
    ),
  );
  proofs.push(
    proofStandingAutonomyGrantControlReceipts(nowPlus(nowIso, 740_000)),
  );
  proofs.push(
    proofLaunchWorkstreamScheduleMissionOutcome(nowPlus(nowIso, 750_000)),
  );
  proofs.push(
    proofMissedScheduleCoalesceNoBurst(nowPlus(nowIso, 760_000)),
  );
  proofs.push(
    proofDemandPageImprovementReleaseReceipt(nowPlus(nowIso, 770_000)),
  );
  proofs.push(
    proofKeywordProliferationOneUsefulUpdate(nowPlus(nowIso, 780_000)),
  );
  proofs.push(
    proofCampaignManifestDistribution(nowPlus(nowIso, 790_000)),
  );
  proofs.push(
    proofUncertainPostReconcileBeforeRetry(nowPlus(nowIso, 800_000)),
  );
  proofs.push(
    proofPaidMediaRecommendationMutationOrFailure(nowPlus(nowIso, 810_000)),
  );
  proofs.push(
    proofEvalSuiteAdjudicationBacklog(nowPlus(nowIso, 820_000)),
  );
  proofs.push(proofProviderErrorNotPass(nowPlus(nowIso, 830_000)));
  proofs.push(proofReviewReviseRelease(nowPlus(nowIso, 840_000)));
  proofs.push(proofDailyOwnerReview(nowPlus(nowIso, 850_000)));
  proofs.push(proofOwnerBriefRootCause(nowPlus(nowIso, 860_000)));
  proofs.push(proofDesignReleaseReadiness(nowPlus(nowIso, 870_000)));
  proofs.push(proofSecretsNeverBrowserAssets(nowPlus(nowIso, 880_000)));
  proofs.push(proofKeyboardJourneyReducedMotion(nowPlus(nowIso, 890_000)));
  proofs.push(
    proofSharedBriefsRedactedPrivateRetained(nowPlus(nowIso, 900_000)),
  );
  proofs.push(proofCreateTrustedLocalWorkspace(nowPlus(nowIso, 910_000)));
  proofs.push(
    proofChooseFoldersEstablishBusinessTruth(nowPlus(nowIso, 920_000)),
  );
  proofs.push(
    proofBusinessTruthFoldersRestoreSecretsExcluded(nowPlus(nowIso, 925_000)),
  );
  proofs.push(proofMapSitesPagesEditableSources(nowPlus(nowIso, 930_000)));
  proofs.push(proofConnectGoogleAnalytics4(nowPlus(nowIso, 940_000)));
  proofs.push(
    proofConnectSearchConsoleOrganicVisibility(nowPlus(nowIso, 950_000)),
  );
  proofs.push(
    proofConnectGoogleAdsControlledAnalysis(nowPlus(nowIso, 960_000)),
  );
  proofs.push(proofConnectClaudeCodeAndTestApi(nowPlus(nowIso, 970_000)));
  proofs.push(
    proofConnectGeminiIndependentTesting(nowPlus(nowIso, 980_000)),
  );
  proofs.push(proofMapCrmFormsBookingTruth(nowPlus(nowIso, 990_000)));
  proofs.push(
    proofConnectLocalSocialInboxChannels(nowPlus(nowIso, 1_000_000)),
  );
  proofs.push(
    proofGrantStandingAutonomySafely(nowPlus(nowIso, 1_010_000)),
  );
  proofs.push(
    proofLaunchWorkstreamRecurringSchedule(nowPlus(nowIso, 1_020_000)),
  );
  proofs.push(
    proofTurnDemandIntoPageImprovement(nowPlus(nowIso, 1_030_000)),
  );
  proofs.push(
    proofCreateAndDistributeOriginalCampaign(nowPlus(nowIso, 1_040_000)),
  );
  proofs.push(
    proofReviewPaidMediaRecommendations(nowPlus(nowIso, 1_050_000)),
  );
  proofs.push(
    proofVerifyFormToCrmJourneyContinuously(nowPlus(nowIso, 1_060_000)),
  );
  proofs.push(
    proofHandleAfterHoursMessagesAndTakeover(nowPlus(nowIso, 1_070_000)),
  );
  proofs.push(
    proofAnalyzePerformanceAndTestHypothesis(nowPlus(nowIso, 1_080_000)),
  );
  proofs.push(
    proofReviewReviseAndReleaseAChange(nowPlus(nowIso, 1_090_000)),
  );
  proofs.push(
    proofDiagnoseAndRepairPermittedDefect(nowPlus(nowIso, 1_100_000)),
  );
  proofs.push(
    proofCalibrateDesignReleaseReadiness(nowPlus(nowIso, 1_110_000)),
  );
  proofs.push(
    proofTestSemanticSearchImproveNoResult(nowPlus(nowIso, 1110000)),
  );
  proofs.push(
    proofRunClaudeGeminiEvaluationSuites(nowPlus(nowIso, 1120000)),
  );
  proofs.push(
    proofOperateDailyOwnerReview(nowPlus(nowIso, 1130000)),
  );
  proofs.push(
    proofDiagnoseRepairDefectResolvedOrHandoff(nowPlus(nowIso, 1140000)),
  );
  proofs.push(
    proofExactFinancialBoundariesPreserved(nowPlus(nowIso, 1150000)),
  );
  proofs.push(proofPortableAnalysisArtifact(nowPlus(nowIso, 1_160_000)));
  proofs.push(
    proofTrustedWorkspaceReadinessBlockersNextActions(
      nowPlus(nowIso, 1_170_000),
    ),
  );
  proofs.push(
    proofFormCrmContinuousVerifyCadenceHeartbeat(nowPlus(nowIso, 1_180_000)),
  );
  proofs.push(proofHonestOutageHostedContact(nowPlus(nowIso, 1_190_000)));
  proofs.push(
    await proofClaudeRuntimeEvalAuthSeparated(nowPlus(nowIso, 1_195_000)),
  );
  proofs.push(proofAfterHoursHandoffAcknowledged(nowPlus(nowIso, 1_200_000)));
  proofs.push(
    proofUnsafeFoldersUnresolvedFactsBlocked(nowPlus(nowIso, 1_210_000)),
    proofSitePageEditableSourcesBaseline(nowPlus(nowIso, 1_220_000)),
  );
  proofs.push(proofConnectGa4ReadReadyNextSync(nowPlus(nowIso, 1260000)));
  proofs.push(proofConnectGscScheduleWatermark(nowPlus(nowIso, 1270000)));
  proofs.push(proofConnectGoogleAdsAnalyzeOnlyWriteDisabled(nowPlus(nowIso, 1280000)));
  proofs.push(
    proofSemanticSearchNoResultEvalComparison(nowPlus(nowIso, 1290000)),
  );
  proofs.push(
    proofIncomparableTrendIndicesRejected(nowPlus(nowIso, 1_300_000)),
  );
  proofs.push(proofSchemaDiffersFromPageGateFails(nowPlus(nowIso, 1_310_000)));
  proofs.push(
    await proofUnsupportedBlogDestinationNoFakePublication(
      nowPlus(nowIso, 1_320_000),
    ),
  );
  proofs.push(
    proofLayoutSpecificCapacityMismatchFilters(nowPlus(nowIso, 1_330_000)),
  );
  proofs.push(
    proofWrongZohoOrganizationIdentityMismatch(nowPlus(nowIso, 1_340_000)),
  );
  proofs.push(proofSseGapFullStateResync(nowPlus(nowIso, 1_350_000)));
  proofs.push(
    proofKeyboardFocusRestoreAfterDialog(nowPlus(nowIso, 1_360_000)),
  );
  proofs.push(
    proofThirtyAlertsOneOutageGrouped(nowPlus(nowIso, 1_370_000)),
  );
  proofs.push(
    proofCustomerDataEvalRedactionBlocks(nowPlus(nowIso, 1_380_000)),
  );
  proofs.push(
    proofSsrfRedirectDnsRebindBlockedEveryHop(nowPlus(nowIso, 1_390_000)),
  );
  proofs.push(
    proofHostOfflinePublicDiscoveryUnavailable(nowPlus(nowIso, 1_400_000)),
  );
  proofs.push(
    proofIncompatibleWorkflowUpgradeBlockedOrRetained(
      nowPlus(nowIso, 1_410_000),
    ),
  );
  proofs.push(
    proofAdsTestProjectProductionBlocked(nowPlus(nowIso, 1_420_000)),
  );
  proofs.push(
    proofSharedAdBudgetExternalChangeInvalidates(nowPlus(nowIso, 1_430_000)),
  );
  proofs.push(
    proofRecentAdsConversionBlankPending(nowPlus(nowIso, 1_440_000)),
  );
  const allPassed = proofs.every((p) => p.passed);
  return {
    proofs,
    allPassed,
    details: [
      allPassed
        ? "All soak recovery proofs passed (fixture / LOCAL_DURABLE)"
        : "One or more soak recovery proofs failed",
      "External effects: NONE — fake provider only",
      "T-F21 fixture ACCEPTED via diagnose_and_repair_permitted_defect only — not live VERIFIED",
      "T-F26 fixture ACCEPTED via calibrate_design_release_readiness only — not live VERIFIED",
      "T-X015 fixture ACCEPTED via dst_recurring_schedule_no_duplicates only — not live VERIFIED",
      "T-X025 fixture ACCEPTED via external_human_edit_conflict_retained only — not live VERIFIED",
      "T-X026 fixture ACCEPTED via concurrent_final_budget_reservation_cap only — not live VERIFIED",
      "Live CMS/GSC/GA4/Zoho/Temporal remain NOT_WIRED",
      "T-F24/T-US-047 fixture ACCEPTED via recover_rotate_reconcile only — not live VERIFIED",
      "T-US-002/T-X002 fixture ACCEPTED via competing_supervisor_lease only — deepen cross-host / expiry-boundary / same-gen identity; not live VERIFIED",
      "T-X018/T-US-054 fixture ACCEPTED via self_approval_rejected only — not live VERIFIED",
      "T-X073 fixture ACCEPTED via offboard_active_token_residual only — incomplete until live revoke; not live VERIFIED",
      "T-US-060 fixture ACCEPTED via emergency_stop_at_commit only — not live VERIFIED",
      "T-X005 fixture ACCEPTED via forged_browser_role_ignored only — not live VERIFIED",
      "T-X006 fixture ACCEPTED via cross_workspace_reference_denied only — deepen supervisor lease fence; not live VERIFIED",
      "T-X019/T-US-036 fixture ACCEPTED via approved_payload_edit_invalidated only — not live VERIFIED",
      "T-US-057 fixture ACCEPTED via cross_workspace_resource_substitution only — not live VERIFIED",
      "T-US-024 fixture ACCEPTED via agent_cannot_widen_grant only — not live VERIFIED",
      "T-US-042/T-X057 fixture ACCEPTED via repair_weaken_test_rejected only — not live VERIFIED",
      "T-US-044/T-X053 fixture ACCEPTED via takeover_cancels_unsent_replies only — VERSION_MISMATCH via real takeover + multi-queue cancel; not live VERIFIED",
      "T-US-018/T-X037 fixture ACCEPTED via eval_only_operational_tool_forbidden only — not live VERIFIED",
      "T-X058 fixture ACCEPTED via repair_attempt_limit_escalated only — not live VERIFIED",
      "T-X069 fixture ACCEPTED via imported_doc_quarantined_as_data only — not live VERIFIED",
      "T-X038 fixture ACCEPTED via eval_no_grounding_fail_closed only — not live VERIFIED",
      "T-X039/T-US-058 fixture ACCEPTED via metric_denominators_honest only — not live VERIFIED",
      "T-US-046/T-X048 fixture ACCEPTED via hard_search_constraints_no_invention only — not live VERIFIED",
      "T-US-010/T-X033 fixture ACCEPTED via gsc_omitted_rows_unknown_not_zero only — not live VERIFIED",
      "T-US-008/T-X032 fixture ACCEPTED via ga4_debug_not_delivered_conversion only — debug≠delivered; LIVE/claim refused; live NOT_WIRED — not live VERIFIED",
      "T-X031 fixture ACCEPTED via ga4_wrong_property_kind_refused only — not live VERIFIED",
      "T-US-040/T-X049 fixture ACCEPTED via thank_you_without_crm_fails_delivery only — not live VERIFIED",
      "T-X017 fixture ACCEPTED via stop_after_dispatch_reconcile only — not live VERIFIED",
      "T-X020 fixture ACCEPTED via unknown_remote_reconcile only — timeout→URO→reconcile+verify applyCount=1; distinct from T-US-030/T-X017/T-X066; live NOT_WIRED — not live VERIFIED",
      "T-X024 fixture ACCEPTED via old_fence_after_reassignment only (OLD_FENCE_HONESTY; LIVE_TEMPORAL_CLAIM_REFUSED; VERIFIED_CLAIM_REFUSED; EXTERNAL_EFFECTS_CLAIM_REFUSED; CHATGPT_ADS_ACCESS_CLAIM_REFUSED; SOFT_SKIP_ADS; CATALOG_CEILING_REFUSED; UNFENCED_RECOVERY_NOT_FENCE_PROOF; Temporal NOT_WIRED) — not live VERIFIED",
      "T-X011 fixture ACCEPTED via output_bomb_bounded_quarantined only — not live VERIFIED",
      "T-X003 fixture ACCEPTED via symlink_escape_after_root_verification only — not live VERIFIED",
      "T-X050 fixture ACCEPTED via public_synthetic_flag_requires_server_grant only — OR dual-field / whitespace; not live VERIFIED",
      "T-X010 fixture ACCEPTED via malicious_prompt_no_shell_injection only — stdin-only; extraArgs shell-meta/NUL/permission-mode refused; MultiEdit refused; NOT_WIRED; not live VERIFIED",
      "T-X009 fixture ACCEPTED via cli_error_despite_exit_zero only — not live VERIFIED",
      "T-X001 fixture ACCEPTED via host_sleep_monitoring_coverage_gap only — not live VERIFIED",
      "T-X021 fixture ACCEPTED via concurrent_idempotent_release only — not live VERIFIED",
      "T-X008 fixture ACCEPTED via fact_changes_after_review_stale only — every hop: A25 bind → cited add/remove/empty/hypothesis/claimIds → BINDING_INVALIDATED + READY_FOR_REVIEW → publish denied apply=0; reorder order-stable; body/title → DRAFT contrast; missing-registry / UNKNOWN/HYPOTHESIS flips fail gate; ID-only binding stays VALID on label/missing alone; distinct from approved-payload-edit / imported-doc quarantine / CLI exit-0 error; live NOT_WIRED — not live VERIFIED",
      "T-X012 fixture ACCEPTED via orphan_worker_deadline_tree_stopped only — not live VERIFIED",
      "T-X007 fixture ACCEPTED via wrong_cms_environment_no_production_op only — not live VERIFIED",
      "T-X016 fixture ACCEPTED via stop_before_dispatch_no_mutation only — not live VERIFIED",
      "T-X022 fixture ACCEPTED via idempotency_key_payload_mismatch only (ACCEPTED_PENDING+VERIFIED Conflict; live provider NOT_WIRED) — not live VERIFIED",
      "T-X065 fixture ACCEPTED via worker_browser_auth_state_os_denied only — not live VERIFIED",
      "T-X063 fixture ACCEPTED via indirect_prompt_injection_exfil_denied only — not live VERIFIED",
      "T-X013 fixture ACCEPTED via replay_historical_no_repeat_io only — second replay + fail-closed fences (blank wfId/opId / enqueue+claim+verify shape / apply≥1+typed / providerCreated / terminal outcome / matched=false / padded trim); not live VERIFIED",
      "T-X027 fixture ACCEPTED via unknown_usage_cancel_holds_residual only — liveBudgetProvider NOT_WIRED; not live VERIFIED",
      "T-X004 fixture ACCEPTED via disk_full_evidence_no_partial_completed only — ENOSPC/EDQUOT write|rename|mkdir; EIO/EACCES/EPERM no-partial; safe runId+C0/DEL/dot-edge/..; prior preserve incl. EPERM/EIO; empty/live-claim refused; NOT_WIRED; not live VERIFIED",
      "T-X043 fixture ACCEPTED via optimization_breaks_cta_journey_fails only — href-only / empty-steps / live NOT_WIRED — not live VERIFIED",
      "T-X052 fixture ACCEPTED via synthetic_conversion_contamination_excluded only — excluded-revenue; defense-in-depth; live NOT_WIRED — not live VERIFIED",
      "T-X054 fixture ACCEPTED via reply_sent_crm_reconciles_no_resend only — liveCrmWiring NOT_WIRED; not live VERIFIED",
      "T-X055 fixture ACCEPTED via unknown_policy_question_escalates_without_promise only — not live VERIFIED",
      "T-X056 fixture ACCEPTED via automated_response_loop_bounded_handoff only — not live VERIFIED",
      "T-X059/T-US-038 fixture ACCEPTED via duplicate_platform_attribution_one_booking only — not live VERIFIED",
      "T-X060 fixture ACCEPTED via currency_timezone_mismatch_no_silent_sum only — whitespace match; INVALID_DIMENSION; live NOT_WIRED — not live VERIFIED",
      "T-X070 fixture ACCEPTED via validated_payload_not_collected_separate_states only — not live VERIFIED",
      "T-X028 fixture ACCEPTED via actual_cost_exceeds_estimate_overrun_visible only — not live VERIFIED",
      "T-X044 fixture ACCEPTED via unlicensed_venue_media_publish_blocked only — not live VERIFIED",
      "T-X045 fixture ACCEPTED via partial_campaign_destinations_per_state only — not live VERIFIED",
      "T-US-006 fixture ACCEPTED via unbound_write_path_fail_closed only — not live VERIFIED",
      "T-X023 fixture ACCEPTED via eventual_consistency_false_not_found only — not live VERIFIED",
      "T-US-052 fixture ACCEPTED via mocked_connector_not_production_ready only — not live VERIFIED",
      "T-X030 fixture ACCEPTED via rate_limit_bounded_backoff_preserves_deadline only — every hop: Retry-After/exponential WAIT within deadline → STOP_DEADLINE on exact/overshoot/past-deadline → STOP_MAX_ATTEMPTS incl. maxAttempts=1 → 429→200 recovery honesty; fractional Retry-After ceil; exponential maxBackoff cap; partial WAIT progress then STOP invents no COMPLETED write; Retry-After preferred over exponential; Retry-After=0 WAIT; partial body still no live VERIFIED; distinct from grant RATE_LIMIT_EXCEEDED / no-dup / concurrent-idempotent / disk-full partial / campaign partial; live NOT_WIRED — not live VERIFIED",
      "T-US-056 fixture ACCEPTED via honest_outage_hosted_contact_path only — not live VERIFIED",
      "T-X040 fixture ACCEPTED via low_sample_trend_spike_insufficient_evidence only — not live VERIFIED",
      "T-US-012 fixture ACCEPTED via google_ads_test_production_access_separated only — not live VERIFIED",
      "T-US-015 fixture ACCEPTED via connect_claude_code_test_api_eval_only only — not live VERIFIED",
      "T-US-017 fixture ACCEPTED via connect_gemini_evaluation_eval_only only — not live VERIFIED",
      "T-US-019 fixture ACCEPTED via map_crm_forms_booking_failure_recovery only — not live VERIFIED",
      "T-US-020 fixture ACCEPTED via synthetic_leads_classified_no_commerce_pollution only — not live VERIFIED",
      "T-US-021 fixture ACCEPTED via connect_local_social_inbox_test_artifact only — not live VERIFIED",
      "T-US-022 fixture ACCEPTED via unsupported_destination_capabilities_respected only — not live VERIFIED",
      "T-US-023 fixture ACCEPTED via standing_autonomy_grant_control_receipts only — not live VERIFIED",
      "T-US-025 fixture ACCEPTED via launch_workstream_schedule_mission_outcome only — not live VERIFIED",
      "T-US-026 fixture ACCEPTED via missed_schedule_coalesce_no_burst only — not live VERIFIED",
      "T-US-027 fixture ACCEPTED via demand_page_improvement_release_receipt only — not live VERIFIED",
      "T-US-028 fixture ACCEPTED via keyword_proliferation_one_useful_update only — not live VERIFIED",
      "T-US-029 fixture ACCEPTED via campaign_manifest_distribution only — not live VERIFIED",
      "T-US-030 fixture ACCEPTED via uncertain_post_reconcile_before_retry only — not live VERIFIED",
      "T-US-031 fixture ACCEPTED via paid_media_recommendation_mutation_or_failure only — not live VERIFIED",
      "T-US-033 fixture ACCEPTED via eval_suite_adjudication_backlog only — not live VERIFIED",
      "T-US-034 fixture ACCEPTED via provider_error_not_pass only — not live VERIFIED",
      "T-US-035 fixture ACCEPTED via review_revise_release_receipt_or_blocked only — not live VERIFIED",
      "T-US-049 fixture ACCEPTED via daily_owner_review_operating_knowledge only — not live VERIFIED",
      "T-US-050 fixture ACCEPTED via owner_brief_root_cause_actionable only — not live VERIFIED",
      "T-US-051 fixture ACCEPTED via design_release_readiness_packet only — not live VERIFIED",
      "T-US-053 fixture ACCEPTED via secrets_never_in_browser_assets only — not live VERIFIED",
      "T-US-055 fixture ACCEPTED via keyboard_journey_reduced_motion only — not live VERIFIED",
      "T-US-059 fixture ACCEPTED via shared_briefs_redacted_private_retained only — not live VERIFIED",
      "T-F01 fixture ACCEPTED via create_trusted_local_workspace only — not live VERIFIED",
      "T-F02 fixture ACCEPTED via choose_folders_establish_business_truth only — not live VERIFIED",
      "T-F03 fixture ACCEPTED via map_sites_pages_editable_sources only — not live VERIFIED",
      "T-F04 fixture ACCEPTED via connect_google_analytics_4 only — not live VERIFIED",
      "T-F05 fixture ACCEPTED via connect_search_console_organic_visibility only — not live VERIFIED",
      "T-F06 fixture ACCEPTED via connect_google_ads_controlled_analysis only — not live VERIFIED",
      "T-F08 fixture ACCEPTED via connect_claude_code_and_test_api only — not live VERIFIED",
      "T-F09 fixture ACCEPTED via connect_gemini_independent_testing only — not live VERIFIED",
      "T-F10 fixture ACCEPTED via map_crm_forms_booking_truth only — not live VERIFIED",
      "T-F11 fixture ACCEPTED via connect_local_social_inbox_channels only — not live VERIFIED",
      "T-F12 fixture ACCEPTED via grant_standing_autonomy_safely only — not live VERIFIED",
      "T-F13 fixture ACCEPTED via launch_workstream_recurring_schedule only — not live VERIFIED",
      "T-F14 fixture ACCEPTED via turn_demand_into_page_improvement only — not live VERIFIED",
      "T-F15 fixture ACCEPTED via create_and_distribute_original_campaign only — not live VERIFIED",
      "T-F16 fixture ACCEPTED via review_paid_media_recommendations only — not live VERIFIED",
      "T-F18 fixture ACCEPTED via review_revise_and_release_a_change only — not live VERIFIED",
      "T-F23 fixture ACCEPTED via test_semantic_search_improve_no_result only — not live VERIFIED",
      "T-F17 fixture ACCEPTED via run_claude_gemini_evaluation_suites only — not live VERIFIED",
      "T-F25 fixture ACCEPTED via operate_daily_owner_review only — not live VERIFIED",
      "T-US-041 fixture ACCEPTED via diagnose_repair_defect_resolved_or_handoff only — not live VERIFIED",
      "T-US-032 fixture ACCEPTED via exact_financial_boundaries_preserved only — not live VERIFIED",
      "T-US-037 fixture ACCEPTED via portable_analysis_artifact only — not live VERIFIED",
      "T-US-001 fixture ACCEPTED via trusted_workspace_readiness_blockers_next_actions only — not live VERIFIED",
      "T-US-039 fixture ACCEPTED via form_crm_continuous_verify_cadence_heartbeat only — not live VERIFIED",
      "T-US-043 fixture ACCEPTED via after_hours_handoff_acknowledged only — not live VERIFIED",
      "T-US-016 fixture ACCEPTED via claude_runtime_eval_auth_separated only — not live VERIFIED",
      "T-US-003 fixture ACCEPTED via business_truth_folders_restore_secrets_excluded only — not live VERIFIED",
      "T-US-004 fixture ACCEPTED via unsafe_folders_unresolved_facts_blocked only — not live VERIFIED",
      "T-US-005 fixture ACCEPTED via site_page_editable_sources_baseline only — not live VERIFIED",
      "T-US-007 fixture ACCEPTED via connect_ga4_read_ready_next_sync only — not live VERIFIED",
      "T-US-009 fixture ACCEPTED via connect_gsc_schedule_watermark only — not live VERIFIED",
      "T-US-011 fixture ACCEPTED via connect_google_ads_analyze_only only — not live VERIFIED",
      "T-US-045 fixture ACCEPTED via semantic_search_no_result_eval_comparison only — not live VERIFIED",
      "T-X041 fixture ACCEPTED via incomparable_trend_indices_rejected only — case-normalized unit/source; not live VERIFIED",
      "T-X042 fixture ACCEPTED via schema_differs_from_page_gate_fails only — not live VERIFIED",
      "T-X046 fixture ACCEPTED via unsupported_blog_destination_no_fake_publication only — not live VERIFIED",
      "T-X047 fixture ACCEPTED via layout_specific_capacity_mismatch_filters only — every hop: parse layout+people → layout-capacity filter vs marketing max → fit admit → ambiguous clarify → boardroom/theatre edges; distinct from hard-search/semantic-no-result; live NOT_WIRED — not live VERIFIED",
      "T-X051 fixture ACCEPTED via wrong_zoho_organization_identity_mismatch only — not live VERIFIED",
      "T-X062 fixture ACCEPTED via sse_gap_full_state_resync only — not live VERIFIED",
      "T-X061 fixture ACCEPTED via keyboard_focus_restore_after_dialog only — not live VERIFIED",
      "T-X068 fixture ACCEPTED via thirty_alerts_one_outage_grouped only — whitespace outageKey collapse; uniqueSources; live NOT_WIRED — not live VERIFIED",
      "T-X072 fixture ACCEPTED via customer_data_eval_redaction_blocks only — not live VERIFIED",
      "T-X064 fixture ACCEPTED via ssrf_redirect_dns_rebind_blocked_every_hop only — every hop incl. NON_HTTPS/CREDENTIALS/IPv6 fe80::/10/IPv4-mapped ::ffff:; liveDns/liveFetch NOT_WIRED — not live VERIFIED",
      "T-X066 fixture ACCEPTED via backup_omit_receipt only — omit→restore→remote SoR reconcile→verify/retry applyCount=1; distinct from no-dup/unknown-remote/recover-rotate; live NOT_WIRED — not live VERIFIED",
      "T-X071 fixture ACCEPTED via host_offline_public_discovery_unavailable only — not live VERIFIED",
      "T-X067 fixture ACCEPTED via incompatible_workflow_upgrade_blocked_or_retained only — not live VERIFIED",
      "T-X034 fixture ACCEPTED via ads_test_project_production_blocked only — not live VERIFIED",
      "T-X035 fixture ACCEPTED via shared_ad_budget_external_change_invalidates only — not live VERIFIED",
      "T-X036 fixture ACCEPTED via recent_ads_conversion_blank_pending only — not live VERIFIED",
    ],
  };
}
