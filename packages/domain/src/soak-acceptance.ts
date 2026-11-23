/**
 * M9 / NEXT-20 — R1 soak / acceptance evidence harness (domain).
 *
 * Fixture ≠ sandbox ≠ authorized production.
 * Catalog cases may be NOT_RUN or ACCEPTED (with real evidence only).
 * Never silently VERIFIED for live. ChatGPT Ads stays blocked without transport.
 * 72h pilot gate is explicit — short CI soaks prove mechanics, not R1-complete.
 * Pilot duration uses server-recorded start/heartbeat/end observations only.
 * Pure types + validators. No network I/O.
 */

import {
  AnalyticsEnvironment,
  evaluateChatGptAdsAccess,
} from "./analytics.js";

/** Declared execution environment for acceptance evidence. */
export const AcceptanceEnvironment = {
  FIXTURE: "fixture",
  SANDBOX: "sandbox",
  AUTHORIZED_PRODUCTION: "authorized_production",
} as const;

export type AcceptanceEnvironmentValue =
  (typeof AcceptanceEnvironment)[keyof typeof AcceptanceEnvironment];

/**
 * Product-case execution status for the matrix / evidence ledger.
 * VERIFIED is intentionally absent — live/prod verification is never silent.
 */
export const AcceptanceCaseStatus = {
  NOT_RUN: "NOT_RUN",
  ACCEPTED: "ACCEPTED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
} as const;

export type AcceptanceCaseStatusValue =
  (typeof AcceptanceCaseStatus)[keyof typeof AcceptanceCaseStatus];

/** Forbidden matrix/evidence status for live claims without explicit auth evidence. */
export const FORBIDDEN_SILENT_LIVE_STATUS = "VERIFIED" as const;

