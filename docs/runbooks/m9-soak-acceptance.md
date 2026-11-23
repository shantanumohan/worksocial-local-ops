# M9 / NEXT-20 — soak / acceptance evidence

## What this proves

Fixture (LOCAL_DURABLE) proofs:

1. Crash-restart rehydrates `ACCEPTED_PENDING` and verifies without a second apply
2. Idempotent retry does not create duplicate provider effects
3. Job rows survive process restart via durable idempotency keys
4. Unknown-remote reconcile reads the provider ledger before verify
5. Backup that omits the remote receipt → restore → reconcile from remote SoR → no duplicate apply (**T-X066**)
6. Recover → capability stop → rotate (no secrets) → reconcile → offboard (**T-F24** / **T-US-047**)
7. Competing supervisors / singleton host lease — second live generation refused; dead-holder reclaim; ownership fail-closed (**T-US-002** / **T-X002**)
8. Self-approval rejected; independent A25 required (**T-X018** / **T-US-054**)
9. Offboard ACTIVE_TOKEN residual — incomplete until live revoke (**T-X073**)
10. Emergency stop / outbound stop checked at commit (**T-US-060**)
11. Forged browser role ignored (**T-X005**)
12. Cross-workspace object reference denied (**T-X006**)
13. Approved payload edit invalidated (**T-X019** / **T-US-036**)
14. Different-account token → explicit rebind (**T-X029**)

Acceptance evidence compiler marks selected catalog cases **ACCEPTED** only when the **complete expected proof set** passes with **no failed related proofs**, and only with redacted fixture artifacts. It never silently marks live **VERIFIED**.

Honest fixture ACCEPTED cases: **T-X001**, **T-X014**, **T-X020**, **T-US-048**, **T-X066**, **T-F24**, **T-US-047**, **T-US-002**, **T-X002**, **T-X018**, **T-US-054**, **T-X073**, **T-US-060**, **T-X005**, **T-X006**, **T-X019**, **T-US-036**, **T-X029**, **T-US-057**, **T-US-024**, **T-US-042**, **T-X057**, **T-US-044**, **T-X053**, **T-US-018**, **T-US-019**, **T-US-020**, **T-US-021**, **T-US-022**, **T-US-023**, **T-US-025**, **T-US-026**, **T-US-027**, **T-US-028**, **T-US-029**, **T-US-030**, **T-US-031**, **T-US-033**, **T-X037**, **T-X058**, **T-X069**, **T-X038**, **T-X039**, **T-US-058**, **T-US-046**, **T-X048**, **T-US-010**, **T-US-012**, **T-US-015**, **T-US-017**, **T-X033**, **T-US-008**, **T-X032**, **T-X031**, **T-US-040**, **T-X049**, **T-X017**, **T-X024**, **T-X011**, **T-X003**, **T-X050**, **T-X010**, **T-X009**, **T-X007**, **T-X016**, **T-X022**, **T-X065**, **T-X004**, **T-X013**, **T-X027**, **T-X028**, **T-X030**, **T-X063**, **T-X043**, **T-X026**, **T-X052**, **T-X054**, **T-X055**, **T-X056**, **T-X059**, **T-US-038**, **T-X060**, **T-X045**, **T-X070**.

**T-X001** maps only to `HOST_SLEEP_MONITORING_COVERAGE_GAP`.

**T-X016** maps only to `STOP_BEFORE_DISPATCH_NO_MUTATION`.

