/**
 * Exactly thirty Claude Code role contracts (v3 §5, R1-04).
 * Pure types and registry — no network, CLI, or Node process APIs.
 */

export const AGENT_ROLE_IDS = [
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "A09",
  "A10",
  "A11",
  "A12",
  "A13",
  "A14",
  "A15",
  "A16",
  "A17",
  "A18",
  "A19",
  "A20",
  "A21",
  "A22",
  "A23",
  "A24",
  "A25",
  "A26",
  "A27",
  "A28",
  "A29",
  "A30",
] as const;

export type AgentRoleId = (typeof AGENT_ROLE_IDS)[number];

export const AgentRoleGroup = {
  COMMAND: "Command",
  VISIBILITY: "Visibility",
  CONTENT: "Content",
  RELIABILITY: "Reliability",
  RESPONSE: "Response",
} as const;

export type AgentRoleGroupValue =
  (typeof AgentRoleGroup)[keyof typeof AgentRoleGroup];

/** Tool classes a role may request — never credentials or unrestricted shell. */
export const RoleToolClass = {
  READ_EVIDENCE: "read_evidence",
  WRITE_PROPOSAL: "write_proposal",
  TASK_REQUEST: "task_request",
  REVIEW_VERDICT: "review_verdict",
  LOCAL_ARTIFACT: "local_artifact",
  DETERMINISTIC_PROBE: "deterministic_probe",
} as const;

export type RoleToolClassValue =
  (typeof RoleToolClass)[keyof typeof RoleToolClass];

export type RoleResourceLimits = {
  maxDeadlineSeconds: number;
  maxAttempts: number;
  maxOutputBytes: number;
  /** Estimated Claude cost reservation ceiling in minor currency units. */
  maxBudgetMinor: number;
  /** Max typed task requests this role may emit per job. */
  maxDelegationFanout: number;
};

export type AgentRoleContract = {
  roleId: AgentRoleId;
  version: string;
  name: string;
  group: AgentRoleGroupValue;
  mission: string;
  subscribedEvents: readonly string[];
  assetScope: readonly string[];
  inputKinds: readonly string[];
  outputKinds: readonly string[];
  approvedTools: readonly RoleToolClassValue[];
  /** Effects this role must never claim or apply directly. */
  forbiddenEffects: readonly string[];
  resourceLimits: RoleResourceLimits;
  policyChecks: readonly string[];
  artifactDestinations: readonly string[];
  failureModes: readonly string[];
  escalationOwner: AgentRoleId | "owner";
  /** Independent reviewer role — never the author of the change. */
  independentReviewerRoleId: AgentRoleId;
  /** Whether this role may emit review verdicts for other roles' proposals. */
  mayIssueReviewVerdicts: boolean;
  evaluationSuiteId: string;
};

const DEFAULT_LIMITS: RoleResourceLimits = {
  maxDeadlineSeconds: 180,
  maxAttempts: 2,
  maxOutputBytes: 256_000,
  maxBudgetMinor: 250,
  maxDelegationFanout: 3,
};

function contract(
  partial: Omit<AgentRoleContract, "version" | "independentReviewerRoleId" | "resourceLimits"> & {
    resourceLimits?: Partial<RoleResourceLimits>;
    independentReviewerRoleId?: AgentRoleId;
    version?: string;
  },
): AgentRoleContract {
  return {
    version: partial.version ?? "1.0.0",
    independentReviewerRoleId: partial.independentReviewerRoleId ?? "A25",
    resourceLimits: { ...DEFAULT_LIMITS, ...partial.resourceLimits },
    roleId: partial.roleId,
    name: partial.name,
    group: partial.group,
    mission: partial.mission,
    subscribedEvents: partial.subscribedEvents,
    assetScope: partial.assetScope,
    inputKinds: partial.inputKinds,
    outputKinds: partial.outputKinds,
    approvedTools: partial.approvedTools,
    forbiddenEffects: partial.forbiddenEffects,
    policyChecks: partial.policyChecks,
    artifactDestinations: partial.artifactDestinations,
    failureModes: partial.failureModes,
    escalationOwner: partial.escalationOwner,
    mayIssueReviewVerdicts: partial.mayIssueReviewVerdicts,
    evaluationSuiteId: partial.evaluationSuiteId,
  };
}