export const SoakProofKind = {
  CRASH_RESTART: "crash_restart",
  NO_DUPLICATE_EFFECTS: "no_duplicate_effects",
  JOB_CONTINUITY: "job_continuity",
  UNKNOWN_REMOTE_RECONCILE: "unknown_remote_reconcile",
  /** Backup restore that omitted the remote receipt; reconcile before retry. */
  BACKUP_OMIT_RECEIPT: "backup_omit_receipt",
  /**
   * F24 recover → capability stop → rotate (no secrets) → reconcile → offboard.
   * Feeds fixture ACCEPTED for T-F24 / T-US-047 only — never live VERIFIED.
   */
  RECOVER_ROTATE_RECONCILE: "recover_rotate_reconcile",
  /**
   * Competing supervisors / singleton host lease (T-US-002 / T-X002).
   * Second live generation refused; dead-holder reclaim allowed; ownership fail-closed.
   */
  COMPETING_SUPERVISOR_LEASE: "competing_supervisor_lease",
  /**
   * Self-approval rejected; independent A25 approval required (T-X018 / T-US-054).
   */
  SELF_APPROVAL_REJECTED: "self_approval_rejected",
  /**
   * Offboarding retains ACTIVE_TOKEN residual until live revoke (T-X073).
   * Incomplete until revoked — never claims live provider revoke complete.
   */
  OFFBOARD_ACTIVE_TOKEN_RESIDUAL: "offboard_active_token_residual",
  /**
   * Emergency stop / outbound stop checked at commit time (T-US-060).
   */
  EMERGENCY_STOP_AT_COMMIT: "emergency_stop_at_commit",
  /**
   * Forged browser / client payload role ignored (T-X005).
   * Session role binds; body.actorRole cannot escalate.
   */
  FORGED_BROWSER_ROLE_IGNORED: "forged_browser_role_ignored",
  /**
   * Cross-workspace object reference denied without leak (T-X006).
   */
  CROSS_WORKSPACE_REFERENCE_DENIED: "cross_workspace_reference_denied",
  /**
   * Approved payload edited / stale approval invalidated (T-X019 / T-US-036).
   * Digest conflict on edit; revision change invalidates binding.
   */
  APPROVED_PAYLOAD_EDIT_INVALIDATED: "approved_payload_edit_invalidated",
  /** Token identity maps to a different account — explicit rebind required (T-X029). */
  EXPLICIT_ACCOUNT_REBIND: "explicit_account_rebind",
  /**
   * Cross-workspace resource substitution rejected (T-US-057).
   */
  CROSS_WORKSPACE_RESOURCE_SUBSTITUTION: "cross_workspace_resource_substitution",
  /**
   * Agent cannot widen its own grant (T-US-024).
   */
  AGENT_CANNOT_WIDEN_GRANT: "agent_cannot_widen_grant",
  /**
   * Repair cannot weaken protected tests (T-US-042 / T-X057).
   */
  REPAIR_WEAKEN_TEST_REJECTED: "repair_weaken_test_rejected",
  /**
   * Takeover cancels unsent agent replies (T-US-044 / T-X053).
   */
  TAKEOVER_CANCELS_UNSENT_REPLIES: "takeover_cancels_unsent_replies",
  /**
   * EVAL_ONLY forbids operational tools (T-US-018 / T-X037).
   * Gemini/Claude cannot publish / CRM-write / customer-message / ads-mutate.
   */
  EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN: "eval_only_operational_tool_forbidden",
  /**
   * Third automatic repair attempt escalates (T-X058).
   */
  REPAIR_ATTEMPT_LIMIT_ESCALATED: "repair_attempt_limit_escalated",
  /**
   * Imported document quarantined as data, not executable instructions (T-X069).
   */
  IMPORTED_DOC_QUARANTINED_AS_DATA: "imported_doc_quarantined_as_data",
  /**
   * Grounded eval without grounding fails closed (T-X038).
   */
  EVAL_NO_GROUNDING_FAIL_CLOSED: "eval_no_grounding_fail_closed",
  /**
   * Metric denominators stay honest (T-X039 / T-US-058):
   * provider_error → unavailable (not zero/pass); synthetic → excluded from business.
   */
  METRIC_DENOMINATORS_HONEST: "metric_denominators_honest",
  /**
   * Hard search constraints; unknown price/availability not invented (T-US-046 / T-X048).
   */
  HARD_SEARCH_CONSTRAINTS_NO_INVENTION: "hard_search_constraints_no_invention",
  /**
   * Omitted/missing GSC rows are UNKNOWN demand, never invent zero (T-US-010 / T-X033).
   */
  GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO: "gsc_omitted_rows_unknown_not_zero",
  /**
   * GA4 debug validation is not a delivered conversion (T-US-008 / T-X032).
   */
  GA4_DEBUG_NOT_DELIVERED_CONVERSION: "ga4_debug_not_delivered_conversion",
  /**
   * Wrong GA4 property kind refused (T-X031).
   */
  GA4_WRONG_PROPERTY_KIND_REFUSED: "ga4_wrong_property_kind_refused",
  /**
   * Thank-you without CRM record fails at delivery (T-US-040 / T-X049).
   */
  THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY: "thank_you_without_crm_fails_delivery",
  /**
   * Stop after provider dispatch starts — reconcile; no fake cancel (T-X017).
   */
  STOP_AFTER_DISPATCH_RECONCILE: "stop_after_dispatch_reconcile",
  /**
   * Old fence after reassignment — old worker cannot commit (T-X024).
   */
  OLD_FENCE_AFTER_REASSIGNMENT: "old_fence_after_reassignment",
  /**
   * Output bomb bounded and quarantined — oversized stdout not delivered (T-X011).
   */
  OUTPUT_BOMB_BOUNDED_QUARANTINED: "output_bomb_bounded_quarantined",
  /**
   * Symlink escape after root verification — write denied outside root (T-X003).
   */
  SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION:
    "symlink_escape_after_root_verification",
  /**
   * Public synthetic flag abuse — server canary grant required (T-X050).
   * Client/public ws_synthetic / is_synthetic cannot authorize alone.
   */
  PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT:
    "public_synthetic_flag_requires_server_grant",
  /**
   * Malicious prompt interpolation blocked — prompt via stdin, shell false (T-X010).
   */
  MALICIOUS_PROMPT_NO_SHELL_INJECTION: "malicious_prompt_no_shell_injection",
  /**
   * CLI error despite process exit 0 → job fails (T-X009).
   * Claude `--output-format json` may set is_error while exiting 0.
   */
  CLI_ERROR_DESPITE_EXIT_ZERO: "cli_error_despite_exit_zero",
  /**
   * DST recurring schedule — no unintended duplicates (T-X015).
   */
  DST_RECURRING_SCHEDULE_NO_DUPLICATES: "dst_recurring_schedule_no_duplicates",
  /**
   * Host sleeps during scheduled monitoring — coverage gap honest; coalesce (T-X001).
   */
  HOST_SLEEP_MONITORING_COVERAGE_GAP: "host_sleep_monitoring_coverage_gap",
  /**
   * Concurrent idempotent releases → one dispatch (T-X021).
   * Distinct from NO_DUPLICATE_EFFECTS (sequential retry-only).
   */
  CONCURRENT_IDEMPOTENT_RELEASE: "concurrent_idempotent_release",
  /**
   * Idempotency key payload mismatch → Conflict (T-X022).
   * Same businessIdempotencyKey with a different payloadDigest is refused.
   */
  IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: "idempotency_key_payload_mismatch",
  /**
   * Fact changes after review -> stale; no publish (T-X008).
   * Cited-fact set change invalidates A25 content binding; support flip fails publish gates.
   */
  FACT_CHANGES_AFTER_REVIEW_STALE: "fact_changes_after_review_stale",
  /**
   * Orphan worker on deadline — process tree stopped (T-X012).
   */
  ORPHAN_WORKER_DEADLINE_TREE_STOPPED: "orphan_worker_deadline_tree_stopped",
  /**
   * Wrong CMS environment → no production op (T-X007).
   */
  WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP:
    "wrong_cms_environment_no_production_op",
  /**
   * Stop before dispatch claim — no adapter mutation (T-X016).
   * Pre-apply CANCELLED with applyAttempts=0 / no fake-provider entry.
   */
  STOP_BEFORE_DISPATCH_NO_MUTATION: "stop_before_dispatch_no_mutation",
  /**
   * Worker reads browser auth state → OS deny (T-X065).
   */
  WORKER_BROWSER_AUTH_STATE_OS_DENIED: "worker_browser_auth_state_os_denied",
  /**
   * Unknown usage on cancelled request — hold residual, not zero cost (T-X027).
   */
  UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL: "unknown_usage_cancel_holds_residual",
  /**
   * Actual cost exceeds estimate — overrun visible in settledMinor (T-X028).
   */
  ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE:
    "actual_cost_exceeds_estimate_overrun_visible",
  /**
   * Indirect prompt-injection exfiltration denied at boundary (T-X063).
   * Untrusted web/email content cannot become instructions that exfiltrate secrets.
   */
  INDIRECT_PROMPT_INJECTION_EXFIL_DENIED:
    "indirect_prompt_injection_exfil_denied",
  /**
   * Replay historical workflow — no repeated external I/O (T-X013).
   * Offline history replay of mission control flow; not acceptPending short-circuit.
   */
  REPLAY_HISTORICAL_NO_REPEAT_IO: "replay_historical_no_repeat_io",
  /**
   * Disk full during evidence write — no partial COMPLETED manifest (T-X004).
   */
  DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED:
    "disk_full_evidence_no_partial_completed",
  /**
   * External human edit during staging — conflict retained (T-X025).
   */
  EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED: "external_human_edit_conflict_retained",
  /**
   * Optimization breaks CTA → journey regression fails (T-X043).
   */
  OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS:
    "optimization_breaks_cta_journey_fails",
  /**
   * Concurrent final budget reservation — daily cap enforced (T-X026).
   * Same-snapshot finals compose to BUDGET_EXHAUSTED; reserved never exceeds limit.
   */
  CONCURRENT_FINAL_BUDGET_RESERVATION_CAP:
    "concurrent_final_budget_reservation_cap",
  /**
   * Synthetic conversion contamination excluded from commerce (T-X052).
   * Canary/synthetic conversion rows never inflate commerce denominators.
   */
  SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED:
    "synthetic_conversion_contamination_excluded",
  /**
   * Reply SENT but CRM fails — CRM reconciles; no outbound resend (T-X054).
   */
  REPLY_SENT_CRM_RECONCILES_NO_RESEND: "reply_sent_crm_reconciles_no_resend",
  /**
   * Unknown policy question escalates without promise (T-X055).
   * Outside allowedQuestionIds → refuse draft; handoff with no invented answer.
   */
  UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE:
    "unknown_policy_question_escalates_without_promise",
  /**
   * Automated response loop bounded; handoff when agent message cap hit (T-X056).
   */
  AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF:
    "automated_response_loop_bounded_handoff",
  /**
   * Duplicate platform attribution — one booking; separate claims (T-X059 / T-US-038).
   * Platform conversions must not silently sum into unique booking outcomes.
   */
  DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING:
    "duplicate_platform_attribution_one_booking",
  /**
   * Currency/timezone mismatch — refuse silent sum (T-X060).
   * Heterogeneous currency or reporting timezone series never invent a total.
   */
  CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM:
    "currency_timezone_mismatch_no_silent_sum",
  /**
   * Validated payload not collected — VALIDATION_FAILED ≠ COLLECTION_FAILED (T-X070).
   */
  VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES:
    "validated_payload_not_collected_separate_states",
  /**
   * Unlicensed venue media → publish blocked (T-X044).
   */
  UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED:
    "unlicensed_venue_media_publish_blocked",
  /**
   * Partial campaign destinations — per-destination states (T-X045).
   * Mixed VERIFIED/FAILED/UNKNOWN keep PARTIAL; verified destinations not re-applied.
   */
  PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE:
    "partial_campaign_destinations_per_state",
  /**
   * Unbound URL: analysis ok, write blocked (T-US-006).
   * Observe/create skip pilot write gates; unbound write targets fail closed.
   */
  UNBOUND_WRITE_PATH_FAIL_CLOSED: "unbound_write_path_fail_closed",
  /**
   * Eventual consistency false not-found — no unsafe CRM create retry (T-X023).
   */
  EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND: "eventual_consistency_false_not_found",
  /**
   * Mocked connector ≠ production-ready (T-US-052).
   * FIXTURE/NOT_WIRED wiring never elevates to productionActivated / live VERIFIED.
   */
  MOCKED_CONNECTOR_NOT_PRODUCTION_READY:
    "mocked_connector_not_production_ready",
  /**
   * Rate-limit with deadline — bounded backoff preserves deadline (T-X030).
   */
  RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE:
    "rate_limit_bounded_backoff_preserves_deadline",
  /**
   * Honest outage; durable hosted contact path (T-US-056).
   * Host OFFLINE → public chat UNAVAILABLE; hosted form path stays available;
   * pretend local receipt refused until durable receiver accepts.
   */
  HONEST_OUTAGE_HOSTED_CONTACT_PATH: "honest_outage_hosted_contact_path",
  /**
   * Low-sample trend spike → insufficient evidence (T-X040).
   * Research task only; never a publish trigger from this gate alone.
   */
  LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE:
    "low_sample_trend_spike_insufficient_evidence",
  /**
   * Google Ads test vs production access separated (T-US-012).
   * Cross-tier credential→customer refused; LIVE NOT_WIRED; mutate never authorized.
   */
  GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED:
    "google_ads_test_production_access_separated",
  /**
   * Connect Claude Code + test API as separate EVAL_ONLY surfaces (T-US-015).
   * Runtime and API readiness separated; live NOT_WIRED; no operational capability.
   */
  CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY:
    "connect_claude_code_test_api_eval_only",
  /**
   * Claude runtime vs API eval auth separated (T-US-016).
   * EVAL_ONLY API connection + evaluation-worker isolation ≠ Claude LIVE_CLI runtime auth.
   */
  CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED: "claude_runtime_eval_auth_separated",
  /**
   * Connect Gemini Evaluation as EVAL_ONLY (T-US-017).
   * Data-use decision, broker credential, model snapshot, test mode;
   * live NOT_WIRED; cannot publish or respond to customers.
   */
  CONNECT_GEMINI_EVALUATION_EVAL_ONLY:
    "connect_gemini_evaluation_eval_only",
  /**
   * Map CRM/forms/booking with passing failure/recovery (T-US-019).
   * Environment binding, form→CRM contract, canary grant/retention,
   * booking capability matrix, correlated journey; live Zoho NOT_WIRED.
   */
  MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY:
    "map_crm_forms_booking_failure_recovery",
  /**
   * Synthetic leads classified; no commerce pollution (T-US-020).
   * synthetic + ws_synthetic classification; commercialExcluded;
   * live Zoho NOT_WIRED. Distinct from T-X052 / T-X050.
   */
  SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION:
    "synthetic_leads_classified_no_commerce_pollution",
  /**
   * Connect local/social/inbox with test artifact + capability (T-US-021).
   * Account/asset IDs, auth, per-action capability matrix, destination
   * contract, support policy, authorized test artifact; live NOT_WIRED.
   * Distinct from T-US-022 / T-X045.
   */
  CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT:
    "connect_local_social_inbox_test_artifact",
  /**
   * Unsupported destination capabilities respected (T-US-022).
   * Per-destination capability matrix; unsupported actions refused;
   * false success claims refused; live NOT_WIRED.
   * Distinct from T-US-021 / T-X045 / T-X046.
   */
  UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED:
    "unsupported_destination_capabilities_respected",
  /**
   * Grant standing autonomy with control-test receipts (T-US-023).
   * Scope snapshot, versioned authority draft, policy constraints,
   * policy test matrix, owner-signed grant + audit, pause/stop-writes/
   * pause-replies receipts; live NOT_WIRED. Distinct from T-US-024 /
   * T-US-060.
   */
  STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS:
    "standing_autonomy_grant_control_receipts",
  /**
   * Launch workstream + recurring schedule with mission outcome (T-US-025).
   * Objective/pilot scope, readiness gates, dry rehearsal (NONE), frequency/
   * timezone/cooldown, launch receipt, mission outcome + next action; live
   * NOT_WIRED. Distinct from T-US-026 / T-X015.
   */
  LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME:
    "launch_workstream_schedule_mission_outcome",
  /**
   * Missed content/social schedules coalesce; no burst republish (T-US-026).
   * Cadence-derived misses, single catch-up after fixture decision, burst
   * republish refused; live NOT_WIRED. Distinct from T-X001 / T-X015 / T-US-025.
   */
  MISSED_SCHEDULE_COALESCE_NO_BURST: "missed_schedule_coalesce_no_burst",
  /**
   * Demand → page improvement with release receipt + experiment window (T-US-027).
   * Observations, intent-to-page match, visibility mission/brief, exact revision
   * diff, independent QA, release receipt + experiment window; keyword
   * proliferation refused; live NOT_WIRED. Distinct from T-US-025 / T-US-026 / T-US-028.
   */
  DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT:
    "demand_page_improvement_release_receipt",
  /**
   * Prefer one useful page update over keyword proliferation (T-US-028).
   * Blocking decision + preserved inputs + recovery path when thin keyword
   * pages are proposed; one useful update preferred; false success refused;
   * live NOT_WIRED. Distinct from T-US-027 (release receipt path).
   */
  KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE:
    "keyword_proliferation_one_useful_update",
  /**
   * Original campaign distribution — campaign manifest (T-US-029 / F15).
   * Brief + versioned draft + QA + per-destination previews/outcomes +
   * measurement state → campaign manifest; blocked channels keep recovery
   * actions; false live success refused; live NOT_WIRED. Distinct from
   * T-X045 / T-US-022 / T-US-030.
   */
  CAMPAIGN_MANIFEST_DISTRIBUTION: "campaign_manifest_distribution",
  /**
   * Uncertain post: reconcile before retry (T-US-030).
   * Blind retry refused while remote outcome uncertain; reconcile/read-back
   * required; present → no retry; absent → linked retry authorized; false
   * success refused; live NOT_WIRED. Distinct from T-US-048/T-X020 / T-X017 /
   * T-US-029 / T-X045.
   */
  UNCERTAIN_POST_RECONCILE_BEFORE_RETRY:
    "uncertain_post_reconcile_before_retry",
  /**
   * Paid-media recommendations — verified mutation or failure (T-US-031 / F16).
   * Decision recorded; execute yields honest LIVE_MUTATION_NOT_WIRED failure;
   * ChatGPT Ads ACCESS_BLOCKED; false live verified claims refused; live
   * NOT_WIRED. Distinct from T-US-011 / T-US-012 / T-US-032 / T-X034–T-X036.
   */
  PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE:
    "paid_media_recommendation_mutation_or_failure",
  /**
   * Claude/Gemini eval suites — adjudication + backlog (T-US-033 / F17).
   * Versioned suite + condition manifest + authorized fixture run; failed
   * cases adjudicated with linked backlog; no production writes; live
   * NOT_WIRED. Distinct from T-US-015 / T-US-017 / T-US-018 / T-X037 / T-X038.
   */
  EVAL_SUITE_ADJUDICATION_BACKLOG: "eval_suite_adjudication_backlog",
  /**
   * Provider error ≠ bad answer or pass (T-US-034).
   * Distinct outcome statuses; provider_error never graded as pass/fail;
   * pass-rate denominator excludes infrastructure errors; live NOT_WIRED.
   * Distinct from T-X039/T-US-058 / T-US-033 / T-X038.
   */
  PROVIDER_ERROR_NOT_PASS: "provider_error_not_pass",
  /**
   * Review/revise/release — release receipt or blocked exception (T-US-035 / F18).
   * Independent decision bound to revision + policy; approve → receipt or
   * blocked exception; self-approval and stale approval refused; live NOT_WIRED.
   * Distinct from T-US-027 / T-US-036/T-X019 / T-US-054/T-X018.
   */
  REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED:
    "review_revise_release_receipt_or_blocked",
  /**
   * Daily owner review — reviewed operating knowledge (T-US-049 / F25).
   * Evidence-backed brief, completed-work ledger, decision records,
   * outcome/cost (synthetic excluded), bounded mission, versioned playbook
   * without silent authority expansion; live NOT_WIRED. Distinct from
   * T-US-050 / T-US-025 / T-US-035.
   */
  DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE:
    "daily_owner_review_operating_knowledge",
  /**
   * Owner brief groups root cause; actionable (T-US-050).
   * Repeated incident signals fold into root-cause groups with actionable
   * next steps; ungrouped floods and non-actionable groups refused; live
   * NOT_WIRED. Distinct from T-US-049 / T-X068.
   */
  OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE: "owner_brief_root_cause_actionable",
  /**
   * Design/release readiness — release acceptance packet (T-US-051 / F26).
   * Test context, interaction trace, accessibility findings, state coverage
   * matrix, SC-01..SC-25 coverage register, and outcome-evidence packet;
   * incomplete coverage and evidence-free approve refused; live NOT_WIRED.
   * Distinct from T-US-035 / T-US-049 / T-US-055.
   */
  DESIGN_RELEASE_READINESS_PACKET: "design_release_readiness_packet",
  /**
   * Secrets never in browser assets (T-US-053).
   * Browser-served assets must not embed secret material; public-env secret
   * embeds and broker-secret ship attempts refused; live NOT_WIRED.
   * Distinct from T-X065 / T-X005 / T-F24/T-US-047 / T-X063.
   */
  SECRETS_NEVER_IN_BROWSER_ASSETS: "secrets_never_in_browser_assets",
  /**
   * Complete keyboard journey with reduced motion (T-US-055).
   * Nav→content→dialog→CTA keyboard path with prefers-reduced-motion
   * honored; motion violations / missing focus / pointer-only refused;
   * live NOT_WIRED. Distinct from T-X061 / T-US-051.
   */
  KEYBOARD_JOURNEY_REDUCED_MOTION: "keyboard_journey_reduced_motion",
  /**
   * Shared briefs redacted; private evidence retained (T-US-059).
   * Shareable brief must be redacted with no private fields; private
   * evidence retained in private vault (not discarded / not in shared
   * export); live NOT_WIRED. Distinct from T-US-050 / T-US-053 /
   * redactEvidenceSummary.
   */
  SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED:
    "shared_briefs_redacted_private_retained",
  /**
   * Choose folders / business truth — folders-ready happy-path summary
   * (T-US-003). Artifact roots + durable secrets/database off sync,
   * hours/capacity/prices/availability with owner/source, write/read +
   * export/restore observed, secrets excluded from restore evidence;
   * live NOT_WIRED. Distinct from T-F02 complete F02 evidence set.
   */
  BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED:
    "business_truth_folders_restore_secrets_excluded",
  /**
   * Create a trusted local workspace — complete F01 evidence set (T-F01).
   * Owner session, workspace revision, timestamped diagnostics (not online
   * badge), Observe authority, startup + recovery, blockers+next-actions;
   * public writes refused; live NOT_WIRED. Distinct from T-US-001 readiness
   * blockers summary.
   */
  CREATE_TRUSTED_LOCAL_WORKSPACE: "create_trusted_local_workspace",
  /**
   * Choose folders and establish business truth — complete F02 evidence set
   * (T-F02). Registered roots + write/read probe, storage-risk checks,
   * ingestion manifest + duplicate detection, business facts + unresolved
   * conflicts, signed revision + impacted assets, restore with secrets
   * excluded; public claims from unresolved refused; live NOT_WIRED.
   * Distinct from T-US-003 folders-ready happy-path summary.
   */
  CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH:
    "choose_folders_establish_business_truth",
  /**
   * Map sites, pages and editable sources — complete F03 evidence set (T-F03).
   * Domain/URL inventory + exclusions, timestamped HTML/screenshot, source
   * binding + deploy target, journey graph with owners, scope grant, baseline
   * ID + checks; unsafe claims refused; live NOT_WIRED. Distinct from
   * T-US-005 baseline-ID happy-path summary.
   */
  MAP_SITES_PAGES_EDITABLE_SOURCES: "map_sites_pages_editable_sources",
  /**
   * Connect Google Analytics 4 — complete F04 evidence set (T-F04).
   * Scopes+identity, property→site bind, versioned event dictionary+owner+gaps,
   * sample report request/rows/coverage, three measurement outcomes,
   * READ_READY+next sync; unsafe claims refused; live NOT_WIRED. Distinct from
   * T-US-007 ready-read/next-sync summary.
   */
  CONNECT_GOOGLE_ANALYTICS_4: "connect_google_analytics_4",
  /**
   * Connect Search Console and organic visibility — complete F05 evidence set
   * (T-F05). Identity+scopes+API readiness, domain/URL-prefix property bind,
   * comparable-query config, observation batch+coverage+sitemap, intent→page
   * map, daily schedule+watermark; unsafe claims refused; live NOT_WIRED.
   * Distinct from T-US-009 schedule/watermark summary.
   */
  CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY:
    "connect_search_console_organic_visibility",
  /**
   * Connect Google Ads for controlled analysis — complete F06 evidence set
   * (T-F06). Project+access tier, identity+scopes, deny-write consent,
   * client/manager bind+TEST badge, campaigns+conversions, event
   * mapping+discrepancies, read receipt+watermark, READ_READY Analyze-only;
   * unsafe claims refused; live NOT_WIRED. Distinct from T-US-011 analyze-only
   * save/reload summary and T-US-012 test vs production separation.
   */
  CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS:
    "connect_google_ads_controlled_analysis",
  /**
   * Connect Claude Code and the Claude test API — complete F08 evidence set
   * (T-F08). Install+auth diagnostic, broker test-API bind, dated model
   * catalog, budget policy+selected model, consented smoke+usage ledger,
   * EVAL_ONLY test adapter enabled; unsafe claims refused; live NOT_WIRED.
   * Distinct from T-US-015 EVAL_ONLY connect summary and T-US-016 runtime vs
   * API eval auth.
   */
  CONNECT_CLAUDE_CODE_AND_TEST_API: "connect_claude_code_and_test_api",
  /**
   * Connect Gemini for independent testing — complete F09 evidence set
   * (T-F09). Data-use decision, broker credential, dated model/capability
   * snapshot, evaluation condition, consented smoke under cap + provider
   * receipt, EVAL_ONLY save (no publish/customer reply); unsafe claims
   * refused; live NOT_WIRED. Distinct from T-US-017 EVAL_ONLY connect
   * summary and T-US-018/T-X037 operational tool forbid.
   */
  CONNECT_GEMINI_INDEPENDENT_TESTING: "connect_gemini_independent_testing",
  /**
   * Map CRM, forms and booking truth — complete F10 evidence set (T-F10).
   * Zoho org/region/environment binding, form→CRM contract, canary
   * grant/retention, booking capability matrix, correlated journey,
   * passing failure/recovery; unsafe claims refused; live Zoho NOT_WIRED.
   * Distinct from T-US-019 failure/recovery readiness summary, T-US-039
   * continuous cadence, and T-US-040 thank-you ≠ CRM.
   */
  MAP_CRM_FORMS_BOOKING_TRUTH: "map_crm_forms_booking_truth",
  /**
   * Connect local, social and inbox channels — complete F11 evidence set
   * (T-F11). Account/asset IDs, auth results, per-action capability
   * matrices, destination contracts, support policy, authorized test
   * artifact with ready capability; unsafe claims refused; live NOT_WIRED.
   * Distinct from T-US-021 connect readiness summary, T-US-022 unsupported
   * destination capabilities, and T-X045 partial campaign destinations.
   */
  CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS: "connect_local_social_inbox_channels",
  /**
   * Grant standing autonomy safely — complete F12 evidence set (T-F12).
   * Scope snapshot, autonomy mode, versioned authority draft, policy
   * constraints, policy test matrix, owner-signed grant + audit, pause /
   * stop-writes / pause-replies control receipts; unsafe claims refused;
   * live NOT_WIRED. Distinct from T-US-023 control-receipts readiness
   * summary, T-US-024 agent cannot widen grant, and T-US-060 emergency
   * stop at commit.
   */
  GRANT_STANDING_AUTONOMY_SAFELY: "grant_standing_autonomy_safely",
  /**
   * Launch workstream + recurring schedule — complete F13 evidence set
   * (T-F13). Objective/pilot scope, readiness gates, plan/assets/cost, dry
   * rehearsal (NONE), frequency/timezone/cooldown, owner-reviewed launch
   * receipt, mission outcome + next action; unsafe claims refused; live
   * NOT_WIRED. Distinct from T-US-025 launch readiness summary, T-US-026
   * missed-schedule coalesce, and T-X015 DST schedule no duplicates.
   */
  LAUNCH_WORKSTREAM_RECURRING_SCHEDULE:
    "launch_workstream_recurring_schedule",
  /**
   * Turn demand into a page improvement — complete F14 evidence set (T-F14).
   * Observations, intent-to-page, mission/brief, proposed answer/metadata/
   * internal-links review, exact revision diff, independent QA, policy
   * release receipt + experiment window, measurable change observation;
   * unsafe claims refused; live NOT_WIRED. Distinct from T-US-027 release
   * receipt summary, T-US-028 keyword proliferation, and T-US-035
   * review/revise/release.
   */
  TURN_DEMAND_INTO_PAGE_IMPROVEMENT: "turn_demand_into_page_improvement",
  /**
   * Create and distribute an original campaign — complete F15 evidence set
   * (T-F15). Approved facts + venue media + authorized capabilities, brief
   * with source IDs and outcome, versioned draft, QA, per-destination
   * previews, canonical publish, provider outcomes, campaign manifest,
   * measurement, distribution review; unsafe claims refused; live NOT_WIRED.
   * Distinct from T-US-029 campaign-manifest summary, T-X045 partial
   * destinations, T-US-022 unsupported capabilities, and T-US-030 uncertain
   * post reconcile.
   */
  CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN:
    "create_and_distribute_original_campaign",
  /**
   * Review Google and ChatGPT paid-media recommendations — complete F16
   * evidence set (T-F16). Read-ready selection + comparable settled data,
   * reproducible analysis definition, evidence-backed diagnosis, typed change
   * proposal, revision-bound financial diff, authorization record, verified
   * mutation or explicit failure; ChatGPT Ads ACCESS_BLOCKED without
   * transport/entitlement; unsafe claims refused; live NOT_WIRED. Distinct
   * from T-US-031 decision+execute-failure summary, T-US-011 analyze-only,
   * T-US-012 test vs production, T-US-032 exact financial boundaries, and
   * T-F07/T-US-013/T-US-014 ChatGPT Ads connect.
   */
  REVIEW_PAID_MEDIA_RECOMMENDATIONS: "review_paid_media_recommendations",
  /**
   * Verify a form-to-CRM journey continuously — complete F20 evidence set
   * (T-F20). Canary identity + target environment + test permission, journey
   * spec + device, synthetic safety gate, step timestamps + correlation,
   * journey graph, pass-or-named-failure (+incident/owner on failure),
   * cadence/heartbeat within allowed load; unsafe claims refused; live Zoho
   * NOT_WIRED. Distinct from T-US-039 cadence/heartbeat summary,
   * T-F10/T-US-019 CRM map / failure→recovery, and T-US-040 thank-you ≠ CRM.
   */
  VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY:
    "verify_form_to_crm_journey_continuously",
  /**
   * Handle after-hours messages and take over — complete F22 evidence set
   * (T-F22). Response policy (coverage/allowed questions/escalation), inbound
   * conversation + message versions, sources and allowed-action evaluation,
   * message receipt + CRM lead link, ownership audit takeover, acknowledged
   * morning handoff; competing replies and unsafe claims refused; live
   * NOT_WIRED. Distinct from T-US-043 handoff summary, T-US-044/T-X053
   * takeover-cancel, T-X055 unknown-policy escalate, and T-X056 bounded
   * auto-reply loop.
   */
  HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER:
    "handle_after_hours_messages_and_takeover",
  /**
   * Analyze performance and test a hypothesis — complete F19 evidence set
   * (T-F19). Saved analysis definition, metric definitions/denominators,
   * view selection, channel/page inspection, discrepancy investigation,
   * reconciliation worksheet, hypothesis+measurement plan, experiment
   * record, redacted portable decision brief; vanity-score and live claims
   * refused; live NOT_WIRED. Distinct from T-US-037 portable-artifact
   * summary, T-US-031 paid-media recommendation, T-US-058/T-X039 metric
   * denominators, and T-X060 currency/timezone mismatch.
   */
  ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS:
    "analyze_performance_and_test_hypothesis",
  /**
   * Review, revise and release a change — complete F18 evidence set (T-F18).
   */
  REVIEW_REVISE_AND_RELEASE_A_CHANGE: "review_revise_and_release_a_change",
  /**
   * Calibrate the design and release readiness — complete F26 evidence set
   * (T-F26). Working prototype + agreed acceptance cases, test context,
   * configure-to-outcome interaction trace, accessibility findings,
   * dangerous-actions review, empty/loading/stale/partial/failed state
   * coverage, handoff-requirements vs implemented-behavior comparison,
   * SC-01..SC-25 route-state verification register, and release acceptance
   * packet with outcome evidence; evidence-free approval and live claims
   * refused; live NOT_WIRED. Distinct from T-US-051 design/release readiness
   * packet summary, T-US-035 review/revise/release, T-US-049 daily owner
   * review, and T-US-055 keyboard journey.
   */
  /**
   * Diagnose and repair a permitted defect — complete F21 evidence set
   * (T-F21). Incident bundle, source binding, bounded repair policy, repair
   * plan, patch+tests+attempt ledger, independent review, canary release,
   * verified resolution or human handoff; unsafe claims refused; live
   * NOT_WIRED. Distinct from T-US-041 resolve/handoff, T-US-042/T-X057
   * weaken-test reject, and T-X058 attempt-limit escalate.
   */
  DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT:
    "diagnose_and_repair_permitted_defect",
  CALIBRATE_DESIGN_RELEASE_READINESS:
    "calibrate_design_release_readiness",
  /**
   * Test semantic search and improve no-result cases — complete F23 evidence
   * set (T-F23). Approved catalog + field ownership, parsed intent with
   * ambiguities, eligibility filter trace, answer/handoff review, judgment,
   * remediation, golden evaluation comparison; unsafe claims refused; live
   * NOT_WIRED. Distinct from T-US-045 evaluation-comparison focused path,
   * T-US-046/T-X048 hard constraints, and T-X038 eval no-grounding.
   */
  TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT:
    "test_semantic_search_improve_no_result",
  /**
   * Run Claude and Gemini evaluation suites — complete F17 evidence set
   * (T-F17). EVAL_ONLY Claude+Gemini connections, curated corpus, budget
   * consent, dual suite selection, condition manifests, redaction check,
   * bounded run authorization, case-level outcomes, human adjudication +
   * linked backlog; unsafe claims refused; live NOT_WIRED. Distinct from
   * T-US-033 adjudication summary, T-US-015/T-US-017 connect,
   * T-US-018/T-X037 operational tool forbid, and T-X038 no-grounding.
   */
  RUN_CLAUDE_GEMINI_EVALUATION_SUITES:
    "run_claude_gemini_evaluation_suites",
  /**
   * Operate the daily owner review — complete F25 evidence set (T-F25).
   * Morning brief + overnight inspection + completed-work ledger, exception
   * decisions, qualified demand + outcome/cost (synthetic excluded), bounded
   * mission, reviewed operating knowledge; unsafe claims refused; live
   * NOT_WIRED. Distinct from T-US-049 operating-knowledge summary, T-US-050
   * root-cause brief, T-US-025 launch workstream, and T-US-035
   * review/revise/release.
   */
  OPERATE_DAILY_OWNER_REVIEW:
    "operate_daily_owner_review",
  /**
   * Diagnose/repair defect — verified resolution or acknowledged handoff (T-US-041).
   * Distinct from T-F21 complete permitted-defect evidence set.
   */
  DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF:
    "diagnose_repair_defect_resolved_or_handoff",
  /**
   * Exact financial boundaries preserved on paid-media proposals (T-US-032).
   * exactChange + financialDiff required; ChatGPT Ads stays ACCESS_BLOCKED.
   */
  EXACT_FINANCIAL_BOUNDARIES_PRESERVED: "exact_financial_boundaries_preserved",
  /**
   * Analyze and hypothesis — portable analysis artifact (T-US-037).
   * Fixture definition/hypothesis/redacted brief JSON round-trip; LIVE refused.
   * Distinct from T-F19 complete F19 evidence set.
   */
  PORTABLE_ANALYSIS_ARTIFACT: "portable_analysis_artifact",
  /**
   * Trusted local workspace readiness — blockers + next actions (T-US-001).
   * Host/Claude/providers/workstreams dimensions with explicit blockers and
   * next actions under Observe; Ads three-part gate ACCESS_BLOCKED; public
   * write → PRESENT effects. Distinct from T-F01 complete F01 evidence set.
   */
  TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS:
    "trusted_workspace_readiness_blockers_next_actions",
  /**
   * Form→CRM continuous verify — cadence/heartbeat history (T-US-039).
   * MATCHED SUCCESS advances lastVerified; STAGE_FAILURE names failed stage;
   * missed cadence is COVERAGE_GAP (not SUCCESS). Distinct from T-F20 complete
   * journey evidence, T-X001 host-sleep coalesce, and T-US-040 thank-you ≠ CRM.
   */
  FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT:
    "form_crm_continuous_verify_cadence_heartbeat",
  /**
   * After-hours + takeover — acknowledged handoff (T-US-043).
   * Outside coverage refuses drafts; handoff stops agent send; ack required.
   * Distinct from T-F22 complete after-hours evidence set.
   */
  AFTER_HOURS_HANDOFF_ACKNOWLEDGED: "after_hours_handoff_acknowledged",
} as const;

