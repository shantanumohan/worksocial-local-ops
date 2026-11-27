# `@worksocial/soak` — M9 / NEXT-20

Fixture soak / recovery harness and acceptance evidence compiler.

| Concern | Status |
|---------|--------|
| Crash-restart / no duplicate effects | **real** (file-durable LOCAL_DURABLE) |
| Acceptance evidence compiler | **real** (fixture ACCEPTED for T-X004 / T-X001 / T-X009 / T-X008 / T-X011 / T-X014 / T-X015 / T-X017 / T-X020 / T-X024 / T-X027 / T-US-048 / T-X029 / T-US-057 / T-US-024 / T-US-042 / T-X057 / T-US-044 / T-X053 / T-US-008 / T-US-010 / T-US-018 / T-US-040 / T-US-046 / T-US-058 / T-X003 / T-X031 / T-X032 / T-X033 / T-X037 / T-X038 / T-X039 / T-X048 / T-X049 / T-X010 / T-X012 / T-X050 / T-X058 / T-X069 / T-X066 / T-F24 / T-US-047 / T-US-002 / T-X002 / T-X018 / T-US-054 / T-X073 / T-US-060 / T-X005 / T-X006 / T-X019 / T-US-036 with complete proof sets) |
| T-X066 backup/omit-receipt | Fixture **ACCEPTED** via `BACKUP_OMIT_RECEIPT` (not retry-only no-dup; not live VERIFIED) |
| T-X070 validated payload not collected | Fixture **ACCEPTED** via `VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES` (not live VERIFIED) |
| T-F24 / T-US-047 recover/rotate/reconcile | Fixture **ACCEPTED** via `RECOVER_ROTATE_RECONCILE` (complete F24 evidence; live revoke NOT_WIRED; not live VERIFIED) |
| T-US-002 / T-X002 competing-supervisor lease | Fixture **ACCEPTED** via `COMPETING_SUPERVISOR_LEASE` (singleton host lease; not live VERIFIED) |
| T-X018 / T-US-054 self-approval rejected | Fixture **ACCEPTED** via `SELF_APPROVAL_REJECTED` (independent A25; not live VERIFIED) |
| T-X073 offboard ACTIVE_TOKEN residual | Fixture **ACCEPTED** via `OFFBOARD_ACTIVE_TOKEN_RESIDUAL` (incomplete until live revoke; not live VERIFIED) |
| T-US-060 emergency stop at commit | Fixture **ACCEPTED** via `EMERGENCY_STOP_AT_COMMIT` (outbound stop at commit; not live VERIFIED) |
| T-X005 forged browser role ignored | Fixture **ACCEPTED** via `FORGED_BROWSER_ROLE_IGNORED` (payload role ignored; not live VERIFIED) |
| T-X006 cross-workspace reference denied | Fixture **ACCEPTED** via `CROSS_WORKSPACE_REFERENCE_DENIED` (deny without leak; not live VERIFIED) |
| T-X019 / T-US-036 approved payload edit | Fixture **ACCEPTED** via `APPROVED_PAYLOAD_EDIT_INVALIDATED` (checksum/revision/evidence/artifact; live NOT_WIRED; not live VERIFIED) |
| T-X029 explicit account rebind | Fixture **ACCEPTED** via `EXPLICIT_ACCOUNT_REBIND` (not same-account rotate; not live VERIFIED) |
| T-US-057 cross-workspace resource substitution | Fixture **ACCEPTED** via `CROSS_WORKSPACE_RESOURCE_SUBSTITUTION` (not live VERIFIED) |
| T-US-024 agent cannot widen grant | Fixture **ACCEPTED** via `AGENT_CANNOT_WIDEN_GRANT` (not live VERIFIED) |
| T-US-042 / T-X057 repair weaken test | Fixture **ACCEPTED** via `REPAIR_WEAKEN_TEST_REJECTED` (not live VERIFIED) |
| T-US-044 / T-X053 takeover cancel unsent | Fixture **ACCEPTED** via `TAKEOVER_CANCELS_UNSENT_REPLIES` (not live VERIFIED) |
| T-US-018 / T-X037 EVAL_ONLY operational tools | Fixture **ACCEPTED** via `EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN` (not live VERIFIED) |
| T-X058 third repair attempt escalate | Fixture **ACCEPTED** via `REPAIR_ATTEMPT_LIMIT_ESCALATED` (not live VERIFIED) |
| T-X069 imported doc quarantined | Fixture **ACCEPTED** via `IMPORTED_DOC_QUARANTINED_AS_DATA` (not live VERIFIED) |
| T-X038 eval no-grounding | Fixture **ACCEPTED** via `EVAL_NO_GROUNDING_FAIL_CLOSED` (not live VERIFIED) |
| T-X039 / T-US-058 metric denominators | Fixture **ACCEPTED** via `METRIC_DENOMINATORS_HONEST` (not live VERIFIED) |
| T-US-046 / T-X048 hard search constraints | Fixture **ACCEPTED** via `HARD_SEARCH_CONSTRAINTS_NO_INVENTION` (not live VERIFIED) |
| T-US-010 / T-X033 GSC omitted rows | Fixture **ACCEPTED** via `GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO` (not live VERIFIED) |
| T-US-008 / T-X032 GA4 debug not delivered | Fixture **ACCEPTED** via `GA4_DEBUG_NOT_DELIVERED_CONVERSION` (not live VERIFIED) |
| T-X031 wrong GA4 property kind | Fixture **ACCEPTED** via `GA4_WRONG_PROPERTY_KIND_REFUSED` (not live VERIFIED) |
| T-US-040 / T-X049 thank-you without CRM | Fixture **ACCEPTED** via `THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY` (not live VERIFIED) |
| T-X017 stop after provider dispatch | Fixture **ACCEPTED** via `STOP_AFTER_DISPATCH_RECONCILE` (reconcile; no fake cancel; not live VERIFIED) |
| T-X024 old fence after reassignment | Fixture **ACCEPTED** via `OLD_FENCE_AFTER_REASSIGNMENT` (not live VERIFIED) |
| T-X011 output bomb | Fixture **ACCEPTED** via `OUTPUT_BOMB_BOUNDED_QUARANTINED` (oversized stdout quarantined; not live VERIFIED) |
| T-X003 symlink escape after root verification | Fixture **ACCEPTED** via `SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION` (write denied outside root; not live VERIFIED) |
| 72h pilot gate | server-recorded start/heartbeat/end only — short CI soaks stay **NOT_MET**; client claim dates rejected |
| T-X063 indirect prompt-injection exfil | Fixture **ACCEPTED** via `INDIRECT_PROMPT_INJECTION_EXFIL_DENIED` (not live VERIFIED) |
| Live CMS / GSC / GA4 / Zoho / Temporal | **NOT_WIRED** |
| ChatGPT Ads | **access-blocked** |
| R1-complete | **not claimed** |
| External effects | **none** |