**T-X022** maps only to `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.

**T-X063** maps only to `INDIRECT_PROMPT_INJECTION_EXFIL_DENIED`.

**T-X015** maps only to `DST_RECURRING_SCHEDULE_NO_DUPLICATES`.

**T-X066** maps only to `BACKUP_OMIT_RECEIPT`. Retry-only `NO_DUPLICATE_EFFECTS` does not satisfy T-X066.

**T-F24 / T-US-047** map only to `RECOVER_ROTATE_RECONCILE` (complete F24 evidence set). Live provider revoke remains **NOT_WIRED**.

**T-US-002 / T-X002** map only to `COMPETING_SUPERVISOR_LEASE`.

**T-X018 / T-US-054** map only to `SELF_APPROVAL_REJECTED`.

**T-X073** maps only to `OFFBOARD_ACTIVE_TOKEN_RESIDUAL` (incomplete until live revoke; not a live revoke success claim).

**T-US-060** maps only to `EMERGENCY_STOP_AT_COMMIT`.

**T-X005** maps only to `FORGED_BROWSER_ROLE_IGNORED`.

**T-X006** maps only to `CROSS_WORKSPACE_REFERENCE_DENIED`.

**T-X019 / T-US-036** map only to `APPROVED_PAYLOAD_EDIT_INVALIDATED`.

## Commands

```bash
pnpm recovery:rehearse          # soak proofs (must pass)
pnpm release:evidence           # writes tests/acceptance-evidence/fixture/*
pnpm test:acceptance-matrix     # ACCEPTED rows require on-disk evidence
pnpm test:soak                  # unit/contract soak package
```

## 72h pilot gate (owner host)

Short CI soaks leave `pilotGate=NOT_MET`. A real R1 pilot gate requires a continuous ≥72h window with server-recorded start / heartbeat / end observations and the four core recovery proofs still passing (crash-restart, no-dup, job continuity, unknown-remote reconcile). The backup/omit-receipt proof feeds T-X066 fixture ACCEPTED; it is not a substitute for the 72h pilot window.

**Client-supplied `startedAtIso` / `endedAtIso` claim dates are rejected.** Duration is derived only from server-recorded observations.

Suggested owner Windows flow (state off OneDrive):

1. Set `WORKSOCIAL_STATE_DIR` to a local non-synced disk path.
2. Start the stack (`pnpm local:start`) and leave the host available for 72h.
3. At start: `POST /soak/pilot/start` (server clock).
4. Periodically (≤6h gap): `POST /soak/pilot/heartbeat`.
5. Run proofs during the window: `pnpm recovery:rehearse` or `POST /soak/run` (empty body — no claim dates).
6. Review `/soak` console report — `pilotGate` must be `MET` only when server-observed duration, continuity, and proofs qualify.
7. Live CMS / GSC / GA4 / Zoho / Temporal remain **NOT_WIRED** until separately connected. Do not claim R1-complete from fixture evidence alone.

## Honesty

| Label | Meaning |
|-------|---------|
| fixture ACCEPTED | Offline evidence artifact exists with complete proof set |
| sandbox | Distinct; not claimed by this harness |
| authorized production | Distinct; not claimed by this harness |
| VERIFIED (live) | Forbidden without explicit authorized-production evidence package |
| ChatGPT Ads | Access-blocked without transport + entitlement |
| T-X001 | Fixture ACCEPTED via host-sleep monitoring coverage-gap coalesce only |
| T-X016 | Fixture ACCEPTED via stop before dispatch / no adapter mutation only |
| T-X063 | Fixture ACCEPTED via indirect prompt-injection exfil denied only |
| T-X066 | Fixture ACCEPTED via backup/omit-receipt proof only |
| T-F24 / T-US-047 | Fixture ACCEPTED via recover/rotate/reconcile proof only |
| T-US-002 / T-X002 | Fixture ACCEPTED via competing-supervisor / host-lease proof only |
| T-X018 / T-US-054 | Fixture ACCEPTED via self-approval rejected / independent A25 proof only |
| T-X073 | Fixture ACCEPTED via offboard ACTIVE_TOKEN residual only (live revoke NOT_WIRED) |
| T-US-060 | Fixture ACCEPTED via emergency stop at commit only |
| T-X069 | Fixture ACCEPTED via imported doc quarantined as data only |
| T-X038 | Fixture ACCEPTED via eval no-grounding fail closed only |
| T-X039 / T-US-058 | Fixture ACCEPTED via metric denominators honest only |
| T-US-046 / T-X048 | Fixture ACCEPTED via hard search constraints no invention only |
| T-US-010 / T-X033 | Fixture ACCEPTED via GSC omitted rows unknown not zero only |
| T-US-008 / T-X032 | Fixture ACCEPTED via GA4 debug not delivered conversion only |
| T-X031 | Fixture ACCEPTED via GA4 wrong property kind refused only |
| T-US-040 / T-X049 | Fixture ACCEPTED via thank-you without CRM fails delivery only |
| T-X017 | Fixture ACCEPTED via stop-after-dispatch reconcile / no fake cancel only |
| T-X024 | Fixture ACCEPTED via old fence after reassignment only |
| T-X011 | Fixture ACCEPTED via output bomb bounded/quarantined only |
| T-X003 | Fixture ACCEPTED via symlink escape after root verification only |
| T-X010 | Fixture ACCEPTED via malicious prompt no shell injection only |
| T-X009 | Fixture ACCEPTED via CLI error despite exit 0 / job fails only |
| T-X050 | Fixture ACCEPTED via public synthetic flag requires server grant; **T-X010** via malicious prompt no shell injection only |


**T-US-057** maps only to `CROSS_WORKSPACE_RESOURCE_SUBSTITUTION`.

**T-US-024** maps only to `AGENT_CANNOT_WIDEN_GRANT`.

**T-US-042** / **T-X057** map only to `REPAIR_WEAKEN_TEST_REJECTED`.

**T-US-044** / **T-X053** map only to `TAKEOVER_CANCELS_UNSENT_REPLIES`.

**T-US-018** / **T-X037** map only to `EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN`.

**T-X058** maps only to `REPAIR_ATTEMPT_LIMIT_ESCALATED`.

**T-X069** maps only to `IMPORTED_DOC_QUARANTINED_AS_DATA`.

**T-X038** maps only to `EVAL_NO_GROUNDING_FAIL_CLOSED`.

**T-X039** / **T-US-058** map only to `METRIC_DENOMINATORS_HONEST`.

**T-US-046** / **T-X048** map only to `HARD_SEARCH_CONSTRAINTS_NO_INVENTION`.

**T-US-010** / **T-X033** map only to `GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO`.

**T-US-008** / **T-X032** map only to `GA4_DEBUG_NOT_DELIVERED_CONVERSION`.

**T-X031** maps only to `GA4_WRONG_PROPERTY_KIND_REFUSED`.

**T-US-040** / **T-X049** map only to `THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY`.

**T-X017** maps only to `STOP_AFTER_DISPATCH_RECONCILE`.

**T-X024** maps only to `OLD_FENCE_AFTER_REASSIGNMENT`.

**T-X011** maps only to `OUTPUT_BOMB_BOUNDED_QUARANTINED`.

**T-X003** maps only to `SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION`.

**T-X010** maps only to `MALICIOUS_PROMPT_NO_SHELL_INJECTION`.

**T-X009** maps only to `CLI_ERROR_DESPITE_EXIT_ZERO`.

**T-X050** maps only to `PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT`.


**T-X021** maps only to `CONCURRENT_IDEMPOTENT_RELEASE` (not retry-only `NO_DUPLICATE_EFFECTS`).

**T-X008** maps only to `FACT_CHANGES_AFTER_REVIEW_STALE`.

**T-X007** maps only to `WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP`.

**T-X065** maps only to `WORKER_BROWSER_AUTH_STATE_OS_DENIED` (worker OS deny for browser auth state; not live VERIFIED).

**T-X004** maps only to `DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED`.

**T-X043** maps only to `OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS` (SEO/content optimization that breaks CTA → journey regression fails / release blocked; not live VERIFIED).

**T-X054** maps only to `REPLY_SENT_CRM_RECONCILES_NO_RESEND` (reply SENT + CRM fail → CRM reconcile; no outbound resend; not live VERIFIED).

**T-X055** maps only to `UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE`.

**T-X056** maps only to `AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF` (agent message cap → MESSAGE_LIMIT handoff; not live VERIFIED).

**T-X059** maps only to `DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING`.

**T-X070** maps only to `VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES` (VALIDATION_FAILED ≠ COLLECTION_FAILED; not live VERIFIED).

**T-X060** maps only to `CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM` (heterogeneous currency/timezone series refuse silent sum; not live VERIFIED).

**T-X028** maps only to `ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE`.

| T-X044 | Fixture ACCEPTED via unlicensed venue media publish blocked only |

**T-X045** maps only to `PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE` (per-destination PARTIAL honesty; not live VERIFIED).


**T-US-052** maps only to `MOCKED_CONNECTOR_NOT_PRODUCTION_READY` (mocked FIXTURE/NOT_WIRED ≠ production-ready; not live VERIFIED).

**T-US-006** maps only to `UNBOUND_WRITE_PATH_FAIL_CLOSED` (observe/create ok; unbound write fail closed; applyAttemptCount=0; not live VERIFIED).

**T-X023**, **T-US-052** maps only to `EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND`.

**T-X030** maps only to `RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE` (bounded backoff preserves deadline; not live VERIFIED).

**T-X040** maps only to `LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE` (research-only; never a publish trigger; not live VERIFIED).

**T-US-012** maps only to `GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED` (Google Ads TEST vs PRODUCTION credential/customer separation; LIVE NOT_WIRED; not live VERIFIED).

**T-US-015** maps only to `CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY` (Claude Code runtime + test API EVAL_ONLY connect; readiness separated; live NOT_WIRED; not live VERIFIED).

**T-US-017** maps only to `CONNECT_GEMINI_EVALUATION_EVAL_ONLY` (Gemini Evaluation EVAL_ONLY connect; data-use decision, broker credential, model snapshot, test mode; live NOT_WIRED; cannot publish/respond; not live VERIFIED).

**T-US-019** maps only to `MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY` (CRM/forms/booking map with passing failure→recovery; environment binding, form→CRM contract, canary grant/retention, booking capability matrix, correlated journey; live Zoho NOT_WIRED; commercialExcluded; not live VERIFIED).

**T-US-020** maps only to `SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION` (synthetic/canary classification; commerce pollution refused; live Zoho NOT_WIRED; distinct from T-X052/T-X050; not live VERIFIED).
**T-US-021** maps only to `CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT` (local/social/inbox connect; account/asset IDs; auth; per-action capability matrix; destination contract; support policy; authorized test artifact; live provider NOT_WIRED; distinct from T-US-022/T-X045; not live VERIFIED).
**T-US-022** maps only to `UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED` (unsupported destination capabilities refused; false success claims refused; live provider NOT_WIRED; distinct from T-US-021/T-X045/T-X046; not live VERIFIED).
**T-US-023** maps only to `STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS` (owner-signed standing autonomy; policy test matrix; pause/stop-writes/pause-replies receipts; live NOT_WIRED; distinct from T-US-024/T-US-060; not live VERIFIED).
**T-US-025** maps only to `LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME` (workstream launch + recurring schedule + mission outcome; readiness/dry-run/launch receipt; live NOT_WIRED; distinct from T-US-026/T-X015; not live VERIFIED).
**T-US-026** maps only to `MISSED_SCHEDULE_COALESCE_NO_BURST` (missed content/social schedule slots coalesce; burst republish refused; live NOT_WIRED; distinct from T-X001/T-X015/T-US-025; not live VERIFIED).
**T-US-027** maps only to `DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT` (demand→page improvement; release receipt + experiment window; keyword proliferation refused; live NOT_WIRED; distinct from T-US-025/T-US-026/T-US-028; not live VERIFIED).
**T-US-028** maps only to `KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE` (prefer one useful page update; keyword proliferation refused with preserved inputs + recovery path; live NOT_WIRED; distinct from T-US-027; not live VERIFIED).
**T-US-029** maps only to `CAMPAIGN_MANIFEST_DISTRIBUTION` (original campaign distribution campaign manifest; eligible receipts + blocked recovery; live NOT_WIRED; distinct from T-X045/T-US-022/T-US-030; not live VERIFIED).

**T-US-030** maps only to `UNCERTAIN_POST_RECONCILE_BEFORE_RETRY` (uncertain post reconcile before retry; blind retry refused; present→no retry / absent→linked retry; live NOT_WIRED; distinct from T-US-048/T-X020/T-X017/T-US-029/T-X045; not live VERIFIED)
**T-US-031** maps only to `PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE` (paid-media recommendation decision + honest execute failure; ChatGPT Ads ACCESS_BLOCKED; live NOT_WIRED; distinct from T-US-011/T-US-012/T-US-032/T-X034–T-X036; not live VERIFIED).
**T-US-033** maps only to `EVAL_SUITE_ADJUDICATION_BACKLOG` (Claude/Gemini eval suite adjudication + linked backlog; no production writes; live NOT_WIRED; distinct from T-US-015/T-US-017/T-US-018/T-X037/T-X038; not live VERIFIED).
.