export type SoakProofKindValue =
  (typeof SoakProofKind)[keyof typeof SoakProofKind];

export const PilotGateStatus = {
  NOT_MET: "NOT_MET",
  MET: "MET",
  BLOCKED: "BLOCKED",
} as const;

export type PilotGateStatusValue =
  (typeof PilotGateStatus)[keyof typeof PilotGateStatus];

export const PilotObservationKind = {
  START: "start",
  HEARTBEAT: "heartbeat",
  END: "end",
} as const;

export type PilotObservationKindValue =
  (typeof PilotObservationKind)[keyof typeof PilotObservationKind];

/**
 * Server-recorded pilot soak observation. Callers must never supply claim dates —
 * only the host clock may mint `recordedAtIso`.
 */
export type PilotGateObservation = {
  kind: PilotObservationKindValue;
  recordedAtIso: string;
};

/** Default R1 pilot soak window (72 hours). */
export const PILOT_SOAK_REQUIRED_MS = 72 * 60 * 60 * 1000;

/** Max gap between consecutive server observations for continuity (6 hours). */
export const DEFAULT_PILOT_MAX_OBSERVATION_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Catalog cases the fixture soak/evidence harness can honestly ACCEPTED offline.
 * T-X066 requires BACKUP_OMIT_RECEIPT (not retry-only NO_DUPLICATE_EFFECTS).
 * T-F24 / T-US-047 require RECOVER_ROTATE_RECONCILE (complete F24 evidence set).
 * T-US-002 / T-X002 require COMPETING_SUPERVISOR_LEASE (singleton host lease).
 * T-X018 / T-US-054 require SELF_APPROVAL_REJECTED (independent A25).
 * T-X073 requires OFFBOARD_ACTIVE_TOKEN_RESIDUAL (incomplete until live revoke).
 * T-US-060 requires EMERGENCY_STOP_AT_COMMIT (outbound stop at commit).
 * T-X005 requires FORGED_BROWSER_ROLE_IGNORED (payload role ignored).
 * T-X006 requires CROSS_WORKSPACE_REFERENCE_DENIED (deny without leak).
 * T-X019 / T-US-036 require APPROVED_PAYLOAD_EDIT_INVALIDATED (digest/revision).
 * T-X029 requires EXPLICIT_ACCOUNT_REBIND (not same-account local rotate).
 * T-US-057 requires CROSS_WORKSPACE_RESOURCE_SUBSTITUTION.
 * T-US-024 requires AGENT_CANNOT_WIDEN_GRANT.
 * T-US-042 / T-X057 require REPAIR_WEAKEN_TEST_REJECTED.
 * T-US-044 / T-X053 require TAKEOVER_CANCELS_UNSENT_REPLIES.
 * T-US-018 / T-X037 require EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN.
 * T-X058 requires REPAIR_ATTEMPT_LIMIT_ESCALATED.
 * T-X069 requires IMPORTED_DOC_QUARANTINED_AS_DATA.
 * T-X038 requires EVAL_NO_GROUNDING_FAIL_CLOSED.
 * T-X039 / T-US-058 require METRIC_DENOMINATORS_HONEST.
 * T-US-046 / T-X048 require HARD_SEARCH_CONSTRAINTS_NO_INVENTION.
 * T-US-010 / T-X033 require GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO.
 * T-US-008 / T-X032 require GA4_DEBUG_NOT_DELIVERED_CONVERSION.
 * T-X031 requires GA4_WRONG_PROPERTY_KIND_REFUSED.
 * T-US-040 / T-X049 require THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY.
 * T-X017 requires STOP_AFTER_DISPATCH_RECONCILE (no fake cancel after APPLYING).
 * T-X024 requires OLD_FENCE_AFTER_REASSIGNMENT.
 * T-X011 requires OUTPUT_BOMB_BOUNDED_QUARANTINED (oversized stdout quarantined).
 * T-X003 requires SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION.
 * T-X050 requires PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT.
 * T-X010 requires MALICIOUS_PROMPT_NO_SHELL_INJECTION.
 * T-X009 requires CLI_ERROR_DESPITE_EXIT_ZERO (job fails when CLI reports error on exit 0).
 * T-X015 requires DST_RECURRING_SCHEDULE_NO_DUPLICATES.
 * T-X001 requires HOST_SLEEP_MONITORING_COVERAGE_GAP.
 * T-X021 requires CONCURRENT_IDEMPOTENT_RELEASE (not retry-only NO_DUPLICATE_EFFECTS).
 * T-X022 requires IDEMPOTENCY_KEY_PAYLOAD_MISMATCH (business key digest conflict).
 * T-X065 requires WORKER_BROWSER_AUTH_STATE_OS_DENIED.
 * T-X004 requires DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED (no partial COMPLETED manifest).
 * T-X027 requires UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL.
 * T-X028 requires ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE.
 * T-X008 requires FACT_CHANGES_AFTER_REVIEW_STALE (cited/support change; no publish).
 * T-X012 requires ORPHAN_WORKER_DEADLINE_TREE_STOPPED
 * T-X007 requires WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP (process tree stopped on deadline).
 * T-X016 requires STOP_BEFORE_DISPATCH_NO_MUTATION (no adapter mutation).
 * T-X063 requires INDIRECT_PROMPT_INJECTION_EXFIL_DENIED.
 * T-X013 requires REPLAY_HISTORICAL_NO_REPEAT_IO (history replay; no second I/O).
 * T-X025 requires EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED.
 * T-X043 requires OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS (CTA journey regression).
 * T-X026 requires CONCURRENT_FINAL_BUDGET_RESERVATION_CAP (same-snapshot composition).
 * T-X052 requires SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED (commerce exclusion).
 * T-X054 requires REPLY_SENT_CRM_RECONCILES_NO_RESEND.
 * T-X055 requires UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE.
 * T-X056 requires AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF.
 * T-X059 / T-US-038 require DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING.
 * T-X060 requires CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM.
 * T-X070 requires VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES.
 * T-X044 requires UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED.
 * T-X045 requires PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE (per-destination honesty).
 * T-US-006 requires UNBOUND_WRITE_PATH_FAIL_CLOSED.
 * T-X023 requires EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND.
 * T-US-052 requires MOCKED_CONNECTOR_NOT_PRODUCTION_READY.
 * T-X030 requires RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE.
 * T-US-056 requires HONEST_OUTAGE_HOSTED_CONTACT_PATH.
 * T-X040 requires LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE (research only; not publish).
 * T-US-012 requires GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED (test ≠ production).
 * T-US-015 requires CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY (runtime ≠ API readiness; EVAL_ONLY).