| T-X044 unlicensed venue media | Fixture **ACCEPTED** via `UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED` (not live VERIFIED) |

| T-X023 eventual consistency false not-found | Fixture **ACCEPTED** via `EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND` (lagging CRM read; no unsafe create; not live VERIFIED) |
| T-US-006 unbound write path fail closed | Fixture **ACCEPTED** via `UNBOUND_WRITE_PATH_FAIL_CLOSED` (applyAttemptCount=0; not live VERIFIED) |
| T-US-052 mocked connector not production-ready | Fixture **ACCEPTED** via `MOCKED_CONNECTOR_NOT_PRODUCTION_READY` (not live VERIFIED) |
| T-X040 low-sample trend spike | Fixture **ACCEPTED** via `LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE` (not live VERIFIED) |
| T-US-012 Google Ads test vs production | Fixture **ACCEPTED** via `GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED` (not live VERIFIED) |
| T-US-015 Connect Claude Code + test API | Fixture **ACCEPTED** via `CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY` (not live VERIFIED) |
| T-US-016 Claude runtime vs API eval auth | Fixture **ACCEPTED** via `CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED` (not live VERIFIED) |
| T-US-017 Connect Gemini evaluation | Fixture **ACCEPTED** via `CONNECT_GEMINI_EVALUATION_EVAL_ONLY` (not live VERIFIED) |
| T-US-019 Map CRM/forms/booking | Fixture **ACCEPTED** via `MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY` (not live VERIFIED) |
| T-US-020 Synthetic leads classified | Fixture **ACCEPTED** via `SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION` (not live VERIFIED) |
| T-US-021 Connect local/social/inbox | Fixture **ACCEPTED** via `CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT` (not live VERIFIED) |
| T-US-022 Unsupported destination capabilities | Fixture **ACCEPTED** via `UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED` (not live VERIFIED) |
| T-US-023 Grant standing autonomy control receipts | Fixture **ACCEPTED** via `STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS` (not live VERIFIED) |
| T-US-025 Launch workstream schedule mission outcome | Fixture **ACCEPTED** via `LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME` (not live VERIFIED) |
| T-US-026 Missed schedules coalesce; no burst republish | Fixture **ACCEPTED** via `MISSED_SCHEDULE_COALESCE_NO_BURST` (not live VERIFIED) |
| T-US-027 Demand → page improvement — release receipt | Fixture **ACCEPTED** via `DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT` (not live VERIFIED) |
| T-US-028 Prefer one useful page update over keyword proliferation | Fixture **ACCEPTED** via `KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE` (not live VERIFIED) |
| T-US-029 Original campaign distribution — campaign manifest | Fixture **ACCEPTED** via `CAMPAIGN_MANIFEST_DISTRIBUTION` (not live VERIFIED) |
| T-US-030 Uncertain post: reconcile before retry | Fixture **ACCEPTED** via `UNCERTAIN_POST_RECONCILE_BEFORE_RETRY` (not live VERIFIED) |
| T-US-031 Paid-media recommendations — verified mutation or failure | Fixture **ACCEPTED** via `PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE` (not live VERIFIED) |
| T-US-033 Claude/Gemini eval suites — adjudication + backlog | Fixture **ACCEPTED** via `EVAL_SUITE_ADJUDICATION_BACKLOG` (not live VERIFIED) |
| T-US-034 Provider error ≠ bad answer or pass | Fixture **ACCEPTED** via `PROVIDER_ERROR_NOT_PASS` (not live VERIFIED) |
| T-US-035 Review/revise/release — release receipt or blocked exception | Fixture **ACCEPTED** via `REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED` (not live VERIFIED) |
| T-US-049 Daily owner review — reviewed operating knowledge | Fixture **ACCEPTED** via `DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE` (not live VERIFIED) |
| T-US-050 Owner brief groups root cause; actionable | Fixture **ACCEPTED** via `OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE` (not live VERIFIED) |
| T-US-051 Design/release readiness — release acceptance packet | Fixture **ACCEPTED** via `DESIGN_RELEASE_READINESS_PACKET` (not live VERIFIED) |
| T-US-053 Secrets never in browser assets | Fixture **ACCEPTED** via `SECRETS_NEVER_IN_BROWSER_ASSETS` (not live VERIFIED) |
| T-US-055 Complete keyboard journey with reduced motion | Fixture **ACCEPTED** via `KEYBOARD_JOURNEY_REDUCED_MOTION` (not live VERIFIED) |
| T-US-059 Shared briefs redacted; private evidence retained | Fixture **ACCEPTED** via `SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED` (not live VERIFIED) |
| T-US-003 business truth folders | Fixture **ACCEPTED** via `BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED` (not live VERIFIED) |
| T-F01 Create a trusted local workspace | Fixture **ACCEPTED** via `CREATE_TRUSTED_LOCAL_WORKSPACE` (complete F01 evidence; not live VERIFIED) |
| T-F02 Choose folders and establish business truth | Fixture **ACCEPTED** via `CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH` (complete F02 evidence; not live VERIFIED) |
| T-F03 Map sites, pages and editable sources | Fixture **ACCEPTED** via `MAP_SITES_PAGES_EDITABLE_SOURCES` (complete F03 evidence; not live VERIFIED) |
| T-F04 Connect Google Analytics 4 | Fixture **ACCEPTED** via `CONNECT_GOOGLE_ANALYTICS_4` (complete F04 evidence; not live VERIFIED) |
| T-F05 Connect Search Console and organic visibility | Fixture **ACCEPTED** via `CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY` (complete F05 evidence; not live VERIFIED) |
| T-F06 Connect Google Ads for controlled analysis | Fixture **ACCEPTED** via `CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS` (complete F06 evidence; not live VERIFIED) |
| T-F08 Connect Claude Code and the Claude test API | Fixture **ACCEPTED** via `CONNECT_CLAUDE_CODE_AND_TEST_API` (complete F08 evidence; not live VERIFIED) |
| T-F09 Connect Gemini for independent testing | Fixture **ACCEPTED** via `CONNECT_GEMINI_INDEPENDENT_TESTING` (complete F09 evidence; not live VERIFIED) |
| T-F10 Map CRM, forms and booking truth | Fixture **ACCEPTED** via `MAP_CRM_FORMS_BOOKING_TRUTH` (complete F10 evidence; not live VERIFIED) |
| T-F11 Connect local, social and inbox channels | Fixture **ACCEPTED** via `CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS` (complete F11 evidence; not live VERIFIED) |
| T-F12 Grant standing autonomy safely | Fixture **ACCEPTED** via `GRANT_STANDING_AUTONOMY_SAFELY` (complete F12 evidence; not live VERIFIED) |
| T-F13 Launch a workstream and recurring schedule | Fixture **ACCEPTED** via `LAUNCH_WORKSTREAM_RECURRING_SCHEDULE` (complete F13 evidence; not live VERIFIED) |
| T-F14 Turn demand into a page improvement | Fixture **ACCEPTED** via `TURN_DEMAND_INTO_PAGE_IMPROVEMENT` (complete F14 evidence; not live VERIFIED) |
| T-F15 Create and distribute an original campaign | Fixture **ACCEPTED** via `CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN` (complete F15 evidence; not live VERIFIED) |
| T-F16 Review Google and ChatGPT paid-media recommendations | Fixture **ACCEPTED** via `REVIEW_PAID_MEDIA_RECOMMENDATIONS` (complete F16 evidence; ChatGPT Ads ACCESS_BLOCKED; not live VERIFIED) |
| T-F18 Review, revise and release a change | Fixture **ACCEPTED** via `REVIEW_REVISE_AND_RELEASE_A_CHANGE` (complete F18 evidence; not live VERIFIED) |
| T-F21 Diagnose and repair a permitted defect | Fixture **ACCEPTED** via `DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT` (complete F21 evidence; not live VERIFIED) |
| T-F26 Calibrate the design and release readiness | Fixture **ACCEPTED** via `CALIBRATE_DESIGN_RELEASE_READINESS` (complete F26 evidence; not live VERIFIED) |
| T-F20 Verify a form-to-CRM journey continuously | Fixture **ACCEPTED** via `VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY` (complete F20 evidence; not live VERIFIED) |
| T-F22 Handle after-hours messages and take over | Fixture **ACCEPTED** via `HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER` (complete F22 evidence; not live VERIFIED) |
| T-F25 Operate the daily owner review | Fixture **ACCEPTED** via `OPERATE_DAILY_OWNER_REVIEW` (complete evidence; not live VERIFIED) |
| T-US-001 trusted workspace readiness | Fixture **ACCEPTED** via `TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS` (not live VERIFIED) |
| T-US-041 diagnose/repair defect | Fixture **ACCEPTED** via `DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF` (not live VERIFIED) |
| T-US-011 Google Ads analyze-only | Fixture **ACCEPTED** via `CONNECT_GOOGLE_ADS_ANALYZE_ONLY` (not live VERIFIED) |
| T-US-007 Connect GA4 ready-read/next sync | Fixture **ACCEPTED** via `CONNECT_GA4_READ_READY_NEXT_SYNC` (not live VERIFIED; distinct from T-F04) |
| T-F17 Run Claude and Gemini evaluation suites | Fixture **ACCEPTED** via `RUN_CLAUDE_GEMINI_EVALUATION_SUITES` (complete evidence; not live VERIFIED) |
| T-F23 Test semantic search and improve no-result cases | Fixture **ACCEPTED** via `TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT` (complete evidence; not live VERIFIED) |
| T-F19 Analyze performance and test a hypothesis | Fixture **ACCEPTED** via `ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS` (complete F19 evidence; not live VERIFIED) |
| T-X030 rate-limit with deadline | Fixture **ACCEPTED** via `RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE` (not live VERIFIED) |
| T-US-056 honest outage hosted contact | Fixture **ACCEPTED** via `HONEST_OUTAGE_HOSTED_CONTACT_PATH` (not live VERIFIED) |
| T-US-005 site/page/editable sources baseline | Fixture **ACCEPTED** via `SITE_PAGE_EDITABLE_SOURCES_BASELINE` (baseline ID happy-path; distinct from T-F03; not live VERIFIED) |
| T-US-045 semantic search / no-result | Fixture **ACCEPTED** via `SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON` (not live VERIFIED) |

| T-X047 layout-specific capacity mismatch | Fixture **ACCEPTED** via `LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS` (not live VERIFIED) |
| T-X051 wrong Zoho organization | Fixture **ACCEPTED** via `WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH` (not live VERIFIED) |