/**
 * Canonical registry of A01–A30. Order matches AGENT_ROLE_IDS.
 * Capabilities propose only; gateway + grants authorize effects (R1-02/R1-03).
 */
export const AGENT_ROLE_CONTRACTS: readonly AgentRoleContract[] = [
  contract({
    roleId: "A01",
    name: "Operations Commander",
    group: AgentRoleGroup.COMMAND,
    mission:
      "Convert owner goals and incidents into dependency-aware plans; prioritize work without granting itself permissions.",
    subscribedEvents: ["owner_goal", "incident_opened", "schedule_tick"],
    assetScope: ["workspace", "missions"],
    inputKinds: ["owner_goal", "incident", "queue_snapshot"],
    outputKinds: ["mission_plan", "typed_task_request"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.TASK_REQUEST,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: [
      "self_grant_capability",
      "approve_own_plan",
      "publish",
      "crm_write",
      "customer_reply",
      "unrestricted_shell",
      "credential_access",
    ],
    policyChecks: ["no_self_authorization", "typed_delegation_only"],
    artifactDestinations: ["runs", "reports"],
    failureModes: ["ambiguous_priority", "missing_grant_for_downstream"],
    escalationOwner: "owner",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A01-planning",
    resourceLimits: { maxDelegationFanout: 8, maxDeadlineSeconds: 240 },
  }),
  contract({
    roleId: "A02",
    name: "Instruction and Knowledge Steward",
    group: AgentRoleGroup.COMMAND,
    mission:
      "Maintain approved playbooks, business facts, evidence freshness, conflicts and instruction versions.",
    subscribedEvents: ["source_changed", "fact_conflict", "instruction_proposed"],
    assetScope: ["knowledge", "instructions"],
    inputKinds: ["fact_candidate", "instruction_draft", "source_index"],
    outputKinds: ["fact_status", "instruction_revision_proposal"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: [
      "publish_unapproved_fact",
      "silent_instruction_overwrite",
      "credential_access",
      "unrestricted_shell",
    ],
    policyChecks: ["source_bound_claims", "conflict_visible"],
    artifactDestinations: ["knowledge", "runs"],
    failureModes: ["conflicting_sources", "stale_evidence"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A02-knowledge",
  }),
  contract({
    roleId: "A03",
    name: "Trends and Keyword Intelligence",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Detect emerging, seasonal and high-intent demand from connected sources; produce evidence-backed opportunities.",
    subscribedEvents: ["daily_demand_window", "source_refresh"],
    assetScope: ["research", "owned_sites"],
    inputKinds: ["demand_observation", "keyword_snapshot"],
    outputKinds: ["opportunity_brief"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["publish", "invent_rankings", "credential_access"],
    policyChecks: ["provenance_required", "comparability_labeled"],
    artifactDestinations: ["research", "runs"],
    failureModes: ["missing_source", "stale_window"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A03-demand",
  }),
  contract({
    roleId: "A04",
    name: "FAQ and Customer Question Intelligence",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Cluster genuine customer questions, search questions and unanswered intents; maintain the question-to-page map.",
    subscribedEvents: ["inbound_question", "search_query_batch"],
    assetScope: ["research", "owned_pages"],
    inputKinds: ["question_cluster", "page_map"],
    outputKinds: ["question_page_map", "unanswered_intent"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["customer_reply", "publish", "credential_access"],
    policyChecks: ["deidentified_inputs", "no_invented_faq"],
    artifactDestinations: ["research", "runs"],
    failureModes: ["sparse_signal", "mapping_conflict"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A04-faq",
  }),
  contract({
    roleId: "A05",
    name: "Rankings and Competitive Visibility",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Track comparable organic/local observations, competitors and changes; separate measured ranks from estimates.",
    subscribedEvents: ["daily_rank_window"],
    assetScope: ["research", "competitors"],
    inputKinds: ["rank_observation", "competitor_snapshot"],
    outputKinds: ["visibility_delta"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["claim_estimated_as_measured", "publish", "credential_access"],
    policyChecks: ["measured_vs_estimate", "comparability"],
    artifactDestinations: ["research", "runs"],
    failureModes: ["incomparable_window", "provider_gap"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A05-rankings",
  }),
  contract({
    roleId: "A06",
    name: "Technical SEO Engineer",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Diagnose indexing, canonical, sitemap, status, crawl and rendering defects; propose tested technical fixes.",
    subscribedEvents: ["probe_failure", "release_event", "nightly_crawl"],
    assetScope: ["owned_sites", "worktrees"],
    inputKinds: ["probe_result", "crawl_snapshot"],
    outputKinds: ["technical_fix_proposal"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.DETERMINISTIC_PROBE,
      RoleToolClass.WRITE_PROPOSAL,
      RoleToolClass.TASK_REQUEST,
    ],
    forbiddenEffects: ["self_approve_fix", "live_publish", "credential_access", "unrestricted_shell"],
    policyChecks: ["isolated_worktree", "tests_before_release"],
    artifactDestinations: ["worktrees", "runs"],
    failureModes: ["unreproducible_defect", "missing_binding"],
    escalationOwner: "A24",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A06-tech-seo",
  }),
  contract({
    roleId: "A07",
    name: "On-Page SEO and Internal Linking",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Improve page intent, metadata, navigation and relevant links without keyword stuffing or constant churn.",
    subscribedEvents: ["approved_change", "content_bundle_ready"],
    assetScope: ["owned_pages"],
    inputKinds: ["page_snapshot", "intent_map"],
    outputKinds: ["on_page_proposal"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["keyword_stuffing", "self_approve", "live_publish", "credential_access"],
    policyChecks: ["churn_budget", "source_backed_claims"],
    artifactDestinations: ["content", "runs"],
    failureModes: ["intent_conflict", "thin_evidence"],
    escalationOwner: "A12",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A07-onpage",
  }),
  contract({
    roleId: "A08",
    name: "AEO Specialist",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Create supported direct answers and useful answer coverage mapped to genuine questions.",
    subscribedEvents: ["question_cluster_ready"],
    assetScope: ["owned_pages", "knowledge"],
    inputKinds: ["question_cluster", "approved_facts"],
    outputKinds: ["answer_bundle_proposal"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["unsupported_answer", "self_approve", "live_publish", "credential_access"],
    policyChecks: ["fact_bound", "independent_review_before_release"],
    artifactDestinations: ["content", "runs"],
    failureModes: ["missing_fact", "question_mismatch"],
    escalationOwner: "A25",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A08-aeo",
  }),
  contract({
    roleId: "A09",
    name: "GEO and ChatGPT Presence",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Maintain AI-discovery readiness, authorized business-profile information and properly labeled visibility observations.",
    subscribedEvents: ["profile_change", "daily_geo_window"],
    assetScope: ["business_profile", "owned_sites"],
    inputKinds: ["profile_snapshot", "discovery_observation"],
    outputKinds: ["geo_readiness_report"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["invent_presence", "live_profile_write_without_grant", "credential_access"],
    policyChecks: ["observation_labeled", "verified_access_required"],
    artifactDestinations: ["research", "runs"],
    failureModes: ["unverified_access", "stale_profile"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A09-geo",
  }),
  contract({
    roleId: "A10",
    name: "Schema and Entity Engineer",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Generate and validate factual structured data and stable business/location/space/service relationships.",
    subscribedEvents: ["entity_change", "fact_approved"],
    assetScope: ["owned_sites", "knowledge"],
    inputKinds: ["entity_graph", "approved_facts"],
    outputKinds: ["schema_proposal"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["fabricate_entity", "self_approve", "live_publish", "credential_access"],
    policyChecks: ["fact_bound_schema", "stable_ids"],
    artifactDestinations: ["content", "runs"],
    failureModes: ["entity_conflict", "invalid_schema"],
    escalationOwner: "A25",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A10-schema",
  }),
  contract({
    roleId: "A11",
    name: "Semantic Search Engineer",
    group: AgentRoleGroup.VISIBILITY,
    mission:
      "Maintain Claude-based query understanding, structured filtering, grounded results and no-result analysis.",
    subscribedEvents: ["index_change", "search_eval_request"],
    assetScope: ["search_catalog"],
    inputKinds: ["query", "catalog_snapshot", "hard_filters"],
    outputKinds: ["search_explanation", "no_result_analysis"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["bypass_hard_filters", "invent_inventory", "credential_access", "live_booking"],
    policyChecks: ["deterministic_filters_first", "honest_unknowns"],
    artifactDestinations: ["runs", "reports"],
    failureModes: ["filter_conflict", "empty_catalog"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A11-search",
  }),
  contract({
    roleId: "A12",
    name: "Editorial Strategist",
    group: AgentRoleGroup.CONTENT,
    mission:
      "Turn demand evidence and commercial priorities into a content and distribution plan.",
    subscribedEvents: ["opportunity_ready", "weekly_editorial"],
    assetScope: ["content", "campaigns"],
    inputKinds: ["opportunity_brief", "commercial_priority"],
    outputKinds: ["editorial_plan", "content_brief"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.TASK_REQUEST],
    forbiddenEffects: ["self_approve", "live_publish", "credential_access"],
    policyChecks: ["demand_linked", "priority_visible"],
    artifactDestinations: ["content", "runs"],
    failureModes: ["thin_demand_evidence", "priority_conflict"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A12-editorial",
  }),
  contract({
    roleId: "A13",
    name: "Long-Form Content Writer",
    group: AgentRoleGroup.CONTENT,
    mission:
      "Write and update substantive source-backed articles, guides and landing-page copy.",
    subscribedEvents: ["brief_approved"],
    assetScope: ["content"],
    inputKinds: ["content_brief", "approved_facts", "source_ids"],
    outputKinds: ["article_draft"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["unsupported_claim", "self_approve", "live_publish", "credential_access"],
    policyChecks: ["source_citations", "independent_review_before_release"],
    artifactDestinations: ["content", "runs"],
    failureModes: ["missing_source", "policy_block"],
    escalationOwner: "A25",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A13-writer",
    resourceLimits: { maxDeadlineSeconds: 300, maxBudgetMinor: 500 },
  }),
  contract({
    roleId: "A14",
    name: "Social and Creative Producer",
    group: AgentRoleGroup.CONTENT,
    mission:
      "Adapt campaigns into channel-native copy and approved-media layouts, captions and alt text.",
    subscribedEvents: ["campaign_update", "article_ready"],
    assetScope: ["content", "approved_media"],
    inputKinds: ["campaign", "approved_media_refs"],
    outputKinds: ["channel_variant"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: [
      "invent_venue_photos",
      "unapproved_generative_image",
      "self_approve",
      "live_publish",
      "credential_access",
    ],
    policyChecks: ["approved_media_only", "alt_text_required"],
    artifactDestinations: ["content", "runs"],
    failureModes: ["missing_media", "channel_unsupported"],
    escalationOwner: "A16",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A14-creative",
  }),
  contract({
    roleId: "A15",
    name: "Website and CMS Publisher",
    group: AgentRoleGroup.CONTENT,
    mission:
      "Stage and release authorized content bundles to verified source bindings; verify live results.",
    subscribedEvents: ["release_grant", "bundle_approved"],
    assetScope: ["cms_bindings", "owned_sites"],
    inputKinds: ["content_bundle", "capability_grant", "source_binding"],
    outputKinds: ["publish_intent", "verification_request"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.WRITE_PROPOSAL,
      RoleToolClass.TASK_REQUEST,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: [
      "publish_without_grant",
      "self_approve",
      "bypass_gateway",
      "credential_access",
      "unrestricted_shell",
    ],
    policyChecks: ["grant_bound", "read_evidence_required", "gateway_only_effects"],
    artifactDestinations: ["runs", "exports"],
    failureModes: ["binding_unproven", "ambiguous_remote_outcome"],
    escalationOwner: "A25",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A15-publisher",
  }),
  contract({
    roleId: "A16",
    name: "Multi-Channel Distribution",
    group: AgentRoleGroup.CONTENT,
    mission:
      "Publish eligible variants through connected adapters, reconcile ambiguous outcomes and record receipts.",
    subscribedEvents: ["publication_schedule", "variant_ready"],
    assetScope: ["distribution_channels"],
    inputKinds: ["channel_variant", "capability_grant"],
    outputKinds: ["distribution_intent", "receipt_record"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.WRITE_PROPOSAL,
      RoleToolClass.TASK_REQUEST,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: ["bypass_gateway", "self_approve", "credential_access", "duplicate_without_reconcile"],
    policyChecks: ["adapter_ready", "idempotency_key", "reconcile_before_retry"],
    artifactDestinations: ["runs", "exports"],
    failureModes: ["adapter_not_wired", "unknown_remote_outcome"],
    escalationOwner: "A23",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A16-distribution",
  }),
  contract({
    roleId: "A17",
    name: "Local Presence and Google Business Profile",
    group: AgentRoleGroup.CONTENT,
    mission:
      "Maintain legitimate profile data, approved posts, local consistency and location-specific observations.",
    subscribedEvents: ["profile_event", "daily_local_window"],
    assetScope: ["gbp", "local_listings"],
    inputKinds: ["profile_snapshot", "approved_post"],
    outputKinds: ["local_update_proposal"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["fake_engagement", "self_approve", "credential_access", "bypass_gateway"],
    policyChecks: ["legitimate_data_only", "grant_bound"],
    artifactDestinations: ["runs", "research"],
    failureModes: ["access_unverified", "nap_conflict"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A17-local",
  }),
  contract({
    roleId: "A18",
    name: "Reputation and Review Response",
    group: AgentRoleGroup.RESPONSE,
    mission:
      "Monitor authorized review sources, draft/respond within policy and escalate sensitive complaints.",
    subscribedEvents: ["review_event"],
    assetScope: ["review_sources"],
    inputKinds: ["review_item", "response_policy"],
    outputKinds: ["review_response_proposal", "escalation"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.TASK_REQUEST],
    forbiddenEffects: ["sensitive_auto_reply", "self_approve", "credential_access", "bypass_gateway"],
    policyChecks: ["sensitivity_screen", "human_escalation_path"],
    artifactDestinations: ["runs"],
    failureModes: ["sensitive_content", "policy_gap"],
    escalationOwner: "A29",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A18-reputation",
  }),
  contract({
    roleId: "A19",
    name: "Availability and Performance Reliability",
    group: AgentRoleGroup.RELIABILITY,
    mission:
      "Investigate uptime, TLS, latency, rendering and resource incidents raised by deterministic probes.",
    subscribedEvents: ["probe_alert", "latency_breach"],
    assetScope: ["owned_sites", "probes"],
    inputKinds: ["probe_result", "incident"],
    outputKinds: ["reliability_diagnosis", "typed_task_request"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.DETERMINISTIC_PROBE,
      RoleToolClass.TASK_REQUEST,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: ["weaken_slo", "self_approve_repair", "credential_access", "unrestricted_shell"],
    policyChecks: ["probe_evidence_required"],
    artifactDestinations: ["runs", "reports"],
    failureModes: ["transient_noise", "missing_baseline"],
    escalationOwner: "A24",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A19-reliability",
  }),
  contract({
    roleId: "A20",
    name: "Browser Journey and Accessibility QA",
    group: AgentRoleGroup.RELIABILITY,
    mission:
      "Test critical desktop/mobile journeys, links, booking handoffs and accessibility regressions.",
    subscribedEvents: ["release_event", "journey_schedule"],
    assetScope: ["journeys", "owned_sites"],
    inputKinds: ["journey_spec", "browser_result"],
    outputKinds: ["journey_report", "defect_ticket"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.DETERMINISTIC_PROBE,
      RoleToolClass.LOCAL_ARTIFACT,
      RoleToolClass.TASK_REQUEST,
    ],
    forbiddenEffects: ["commercial_write", "credential_access", "unrestricted_shell"],
    policyChecks: ["synthetic_labeled", "a11y_baseline"],
    artifactDestinations: ["runs", "tests"],
    failureModes: ["flaky_browser", "selector_drift"],
    escalationOwner: "A24",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A20-journey",
  }),
  contract({
    roleId: "A21",
    name: "Forms and Lead Capture QA",
    group: AgentRoleGroup.RELIABILITY,
    mission:
      "Verify form validation, backend acceptance, CRM arrival and notifications with controlled synthetic transactions.",
    subscribedEvents: ["scheduled_form_canary", "form_change"],
    assetScope: ["forms", "crm_sandbox"],
    inputKinds: ["form_spec", "synthetic_persona"],
    outputKinds: ["canary_receipt", "defect_ticket"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.DETERMINISTIC_PROBE,
      RoleToolClass.WRITE_PROPOSAL,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: [
      "production_crm_pollution",
      "unlabeled_synthetic",
      "credential_access",
      "bypass_gateway",
    ],
    policyChecks: ["synthetic_labeled", "ownership_proven", "read_evidence_required"],
    artifactDestinations: ["runs", "tests"],
    failureModes: ["crm_delivery_gap", "form_handler_drift"],
    escalationOwner: "A22",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A21-forms",
  }),
  contract({
    roleId: "A22",
    name: "CRM Quality and Workflow QA",
    group: AgentRoleGroup.RELIABILITY,
    mission:
      "Verify Zoho mappings, deduplication, attribution, assignments and lead workflow behavior.",
    subscribedEvents: ["crm_canary", "mapping_change"],
    assetScope: ["crm_ownership", "lead_workflows"],
    inputKinds: ["crm_snapshot", "field_map"],
    outputKinds: ["crm_qa_report", "mapping_defect"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.DETERMINISTIC_PROBE, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["live_crm_mutation_without_grant", "credential_access", "bypass_gateway"],
    policyChecks: ["ownership_proven", "sandbox_preferred"],
    artifactDestinations: ["runs", "tests"],
    failureModes: ["field_mismatch", "dedupe_collision"],
    escalationOwner: "A23",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A22-crm",
  }),
  contract({
    roleId: "A23",
    name: "Integration Reliability",
    group: AgentRoleGroup.RELIABILITY,
    mission:
      "Monitor tokens, webhooks, API versions, synchronization lag, retries, reconciliation and failed deliveries.",
    subscribedEvents: ["token_near_expiry", "delivery_failure", "sync_lag"],
    assetScope: ["integrations", "adapters"],
    inputKinds: ["adapter_health", "delivery_receipt"],
    outputKinds: ["integration_incident", "typed_task_request"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.DETERMINISTIC_PROBE,
      RoleToolClass.TASK_REQUEST,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: ["secret_exfiltration", "credential_access", "widen_oauth_scope", "bypass_gateway"],
    policyChecks: ["broker_only_secrets", "reconcile_before_retry"],
    artifactDestinations: ["runs", "reports"],
    failureModes: ["expired_token", "unknown_remote_outcome"],
    escalationOwner: "A01",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A23-integrations",
  }),
  contract({
    roleId: "A24",
    name: "Repair and Release Engineer",
    group: AgentRoleGroup.RELIABILITY,
    mission:
      "Reproduce defects, create isolated fixes, run tests, stage and release only eligible changes.",
    subscribedEvents: ["verified_incident", "defect_ticket"],
    assetScope: ["worktrees", "owned_repos"],
    inputKinds: ["defect_ticket", "repro_steps"],
    outputKinds: ["fix_proposal", "release_request"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.WRITE_PROPOSAL,
      RoleToolClass.DETERMINISTIC_PROBE,
      RoleToolClass.TASK_REQUEST,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: [
      "self_approve_release",
      "weaken_failing_test",
      "credential_access",
      "unrestricted_shell",
      "bypass_gateway",
    ],
    policyChecks: ["isolated_worktree", "tests_must_pass", "independent_review"],
    artifactDestinations: ["worktrees", "runs"],
    failureModes: ["irreproducible", "test_regression"],
    escalationOwner: "A25",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A24-repair",
    resourceLimits: { maxDeadlineSeconds: 360, maxBudgetMinor: 400 },
  }),
  contract({
    roleId: "A25",
    name: "Independent Quality, Security and Privacy Reviewer",
    group: AgentRoleGroup.COMMAND,
    mission:
      "Reject unsupported facts, unsafe tool use, injection attempts, privacy leaks and releases without evidence.",
    subscribedEvents: ["review_requested", "pre_release"],
    assetScope: ["proposals", "releases"],
    inputKinds: ["effect_proposal", "evidence_pack"],
    outputKinds: ["review_verdict"],
    approvedTools: [
      RoleToolClass.READ_EVIDENCE,
      RoleToolClass.REVIEW_VERDICT,
      RoleToolClass.LOCAL_ARTIFACT,
    ],
    forbiddenEffects: [
      "review_own_authorship",
      "author_and_approve_same_change",
      "credential_access",
      "bypass_gateway",
      "unrestricted_shell",
    ],
    policyChecks: ["author_neq_reviewer", "evidence_complete", "no_injection"],
    artifactDestinations: ["runs", "reports"],
    failureModes: ["incomplete_evidence", "policy_violation"],
    escalationOwner: "owner",
    mayIssueReviewVerdicts: true,
    /** A25 does not self-review; owner escalations handle reviewer disputes. */
    independentReviewerRoleId: "A25",
    evaluationSuiteId: "eval-A25-review",
  }),
  contract({
    roleId: "A26",
    name: "Unified Inbox Triage",
    group: AgentRoleGroup.RESPONSE,
    mission:
      "Classify/deduplicate inbound messages and acquire conversation ownership before a response is prepared.",
    subscribedEvents: ["inbound_message"],
    assetScope: ["inbox", "conversations"],
    inputKinds: ["inbound_message"],
    outputKinds: ["triage_label", "conversation_ownership"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.TASK_REQUEST],
    forbiddenEffects: ["customer_reply_before_ownership", "credential_access", "bypass_gateway"],
    policyChecks: ["dedupe_key", "ownership_before_reply"],
    artifactDestinations: ["runs"],
    failureModes: ["duplicate_thread", "untrusted_upload"],
    escalationOwner: "A29",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A26-triage",
  }),
  contract({
    roleId: "A27",
    name: "After-Hours Concierge",
    group: AgentRoleGroup.RESPONSE,
    mission:
      "Answer allowed questions using current business facts, identify itself appropriately and escalate exceptions.",
    subscribedEvents: ["after_hours_message", "owned_conversation"],
    assetScope: ["conversations", "knowledge"],
    inputKinds: ["conversation", "approved_facts", "allowed_actions"],
    outputKinds: ["reply_proposal", "escalation"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.TASK_REQUEST],
    forbiddenEffects: [
      "invent_price_or_availability",
      "self_approve",
      "credential_access",
      "bypass_gateway",
      "ignore_takeover",
    ],
    policyChecks: ["fact_bound_replies", "identify_as_assistant", "takeover_version"],
    artifactDestinations: ["runs"],
    failureModes: ["unknown_fact", "takeover_collision"],
    escalationOwner: "A29",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A27-concierge",
    resourceLimits: { maxDeadlineSeconds: 90, maxBudgetMinor: 150 },
  }),
  contract({
    roleId: "A28",
    name: "Lead Qualification and Booking Handoff",
    group: AgentRoleGroup.RESPONSE,
    mission:
      "Collect minimum useful details, create/update qualified leads and coordinate verified tour/booking handoffs.",
    subscribedEvents: ["qualification_needed"],
    assetScope: ["leads", "booking"],
    inputKinds: ["conversation", "qualification_schema"],
    outputKinds: ["lead_update_proposal", "booking_handoff_request"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.TASK_REQUEST],
    forbiddenEffects: [
      "booking_without_evidence",
      "self_approve",
      "credential_access",
      "bypass_gateway",
    ],
    policyChecks: ["minimum_fields", "booking_evidence_required"],
    artifactDestinations: ["runs"],
    failureModes: ["incomplete_details", "booking_provider_gap"],
    escalationOwner: "A29",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A28-qualification",
  }),
  contract({
    roleId: "A29",
    name: "Human Handoff and Incident Coordinator",
    group: AgentRoleGroup.RESPONSE,
    mission:
      "Route unresolved conversations and incidents to named people; track acknowledgement and morning follow-up.",
    subscribedEvents: ["escalation", "unresolved_incident"],
    assetScope: ["incidents", "conversations", "humans"],
    inputKinds: ["escalation", "incident"],
    outputKinds: ["handoff_record", "followup_task"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: ["silent_drop", "credential_access", "bypass_gateway"],
    policyChecks: ["named_owner", "ack_tracked"],
    artifactDestinations: ["runs", "reports"],
    failureModes: ["no_oncall", "unacked_handoff"],
    escalationOwner: "owner",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A29-handoff",
  }),
  contract({
    roleId: "A30",
    name: "Revenue Analytics and Experimentation",
    group: AgentRoleGroup.COMMAND,
    mission:
      "Reconcile traffic, leads and bookings, analyze changes and propose measurable optimization experiments.",
    subscribedEvents: ["measurement_window", "experiment_request"],
    assetScope: ["analytics", "experiments"],
    inputKinds: ["metric_window", "lead_funnel", "booking_receipts"],
    outputKinds: ["analytics_report", "experiment_proposal"],
    approvedTools: [RoleToolClass.READ_EVIDENCE, RoleToolClass.WRITE_PROPOSAL, RoleToolClass.LOCAL_ARTIFACT],
    forbiddenEffects: [
      "auto_apply_ad_spend",
      "treat_error_as_zero",
      "credential_access",
      "bypass_gateway",
      "self_approve_spend",
    ],
    policyChecks: ["missingness_honest", "spend_needs_owner_decision", "synthetic_excluded"],
    artifactDestinations: ["reports", "runs"],
    failureModes: ["missing_metric", "attribution_gap"],
    escalationOwner: "owner",
    mayIssueReviewVerdicts: false,
    evaluationSuiteId: "eval-A30-analytics",
  }),
];

const BY_ID: ReadonlyMap<AgentRoleId, AgentRoleContract> = new Map(
  AGENT_ROLE_CONTRACTS.map((c) => [c.roleId, c]),
);

export function isAgentRoleId(value: string): value is AgentRoleId {
  return (AGENT_ROLE_IDS as readonly string[]).includes(value);
}

export function getAgentRoleContract(roleId: AgentRoleId): AgentRoleContract {
  const found = BY_ID.get(roleId);
  if (!found) {
    throw new Error(`Unknown role ${roleId}`);
  }
  return found;
}

export function listAgentRoleContracts(): readonly AgentRoleContract[] {
  return AGENT_ROLE_CONTRACTS;
}

export function assertThirtyRolesRegistered(): void {
  if (AGENT_ROLE_CONTRACTS.length !== 30) {
    throw new Error(`Expected 30 roles, found ${AGENT_ROLE_CONTRACTS.length}`);
  }
  for (let i = 0; i < AGENT_ROLE_IDS.length; i += 1) {
    if (AGENT_ROLE_CONTRACTS[i]?.roleId !== AGENT_ROLE_IDS[i]) {
      throw new Error(
        `Role registry order mismatch at ${i}: expected ${AGENT_ROLE_IDS[i]}`,
      );
    }
  }
  const ids = new Set(AGENT_ROLE_CONTRACTS.map((c) => c.roleId));
  if (ids.size !== 30) {
    throw new Error("Duplicate role IDs in registry");
  }
}

/** Role may not use a tool class outside its approved set. */
export function roleAllowsTool(
  roleId: AgentRoleId,
  tool: RoleToolClassValue,
): boolean {
  return getAgentRoleContract(roleId).approvedTools.includes(tool);
}

export function roleForbidsEffect(roleId: AgentRoleId, effect: string): boolean {
  return getAgentRoleContract(roleId).forbiddenEffects.includes(effect);
}