* T-US-016 requires CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED.
 * T-US-017 requires CONNECT_GEMINI_EVALUATION_EVAL_ONLY (Gemini EVAL_ONLY connect; live NOT_WIRED).
 * T-US-019 requires MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY (CRM/forms/booking map + failure/recovery; live Zoho NOT_WIRED).
 * T-US-020 requires SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION (classified canary; no commerce pollution).
 * T-US-021 requires CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT (local/social/inbox connect; test artifact + capability; live NOT_WIRED).
 * T-US-022 requires UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED (unsupported destination capabilities refused; live NOT_WIRED).
 * T-US-023 requires STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS (owner-signed standing autonomy + control receipts; live NOT_WIRED).
 * T-US-025 requires LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME (workstream launch + schedule + mission outcome; live NOT_WIRED).
 * T-US-026 requires MISSED_SCHEDULE_COALESCE_NO_BURST (missed publish slots coalesce; no burst republish; live NOT_WIRED).
 * T-US-027 requires DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT (demand→page improvement; release receipt + experiment window; live NOT_WIRED).
 * T-US-028 requires KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE (prefer one useful page update; keyword proliferation refused; live NOT_WIRED).
 * T-US-029 requires CAMPAIGN_MANIFEST_DISTRIBUTION (original campaign distribution campaign manifest; live NOT_WIRED).
 * T-US-030 requires UNCERTAIN_POST_RECONCILE_BEFORE_RETRY (uncertain post reconcile before retry; live NOT_WIRED).
 * T-US-031 requires PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE (paid-media recommendation decision + honest execute failure; live NOT_WIRED).
 * T-US-033 requires EVAL_SUITE_ADJUDICATION_BACKLOG (Claude/Gemini eval suite adjudication + linked backlog; live NOT_WIRED).
 * T-US-034 requires PROVIDER_ERROR_NOT_PASS (provider error ≠ bad answer or pass; live NOT_WIRED).
 * T-US-035 requires REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED (review/revise/release receipt or blocked exception; live NOT_WIRED).
 * T-US-049 requires DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE (daily owner review reviewed operating knowledge; live NOT_WIRED).
 * T-US-050 requires OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE (owner brief groups root cause; actionable; live NOT_WIRED).
 * T-US-051 requires DESIGN_RELEASE_READINESS_PACKET (design/release readiness release acceptance packet; live NOT_WIRED).
 * T-US-053 requires SECRETS_NEVER_IN_BROWSER_ASSETS (secrets never in browser assets; live NOT_WIRED).
 * T-US-055 requires KEYBOARD_JOURNEY_REDUCED_MOTION (complete keyboard journey with reduced motion; live NOT_WIRED).
 * T-US-059 requires SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED (shared briefs redacted; private evidence retained; live NOT_WIRED).
 * T-US-003 requires BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED (folders-ready happy-path; live NOT_WIRED).
 * T-F01 requires CREATE_TRUSTED_LOCAL_WORKSPACE (complete F01 evidence set; live NOT_WIRED).
 * T-F02 requires CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH (complete F02 evidence set; live NOT_WIRED).
 * T-F03 requires MAP_SITES_PAGES_EDITABLE_SOURCES (complete F03 evidence set; live NOT_WIRED).
 * T-F04 requires CONNECT_GOOGLE_ANALYTICS_4 (complete F04 evidence set; live NOT_WIRED).
 * T-F05 requires CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY (complete F05 evidence set; live NOT_WIRED).
 * T-F06 requires CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS (complete F06 evidence set; live NOT_WIRED).
 * T-F08 requires CONNECT_CLAUDE_CODE_AND_TEST_API (complete F08 evidence set; live NOT_WIRED).
 * T-F09 requires CONNECT_GEMINI_INDEPENDENT_TESTING (complete F09 evidence set; live NOT_WIRED).
 * T-F10 requires MAP_CRM_FORMS_BOOKING_TRUTH (complete F10 evidence set; live Zoho NOT_WIRED).
 * T-F11 requires CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS (complete F11 evidence set; live NOT_WIRED).
 * T-F12 requires GRANT_STANDING_AUTONOMY_SAFELY (complete F12 evidence set; live NOT_WIRED).
 * T-F13 requires LAUNCH_WORKSTREAM_RECURRING_SCHEDULE (complete F13 evidence set; live NOT_WIRED).
 * T-F14 requires TURN_DEMAND_INTO_PAGE_IMPROVEMENT (complete F14 evidence set; live NOT_WIRED).
 * T-F15 requires CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN (complete F15 evidence set; live NOT_WIRED).
 * T-F16 requires REVIEW_PAID_MEDIA_RECOMMENDATIONS (complete F16 evidence set; live NOT_WIRED).
 * T-F20 requires VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY (complete F20 evidence set; live Zoho NOT_WIRED).
 * T-F22 requires HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER (complete F22 evidence set; live NOT_WIRED).
 * T-F19 requires ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS (complete F19 evidence set; live NOT_WIRED).
 * T-F18 requires REVIEW_REVISE_AND_RELEASE_A_CHANGE (complete F18 evidence set; live NOT_WIRED).
 * T-F21 requires DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT (complete F21 evidence set; live NOT_WIRED).
 * T-F26 requires CALIBRATE_DESIGN_RELEASE_READINESS (complete F26 evidence set; live NOT_WIRED).
 * T-F23 requires TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT (complete evidence set; live NOT_WIRED).
 * T-F17 requires RUN_CLAUDE_GEMINI_EVALUATION_SUITES (complete evidence set; live NOT_WIRED).
 * T-F25 requires OPERATE_DAILY_OWNER_REVIEW (complete evidence set; live NOT_WIRED).
 * T-US-041 requires DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF.
 * T-US-032 requires EXACT_FINANCIAL_BOUNDARIES_PRESERVED.
 * T-US-037 requires PORTABLE_ANALYSIS_ARTIFACT (portable brief; live NOT_WIRED).
 * T-US-001 requires TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS.
 * T-US-039 requires FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT.
 * T-US-043 requires AFTER_HOURS_HANDOFF_ACKNOWLEDGED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */
