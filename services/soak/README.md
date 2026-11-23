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
| T-X019 / T-US-036 approved payload edit | Fixture **ACCEPTED** via `APPROVED_PAYLOAD_EDIT_INVALIDATED` (digest/revision invalidate; not live VERIFIED) |
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
| T-X030 rate-limit with deadline | Fixture **ACCEPTED** via `RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE` (not live VERIFIED) |