export const SOAK_FIXTURE_CASE_IDS = [
  "T-X014",
  "T-X020",
  "T-US-048",
  "T-X066",
  "T-F01",
  "T-F02",
  "T-F03",
  "T-F04",
  "T-F05",
  "T-F06",
  "T-F08",
  "T-F09",
  "T-F10",
  "T-F11",
  "T-F12",
  "T-F13",
  "T-F14",
  "T-F15",
  "T-F16",
  "T-F18",
  "T-F20",
  "T-F21",
  "T-F19",
  "T-F22",
  "T-F23",
  "T-F17",
  "T-F25",
  "T-F24",
  "T-F26",
  "T-US-047",
  "T-US-002",
  "T-X002",
  "T-X018",
  "T-US-054",
  "T-X073",
  "T-US-060",
  "T-X005",
  "T-X006",
  "T-X019",
  "T-US-036",
  "T-X029",
  "T-US-057",
  "T-US-024",
  "T-US-042",
  "T-X057",
  "T-US-044",
  "T-X053",
  "T-US-018",
  "T-X037",
  "T-X058",
  "T-X069",
  "T-X038",
  "T-X039",
  "T-US-058",
  "T-US-046",
  "T-X048",
  "T-US-010",
  "T-X033",
  "T-US-008",
  "T-X032",
  "T-X031",
  "T-US-040",
  "T-X049",
  "T-X017",
  "T-X024",
  "T-X011",
  "T-X003",
  "T-X050",
  "T-X010",
  "T-X009",
  "T-X015",
  "T-X001",
  "T-X021",
  "T-X022",
  "T-X065",
  "T-X008",
  "T-X012",
  "T-X007",
  "T-X016",
  "T-X063",
  "T-X013",
  "T-X027",
  "T-X004",
  "T-X025",
  "T-X043",
  "T-X026",
  "T-X052",
  "T-X054",
  "T-X055",
  "T-X056",
  "T-X059",
  "T-US-038",
  "T-X060",
  "T-X070",
  "T-X028",
  "T-X044",
  "T-X045",
  "T-US-006",
  "T-X023",
  "T-US-052",
  "T-X030",
  "T-US-056",
  "T-X040",
  "T-US-012",
  "T-US-015",
  "T-US-016",
  "T-US-017",
  "T-US-019",
  "T-US-020",
  "T-US-021",
  "T-US-022",
  "T-US-023",
  "T-US-025",
  "T-US-026",
  "T-US-027",
  "T-US-028",
  "T-US-029",
  "T-US-030",
  "T-US-031",
  "T-US-033",
  "T-US-034",
  "T-US-035",
  "T-US-049",
  "T-US-050",
  "T-US-051",
  "T-US-053",
  "T-US-055",
  "T-US-059",
  "T-US-041",
  "T-US-032",
  "T-US-037",
  "T-US-001",
  "T-US-039",
  "T-US-043",
  "T-US-003",
] as const;

export type SoakFixtureCaseId = (typeof SOAK_FIXTURE_CASE_IDS)[number];

/** Related catalog IDs (fixture ACCEPTED set + adjacent recovery/ads cases). */
export const SOAK_RELATED_CASE_IDS: readonly string[] = [
  ...SOAK_FIXTURE_CASE_IDS,
  "T-F07",
  "T-US-013",
  "T-X073",
] as const;

export type RedactedEvidenceArtifact = {
  artifactId: string;
  caseId: string;
  environment: AcceptanceEnvironmentValue;
  /** Always redacted — never includes secrets, tokens, or raw PII. */
  redacted: true;
  summary: string;
  proofKinds: SoakProofKindValue[];
  /** Relative path or logical ref inside the evidence store. */
  evidenceRef: string;
  createdAtIso: string;
  /** Explicit: fixture proofs are not live provider success. */
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

export type AcceptanceCaseEvidenceRecord = {
  caseId: string;
  status: AcceptanceCaseStatusValue;
  environment: AcceptanceEnvironmentValue;
  artifactId: string | null;
  reasons: string[];
  updatedAtIso: string;
};

export type SoakProofRecord = {
  proofId: string;
  kind: SoakProofKindValue;
  passed: boolean;
  details: string[];
  /** Apply attempts observed for the business key (must be 1 when no-dup). */
  applyAttemptCount: number | null;
  operationId: string | null;
  createdAtIso: string;
  fixtureOnly: true;
};

export type SoakRunRecord = {
  runId: string;
  startedAtIso: string;
  endedAtIso: string;
  durationMs: number;
  environment: AcceptanceEnvironmentValue;
  proofs: SoakProofRecord[];
  caseResults: AcceptanceCaseEvidenceRecord[];
  pilotGate: PilotGateEvaluation;
  /** Server-recorded observations used for this run's gate evaluation. */
  pilotObservations: PilotGateObservation[];
  chatgptAds: {
    allowed: false;
    wiring: "NOT_WIRED";
    reason: string;
  };
  liveWiring: {
    cms: "NOT_WIRED";
    gsc: "NOT_WIRED";
    ga4: "NOT_WIRED";
    zoho: "NOT_WIRED";
    temporal: "NOT_WIRED";
  };
  r1CompleteClaimed: false;
  externalEffects: "NONE";
  honestNote: string;
};

export type PilotGateEvaluation = {
  status: PilotGateStatusValue;
  requiredMs: number;
  observedMs: number;
  proofsRequired: SoakProofKindValue[];
  proofsPassed: SoakProofKindValue[];
  reasons: string[];
  /** True when duration came from server observations (never client claim dates). */
  serverObservationsOnly: true;
};

export type SoakAcceptanceState = {
  version: 1;
  updatedAtIso: string;
  runs: SoakRunRecord[];
  artifacts: RedactedEvidenceArtifact[];
  caseLedger: AcceptanceCaseEvidenceRecord[];
  /** Active pilot window observations (server clock only). */
  pilotObservations: PilotGateObservation[];
  liveWiring: SoakRunRecord["liveWiring"];
  chatgptAdsWiring: "NOT_WIRED";
};

export function emptySoakAcceptanceState(nowIso: string): SoakAcceptanceState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    runs: [],
    artifacts: [],
    caseLedger: [],
    pilotObservations: [],
    liveWiring: {
      cms: "NOT_WIRED",
      gsc: "NOT_WIRED",
      ga4: "NOT_WIRED",
      zoho: "NOT_WIRED",
      temporal: "NOT_WIRED",
    },
    chatgptAdsWiring: "NOT_WIRED",
  };
}

export function isAllowedAcceptanceStatus(
  status: string,
): status is AcceptanceCaseStatusValue {
  return (
    status === AcceptanceCaseStatus.NOT_RUN ||
    status === AcceptanceCaseStatus.ACCEPTED ||
    status === AcceptanceCaseStatus.FAILED ||
    status === AcceptanceCaseStatus.BLOCKED
  );
}

/**
 * ACCEPTED requires a real evidence artifact and a non-production environment
 * for fixture harness results. VERIFIED is always rejected here.
 */
export function validateAcceptanceCaseStatus(input: {
  status: string;
  environment?: string | null;
  evidenceArtifactId?: string | null;
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (statusLooksVerified(input.status)) {
    reasons.push(
      "VERIFIED is forbidden in the acceptance matrix/evidence ledger without an explicit authorized-production evidence package — never silently VERIFIED for live",
    );
  }
  if (!isAllowedAcceptanceStatus(input.status)) {
    reasons.push(`Unsupported acceptance status: ${input.status}`);
  }
  if (input.status === AcceptanceCaseStatus.ACCEPTED) {
    if (!input.evidenceArtifactId || !String(input.evidenceArtifactId).trim()) {
      reasons.push("ACCEPTED requires evidenceArtifactId with real evidence");
    }
    const env = input.environment ?? "";
    if (
      env !== AcceptanceEnvironment.FIXTURE &&
      env !== AcceptanceEnvironment.SANDBOX
    ) {
      reasons.push(
        `ACCEPTED harness results require environment fixture|sandbox, got ${JSON.stringify(env)}`,
      );
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function statusLooksVerified(status: string): boolean {
  return status.toUpperCase() === FORBIDDEN_SILENT_LIVE_STATUS;
}

/**
 * Evaluate the 72h pilot gate from **server-recorded** observations only.
 * Client-supplied startedAtIso/endedAtIso claim dates must never be passed here.
 */
export function evaluatePilotGate(input: {
  observations: readonly PilotGateObservation[];
  proofs: readonly SoakProofRecord[];
  requiredMs?: number;
  maxObservationGapMs?: number;
}): PilotGateEvaluation {
  const requiredMs = input.requiredMs ?? PILOT_SOAK_REQUIRED_MS;
  const maxGap =
    input.maxObservationGapMs ?? DEFAULT_PILOT_MAX_OBSERVATION_GAP_MS;

  const proofsRequired = [
    SoakProofKind.CRASH_RESTART,
    SoakProofKind.NO_DUPLICATE_EFFECTS,
    SoakProofKind.JOB_CONTINUITY,
    SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
  ] as const;

  const proofsPassed = proofsRequired.filter((kind) =>
    input.proofs.some((p) => p.kind === kind && p.passed),
  );

  const reasons: string[] = [];
  const sorted = [...input.observations]
    .filter((o) => Number.isFinite(Date.parse(o.recordedAtIso)))
    .sort(
      (a, b) => Date.parse(a.recordedAtIso) - Date.parse(b.recordedAtIso),
    );

  const start = sorted.find((o) => o.kind === PilotObservationKind.START);
  const end = [...sorted]
    .reverse()
    .find((o) => o.kind === PilotObservationKind.END);

  let observedMs = 0;
  if (!start || !end) {
    reasons.push(
      "Pilot gate requires server-recorded start and end observations (client claim dates ignored)",
    );
  } else {
    const startMs = Date.parse(start.recordedAtIso);
    const endMs = Date.parse(end.recordedAtIso);
    observedMs = Math.max(0, endMs - startMs);

    const window = sorted.filter((o) => {
      const t = Date.parse(o.recordedAtIso);
      return t >= startMs && t <= endMs;
    });
    for (let i = 1; i < window.length; i++) {
      const gap =
        Date.parse(window[i]!.recordedAtIso) -
        Date.parse(window[i - 1]!.recordedAtIso);
      if (gap > maxGap) {
        reasons.push(
          `Observation gap ${gap}ms exceeds max ${maxGap}ms — soak continuity broken`,
        );
      }
    }

    if (observedMs < requiredMs) {
      reasons.push(
        `Soak duration ${observedMs}ms < required ${requiredMs}ms (72h pilot gate)`,
      );
    }
  }

  for (const kind of proofsRequired) {
    if (!proofsPassed.includes(kind)) {
      reasons.push(`Missing passing soak proof: ${kind}`);
    }
  }

  if (reasons.length > 0) {
    return {
      status: PilotGateStatus.NOT_MET,
      requiredMs,
      observedMs,
      proofsRequired: [...proofsRequired],
      proofsPassed: [...proofsPassed],
      reasons,
      serverObservationsOnly: true,
    };
  }

  return {
    status: PilotGateStatus.MET,
    requiredMs,
    observedMs,
    proofsRequired: [...proofsRequired],
    proofsPassed: [...proofsPassed],
    reasons: [
      "72h soak window and required recovery proofs satisfied via server observations",
    ],
    serverObservationsOnly: true,
  };
}

export function redactEvidenceSummary(raw: string): string {
  return raw
    .replace(
      /(password|secret|token|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

export function buildRedactedArtifact(input: {
  artifactId: string;
  caseId: string;
  environment: AcceptanceEnvironmentValue;
  summary: string;
  proofKinds: SoakProofKindValue[];
  evidenceRef: string;
  createdAtIso: string;
}): RedactedEvidenceArtifact {
  if (input.environment === AcceptanceEnvironment.AUTHORIZED_PRODUCTION) {
    throw new Error(
      "Fixture/sandbox evidence compiler must not emit authorized_production artifacts",
    );
  }
  return {
    artifactId: input.artifactId,
    caseId: input.caseId,
    environment: input.environment,
    redacted: true,
    summary: redactEvidenceSummary(input.summary),
    proofKinds: input.proofKinds,
    evidenceRef: input.evidenceRef,
    createdAtIso: input.createdAtIso,
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

export function soakChatGptAdsBlocked(): {
  allowed: false;
  wiring: "NOT_WIRED";
  reason: string;
} {
  const decision = evaluateChatGptAdsAccess({
    localTransportVerified: false,
    entitlementVerified: false,
    authVerified: false,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment: AnalyticsEnvironment.LIVE,
  });
  return {
    allowed: false,
    wiring: "NOT_WIRED",
    reason:
      decision.reasons.join("; ") ||
      "ChatGPT Ads access-blocked without verified local transport and entitlement",
  };
}

/**
 * Proof kinds required before a fixture case may be ACCEPTED.
 * Incomplete or failed related proofs leave the case NOT_RUN / FAILED.
 */
export function expectedProofsForFixtureCase(
  caseId: SoakFixtureCaseId,
): SoakProofKindValue[] {
  switch (caseId) {
    case "T-X014":
      return [SoakProofKind.CRASH_RESTART, SoakProofKind.JOB_CONTINUITY];
    case "T-X020":
      return [SoakProofKind.UNKNOWN_REMOTE_RECONCILE];
    case "T-US-048":
      return [SoakProofKind.UNKNOWN_REMOTE_RECONCILE];
    case "T-X066":
      return [SoakProofKind.BACKUP_OMIT_RECEIPT];
    case "T-F24":
      return [SoakProofKind.RECOVER_ROTATE_RECONCILE];
    case "T-US-047":
      return [SoakProofKind.RECOVER_ROTATE_RECONCILE];
    case "T-US-002":
      return [SoakProofKind.COMPETING_SUPERVISOR_LEASE];
    case "T-X002":
      return [SoakProofKind.COMPETING_SUPERVISOR_LEASE];
    case "T-X018":
      return [SoakProofKind.SELF_APPROVAL_REJECTED];
    case "T-US-054":
      return [SoakProofKind.SELF_APPROVAL_REJECTED];
    case "T-X073":
      return [SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL];
    case "T-US-060":
      return [SoakProofKind.EMERGENCY_STOP_AT_COMMIT];
    case "T-X005":
      return [SoakProofKind.FORGED_BROWSER_ROLE_IGNORED];
    case "T-X006":
      return [SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED];
    case "T-X019":
      return [SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED];
    case "T-US-036":
      return [SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED];
    case "T-X029":
      return [SoakProofKind.EXPLICIT_ACCOUNT_REBIND];
    case "T-US-057":
      return [SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION];
    case "T-US-024":
      return [SoakProofKind.AGENT_CANNOT_WIDEN_GRANT];
    case "T-US-042":
      return [SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED];
    case "T-X057":
      return [SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED];
    case "T-US-044":
      return [SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES];
    case "T-X053":
      return [SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES];
    case "T-US-018":
      return [SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN];
    case "T-X037":
      return [SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN];
    case "T-X058":
      return [SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED];
    case "T-X069":
      return [SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA];
    case "T-X038":
      return [SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED];
    case "T-X039":
      return [SoakProofKind.METRIC_DENOMINATORS_HONEST];
    case "T-US-058":
      return [SoakProofKind.METRIC_DENOMINATORS_HONEST];
    case "T-US-046":
      return [SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION];
    case "T-X048":
      return [SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION];
    case "T-US-010":
      return [SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO];
    case "T-X033":
      return [SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO];
    case "T-US-008":
      return [SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION];
    case "T-X032":
      return [SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION];
    case "T-X031":
      return [SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED];
    case "T-US-040":
      return [SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY];
    case "T-X049":
      return [SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY];
    case "T-X017":
      return [SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE];
    case "T-X024":
      return [SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT];
    case "T-X011":
      return [SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED];
    case "T-X003":
      return [SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION];
    case "T-X050":
      return [SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT];
    case "T-X010":
      return [SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION];
    case "T-X009":
      return [SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO];
    case "T-X015":
      return [SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES];
    case "T-X001":
      return [SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP];
    case "T-X021":
      return [SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE];
    case "T-X022":
      return [SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH];
    case "T-X065":
      return [SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED];
    case "T-X027":
      return [SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL];
    case "T-X028":
      return [SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE];
    case "T-X008":
      return [SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE];
    case "T-X012":
      return [SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED];
    case "T-X007":
      return [SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP];
    case "T-X016":
      return [SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION];
    case "T-X063":
      return [SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED];
    case "T-X013":
      return [SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO];
    case "T-X004":
      return [SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED];
    case "T-X025":
      return [SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED];
    case "T-X043":
      return [SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS];
    case "T-X026":
      return [SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP];
    case "T-X052":
      return [SoakProofKind.SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED];
    case "T-X054":
      return [SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND];
    case "T-X055":
      return [SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE];
    case "T-X056":
      return [SoakProofKind.AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF];
    case "T-X059":
      return [SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING];
    case "T-US-038":
      return [SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING];
    case "T-X060":
      return [SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM];
    case "T-X070":
      return [SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES];
    case "T-X044":
      return [SoakProofKind.UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED];
    case "T-X045":
      return [SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE];
    case "T-US-006":
      return [SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED];
    case "T-X023":
      return [SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND];
    case "T-US-052":
      return [SoakProofKind.MOCKED_CONNECTOR_NOT_PRODUCTION_READY];
    case "T-X030":
      return [SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE];
    case "T-US-056":
      return [SoakProofKind.HONEST_OUTAGE_HOSTED_CONTACT_PATH];
    case "T-X040":
      return [SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE];
    case "T-US-012":
      return [SoakProofKind.GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED];
    case "T-US-015":
      return [SoakProofKind.CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY];
    case "T-US-016":
      return [SoakProofKind.CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED];
    case "T-US-017":
      return [SoakProofKind.CONNECT_GEMINI_EVALUATION_EVAL_ONLY];
    case "T-US-019":
      return [SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY];
    case "T-US-020":
      return [SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION];
    case "T-US-021":
      return [SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT];
    case "T-US-022":
      return [SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED];
    case "T-US-023":
      return [SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS];
    case "T-US-025":
      return [SoakProofKind.LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME];
    case "T-US-026":
      return [SoakProofKind.MISSED_SCHEDULE_COALESCE_NO_BURST];
    case "T-US-027":
      return [SoakProofKind.DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT];
    case "T-US-028":
      return [SoakProofKind.KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE];
    case "T-US-029":
      return [SoakProofKind.CAMPAIGN_MANIFEST_DISTRIBUTION];
    case "T-US-030":
      return [SoakProofKind.UNCERTAIN_POST_RECONCILE_BEFORE_RETRY];
    case "T-US-031":
      return [SoakProofKind.PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE];
    case "T-US-033":
      return [SoakProofKind.EVAL_SUITE_ADJUDICATION_BACKLOG];
    case "T-US-034":
      return [SoakProofKind.PROVIDER_ERROR_NOT_PASS];
    case "T-US-035":
      return [SoakProofKind.REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED];
    case "T-US-049":
      return [SoakProofKind.DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE];
    case "T-US-050":
      return [SoakProofKind.OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE];
    case "T-US-051":
      return [SoakProofKind.DESIGN_RELEASE_READINESS_PACKET];
    case "T-US-053":
      return [SoakProofKind.SECRETS_NEVER_IN_BROWSER_ASSETS];
    case "T-US-055":
      return [SoakProofKind.KEYBOARD_JOURNEY_REDUCED_MOTION];
    case "T-US-059":
      return [SoakProofKind.SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED];
    case "T-US-003":
      return [SoakProofKind.BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED];
    case "T-F01":
      return [SoakProofKind.CREATE_TRUSTED_LOCAL_WORKSPACE];
    case "T-F02":
      return [SoakProofKind.CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH];
    case "T-F03":
      return [SoakProofKind.MAP_SITES_PAGES_EDITABLE_SOURCES];
    case "T-F04":
      return [SoakProofKind.CONNECT_GOOGLE_ANALYTICS_4];
    case "T-F05":
      return [SoakProofKind.CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY];
    case "T-F06":
      return [SoakProofKind.CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS];
    case "T-F08":
      return [SoakProofKind.CONNECT_CLAUDE_CODE_AND_TEST_API];
    case "T-F09":
      return [SoakProofKind.CONNECT_GEMINI_INDEPENDENT_TESTING];
    case "T-F10":
      return [SoakProofKind.MAP_CRM_FORMS_BOOKING_TRUTH];
    case "T-F11":
      return [SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS];
    case "T-F12":
      return [SoakProofKind.GRANT_STANDING_AUTONOMY_SAFELY];
    case "T-F13":
      return [SoakProofKind.LAUNCH_WORKSTREAM_RECURRING_SCHEDULE];
    case "T-F14":
      return [SoakProofKind.TURN_DEMAND_INTO_PAGE_IMPROVEMENT];
    case "T-F15":
      return [SoakProofKind.CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN];
    case "T-F16":
      return [SoakProofKind.REVIEW_PAID_MEDIA_RECOMMENDATIONS];
    case "T-F20":
      return [SoakProofKind.VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY];
    case "T-F21":
      return [SoakProofKind.DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT];
    case "T-F18":
      return [SoakProofKind.REVIEW_REVISE_AND_RELEASE_A_CHANGE];
    case "T-F19":
      return [SoakProofKind.ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS];
    case "T-F22":
      return [SoakProofKind.HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER];
    case "T-F26":
      return [SoakProofKind.CALIBRATE_DESIGN_RELEASE_READINESS];
    case "T-F23":
      return [SoakProofKind.TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT];
    case "T-F17":
      return [SoakProofKind.RUN_CLAUDE_GEMINI_EVALUATION_SUITES];
    case "T-F25":
      return [SoakProofKind.OPERATE_DAILY_OWNER_REVIEW];
    case "T-US-041":
      return [SoakProofKind.DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF];
    case "T-US-032":
      return [SoakProofKind.EXACT_FINANCIAL_BOUNDARIES_PRESERVED];
    case "T-US-037":
      return [SoakProofKind.PORTABLE_ANALYSIS_ARTIFACT];
    case "T-US-001":
      return [SoakProofKind.TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS];
    case "T-US-039":
      return [SoakProofKind.FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT];
    case "T-US-043":
      return [SoakProofKind.AFTER_HOURS_HANDOFF_ACKNOWLEDGED];
    default:
      return [];
  }
}

/**
 * Map a proof kind to catalog cases it honestly exercises.
 * NO_DUPLICATE_EFFECTS stays unmapped: T-X066 requires BACKUP_OMIT_RECEIPT
 * (backup / omit-receipt / post-restore reconcile), not retry-only no-dup;
 * T-X021 requires CONCURRENT_IDEMPOTENT_RELEASE, not retry-only no-dup.
 * T-X022 requires IDEMPOTENCY_KEY_PAYLOAD_MISMATCH, not retry-only no-dup.
 */
export function mapProofToFixtureCases(
  kind: SoakProofKindValue,
): SoakFixtureCaseId[] {
  switch (kind) {
    case SoakProofKind.CRASH_RESTART:
      return ["T-X014"];
    case SoakProofKind.UNKNOWN_REMOTE_RECONCILE:
      return ["T-US-048", "T-X020"];
    case SoakProofKind.NO_DUPLICATE_EFFECTS:
      return [];
    case SoakProofKind.JOB_CONTINUITY:
      return ["T-X014"];
    case SoakProofKind.BACKUP_OMIT_RECEIPT:
      return ["T-X066"];
    case SoakProofKind.RECOVER_ROTATE_RECONCILE:
      return ["T-F24", "T-US-047"];
    case SoakProofKind.COMPETING_SUPERVISOR_LEASE:
      return ["T-US-002", "T-X002"];
    case SoakProofKind.SELF_APPROVAL_REJECTED:
      return ["T-X018", "T-US-054"];
    case SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL:
      return ["T-X073"];
    case SoakProofKind.EMERGENCY_STOP_AT_COMMIT:
      return ["T-US-060"];
    case SoakProofKind.FORGED_BROWSER_ROLE_IGNORED:
      return ["T-X005"];
    case SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED:
      return ["T-X006"];
    case SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED:
      return ["T-X019", "T-US-036"];
    case SoakProofKind.EXPLICIT_ACCOUNT_REBIND:
      return ["T-X029"];
    case SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION:
      return ["T-US-057"];
    case SoakProofKind.AGENT_CANNOT_WIDEN_GRANT:
      return ["T-US-024"];
    case SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED:
      return ["T-US-042", "T-X057"];
    case SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES:
      return ["T-US-044", "T-X053"];
    case SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN:
      return ["T-US-018", "T-X037"];
    case SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED:
      return ["T-X058"];
    case SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA:
      return ["T-X069"];
    case SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED:
      return ["T-X038"];
    case SoakProofKind.METRIC_DENOMINATORS_HONEST:
      return ["T-X039", "T-US-058"];
    case SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION:
      return ["T-US-046", "T-X048"];
    case SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO:
      return ["T-US-010", "T-X033"];
    case SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION:
      return ["T-US-008", "T-X032"];
    case SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED:
      return ["T-X031"];
    case SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY:
      return ["T-US-040", "T-X049"];
    case SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE:
      return ["T-X017"];
    case SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT:
      return ["T-X024"];
    case SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED:
      return ["T-X011"];
    case SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION:
      return ["T-X003"];
    case SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT:
      return ["T-X050"];
    case SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION:
      return ["T-X010"];
    case SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO:
      return ["T-X009"];
    case SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES:
      return ["T-X015"];
    case SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP:
      return ["T-X001"];
    case SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE:
      return ["T-X021"];
    case SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH:
      return ["T-X022"];
    case SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED:
      return ["T-X065"];
    case SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL:
      return ["T-X027"];
    case SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE:
      return ["T-X028"];
    case SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE:
      return ["T-X008"];
    case SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED:
      return ["T-X012"];
    case SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP:
      return ["T-X007"];
    case SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION:
      return ["T-X016"];
    case SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED:
      return ["T-X063"];
    case SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO:
      return ["T-X013"];
    case SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED:
      return ["T-X004"];
    case SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED:
      return ["T-X025"];
    case SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS:
      return ["T-X043"];
    case SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP:
      return ["T-X026"];
    case SoakProofKind.SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED:
      return ["T-X052"];
    case SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND:
      return ["T-X054"];
    case SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE:
      return ["T-X055"];
    case SoakProofKind.AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF:
      return ["T-X056"];
    case SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING:
      return ["T-X059", "T-US-038"];
    case SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM:
      return ["T-X060"];
    case SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES:
      return ["T-X070"];
    case SoakProofKind.UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED:
      return ["T-X044"];
    case SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE:
      return ["T-X045"];
    case SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED:
      return ["T-US-006"];
    case SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND:
      return ["T-X023"];
    case SoakProofKind.MOCKED_CONNECTOR_NOT_PRODUCTION_READY:
      return ["T-US-052"];
    case SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE:
      return ["T-X030"];
    case SoakProofKind.HONEST_OUTAGE_HOSTED_CONTACT_PATH:
      return ["T-US-056"];
    case SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE:
      return ["T-X040"];
    case SoakProofKind.GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED:
      return ["T-US-012"];
    case SoakProofKind.CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY:
      return ["T-US-015"];
    case SoakProofKind.CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED:
      return ["T-US-016"];
    case SoakProofKind.CONNECT_GEMINI_EVALUATION_EVAL_ONLY:
      return ["T-US-017"];
    case SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY:
      return ["T-US-019"];
    case SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION:
      return ["T-US-020"];
    case SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT:
      return ["T-US-021"];
    case SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED:
      return ["T-US-022"];
    case SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS:
      return ["T-US-023"];
    case SoakProofKind.LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME:
      return ["T-US-025"];
    case SoakProofKind.MISSED_SCHEDULE_COALESCE_NO_BURST:
      return ["T-US-026"];
    case SoakProofKind.DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT:
      return ["T-US-027"];
    case SoakProofKind.KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE:
      return ["T-US-028"];
    case SoakProofKind.CAMPAIGN_MANIFEST_DISTRIBUTION:
      return ["T-US-029"];
    case SoakProofKind.UNCERTAIN_POST_RECONCILE_BEFORE_RETRY:
      return ["T-US-030"];
    case SoakProofKind.PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE:
      return ["T-US-031"];
    case SoakProofKind.EVAL_SUITE_ADJUDICATION_BACKLOG:
      return ["T-US-033"];
    case SoakProofKind.PROVIDER_ERROR_NOT_PASS:
      return ["T-US-034"];
    case SoakProofKind.REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED:
      return ["T-US-035"];
    case SoakProofKind.DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE:
      return ["T-US-049"];
    case SoakProofKind.OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE:
      return ["T-US-050"];
    case SoakProofKind.DESIGN_RELEASE_READINESS_PACKET:
      return ["T-US-051"];
    case SoakProofKind.SECRETS_NEVER_IN_BROWSER_ASSETS:
      return ["T-US-053"];
    case SoakProofKind.KEYBOARD_JOURNEY_REDUCED_MOTION:
      return ["T-US-055"];
    case SoakProofKind.SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED:
      return ["T-US-059"];
    case SoakProofKind.BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED:
      return ["T-US-003"];
    case SoakProofKind.CREATE_TRUSTED_LOCAL_WORKSPACE:
      return ["T-F01"];
    case SoakProofKind.CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH:
      return ["T-F02"];
    case SoakProofKind.MAP_SITES_PAGES_EDITABLE_SOURCES:
      return ["T-F03"];
    case SoakProofKind.CONNECT_GOOGLE_ANALYTICS_4:
      return ["T-F04"];
    case SoakProofKind.CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY:
      return ["T-F05"];
    case SoakProofKind.CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS:
      return ["T-F06"];
    case SoakProofKind.CONNECT_CLAUDE_CODE_AND_TEST_API:
      return ["T-F08"];
    case SoakProofKind.CONNECT_GEMINI_INDEPENDENT_TESTING:
      return ["T-F09"];
    case SoakProofKind.MAP_CRM_FORMS_BOOKING_TRUTH:
      return ["T-F10"];
    case SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS:
      return ["T-F11"];
    case SoakProofKind.GRANT_STANDING_AUTONOMY_SAFELY:
      return ["T-F12"];
    case SoakProofKind.LAUNCH_WORKSTREAM_RECURRING_SCHEDULE:
      return ["T-F13"];
    case SoakProofKind.TURN_DEMAND_INTO_PAGE_IMPROVEMENT:
      return ["T-F14"];
    case SoakProofKind.CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN:
      return ["T-F15"];
    case SoakProofKind.REVIEW_PAID_MEDIA_RECOMMENDATIONS:
      return ["T-F16"];
    case SoakProofKind.VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY:
      return ["T-F20"];
    case SoakProofKind.DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT:
      return ["T-F21"];
    case SoakProofKind.REVIEW_REVISE_AND_RELEASE_A_CHANGE:
      return ["T-F18"];
    case SoakProofKind.ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS:
      return ["T-F19"];
    case SoakProofKind.HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER:
      return ["T-F22"];
    case SoakProofKind.CALIBRATE_DESIGN_RELEASE_READINESS:
      return ["T-F26"];
    case SoakProofKind.TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT:
      return ["T-F23"];
    case SoakProofKind.RUN_CLAUDE_GEMINI_EVALUATION_SUITES:
      return ["T-F17"];
    case SoakProofKind.OPERATE_DAILY_OWNER_REVIEW:
      return ["T-F25"];
    case SoakProofKind.DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF:
      return ["T-US-041"];
    case SoakProofKind.EXACT_FINANCIAL_BOUNDARIES_PRESERVED:
      return ["T-US-032"];
    case SoakProofKind.PORTABLE_ANALYSIS_ARTIFACT:
      return ["T-US-037"];
    case SoakProofKind.TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS:
      return ["T-US-001"];
    case SoakProofKind.FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT:
      return ["T-US-039"];
    case SoakProofKind.AFTER_HOURS_HANDOFF_ACKNOWLEDGED:
      return ["T-US-043"];
    default:
      return [];
  }
}

/** Stable matrix/publish alias for a case (separate from per-run unique artifact IDs). */
export function stableFixtureEvidenceArtifactId(caseId: string): string {
  return `art-fixture-${caseId.toLowerCase()}`;
}

/** Per-run unique artifact ID so historical SoakRunRecord refs keep provenance. */
export function uniqueFixtureEvidenceArtifactId(
  caseId: string,
  runId: string,
): string {
  const short =
    runId.replace(/^soak-/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) ||
    "run";
  return `art-fixture-${caseId.toLowerCase()}-${short}`;
}
