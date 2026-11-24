# M9 / NEXT-20 — soak / acceptance evidence

## What this proves

Fixture (LOCAL_DURABLE) proofs:

1. Crash-restart rehydrates `ACCEPTED_PENDING` and verifies without a second apply
2. Idempotent retry does not create duplicate provider effects
3. Job rows survive process restart via durable idempotency keys
4. Unknown-remote reconcile reads the provider ledger before verify
5. Backup that omits the remote receipt → restore → reconcile from remote SoR → no duplicate apply (**T-X066**)
6. Recover → capability stop → rotate (no secrets) → reconcile → offboard (**T-F24** / **T-US-047**)
7. Competing supervisors / singleton host lease — second live generation refused; dead-holder reclaim; ownership fail-closed (**T-US-001**, **T-US-002** / **T-X002**)
8. Self-approval rejected; independent A25 required (**T-X018** / **T-US-054**)
9. Offboard ACTIVE_TOKEN residual — incomplete until live revoke (**T-X073**)
10. Emergency stop / outbound stop checked at commit (**T-US-060**)
11. Forged browser role ignored (**T-X005**)
12. Cross-workspace object reference denied (**T-X006**)
13. Approved payload edit invalidated (**T-X019** / **T-US-036**)
14. Different-account token → explicit rebind (**T-X029**)

Acceptance evidence compiler marks selected catalog cases **ACCEPTED** only when the **complete expected proof set** passes with **no failed related proofs**, and only with redacted fixture artifacts. It never silently marks live **VERIFIED**.

Honest fixture ACCEPTED cases: **T-X001**, **T-X014**, **T-X020**, **T-US-048**, **T-X066**, **T-F01**, **T-F02**, **T-F03**, **T-F04**, **T-F05**, **T-F06**, **T-F08**, **T-F09**, **T-F10**, **T-F11**, **T-F12**, **T-F13**, **T-F14**, **T-F15**, **T-F16**, **T-F18**, **T-F19**, **T-F20**, **T-F22**, **T-F23**, **T-F24**, **T-F26**, **T-US-047**, **T-US-002**, **T-X002**, **T-X018**, **T-US-054**, **T-X073**, **T-US-060**, **T-X005**, **T-X006**, **T-X019**, **T-US-036**, **T-X029**, **T-US-057**, **T-US-024**, **T-US-042**, **T-X057**, **T-US-044**, **T-X053**, **T-US-018**, **T-US-019**, **T-US-020**, **T-US-021**, **T-US-022**, **T-US-023**, **T-US-025**, **T-US-026**, **T-US-027**, **T-US-028**, **T-US-029**, **T-US-030**, **T-US-031**, **T-US-033**, **T-US-034**, **T-US-035**, **T-US-049**, **T-US-050**, **T-US-051**, **T-US-053**, **T-US-055**, **T-US-059**, **T-X037**, **T-X058**, **T-X069**, **T-X038**, **T-X039**, **T-US-058**, **T-US-046**, **T-X048**, **T-US-010**, **T-US-012**, **T-US-015**, **T-US-017**, **T-X033**, **T-US-008**, **T-X032**, **T-X031**, **T-US-040**, **T-US-041**, **T-X049**, **T-X017**, **T-X024**, **T-X011**, **T-X003**, **T-X050**, **T-X010**, **T-X009**, **T-X007**, **T-X016**, **T-X022**, **T-X065**, **T-X004**, **T-X013**, **T-X027**, **T-X028**, **T-X030**, **T-X063**, **T-X043**, **T-X026**, **T-X052**, **T-X054**, **T-X055**, **T-X056**, **T-X059**, **T-US-038**, **T-X060**, **T-X045**, **T-X070**.
Honest fixture ACCEPTED cases: **T-X001**, **T-X014**, **T-X020**, **T-US-048**, **T-X066**, **T-F01**, **T-F02**, **T-F03**, **T-F04**, **T-F05**, **T-F06**, **T-F08**, **T-F09**, **T-F10**, **T-F11**, **T-F12**, **T-F13**, **T-F14**, **T-F15**, **T-F16**, **T-F18**, **T-F19**, **T-F20**, **T-F21**, **T-F22**, **T-F17**, **T-F24**, **T-F26**, **T-US-047**, **T-US-002**, **T-X002**, **T-X018**, **T-US-054**, **T-X073**, **T-US-060**, **T-X005**, **T-X006**, **T-X019**, **T-US-036**, **T-X029**, **T-US-057**, **T-US-024**, **T-US-042**, **T-X057**, **T-US-044**, **T-X053**, **T-US-018**, **T-US-019**, **T-US-020**, **T-US-021**, **T-US-022**, **T-US-023**, **T-US-025**, **T-US-026**, **T-US-027**, **T-US-028**, **T-US-029**, **T-US-030**, **T-US-031**, **T-US-033**, **T-US-034**, **T-US-035**, **T-US-049**, **T-US-050**, **T-US-051**, **T-US-053**, **T-US-055**, **T-US-059**, **T-X037**, **T-X058**, **T-X069**, **T-X038**, **T-X039**, **T-US-058**, **T-US-046**, **T-X048**, **T-US-010**, **T-US-012**, **T-US-015**, **T-US-017**, **T-X033**, **T-US-008**, **T-X032**, **T-X031**, **T-US-040**, **T-US-041**, **T-X049**, **T-X017**, **T-X024**, **T-X011**, **T-X003**, **T-X050**, **T-X010**, **T-X009**, **T-X007**, **T-X016**, **T-X022**, **T-X065**, **T-X004**, **T-X013**, **T-X027**, **T-X028**, **T-X030**, **T-X063**, **T-X043**, **T-X026**, **T-X052**, **T-X054**, **T-X055**, **T-X056**, **T-X059**, **T-US-038**, **T-X060**, **T-X045**, **T-X070**.

**T-X001** maps only to `HOST_SLEEP_MONITORING_COVERAGE_GAP`.

**T-X016** maps only to `STOP_BEFORE_DISPATCH_NO_MUTATION`.

**T-X022** maps only to `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.

**T-X063** maps only to `INDIRECT_PROMPT_INJECTION_EXFIL_DENIED`.

**T-X015** maps only to `DST_RECURRING_SCHEDULE_NO_DUPLICATES`.

**T-X066** maps only to `BACKUP_OMIT_RECEIPT` (omit→restore→remote SoR reconcile→verify/retry). Retry-only `NO_DUPLICATE_EFFECTS`, `UNKNOWN_REMOTE_RECONCILE` (T-X020/T-US-048), and `RECOVER_ROTATE_RECONCILE` (T-F24/T-US-047) do not satisfy T-X066. Live backup/restore remains NOT_WIRED; ACCEPTED ≠ VERIFIED.

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

**T-US-042** / **T-X057** map only to `REPAIR_WEAKEN_TEST_REJECTED` (weaken aliases + `__tests__/` protected; live NOT_WIRED).

**T-US-044** / **T-X053** map only to `TAKEOVER_CANCELS_UNSENT_REPLIES` (multi-queue cancel; SENT preserved; `VERSION_MISMATCH` via real takeover for stale prepare; `CONVERSATION_TAKEOVER` at matching post-takeover version; not live VERIFIED).

**T-US-018** / **T-X037** map only to `EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN`.

**T-X058** maps only to `REPAIR_ATTEMPT_LIMIT_ESCALATED` (MAX_REPAIR_ATTEMPTS=2; third automatic start ATTEMPT_LIMIT after ESCALATED; CMS repair NOT_WIRED; externalEffects NONE; not live VERIFIED).

**T-X069** maps only to `IMPORTED_DOC_QUARANTINED_AS_DATA` (quarantine forces null instructionVersion; UNTRUSTED_SOURCE not instruction-eligible; live NOT_WIRED; not live VERIFIED).

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

**T-X065** maps only to `WORKER_BROWSER_AUTH_STATE_OS_DENIED` (workers / browser-pool / host-admin OS-denied from system Chrome, OS profile, and OAuth callback cookies; workspace partition needs browser-pool + consent; vault intact on deny; live browser-auth NOT_WIRED; externalEffects NONE; not live VERIFIED).

**T-X004** maps only to `DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED`.

**T-X043** maps only to `OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS` (SEO/content optimization that breaks CTA → journey regression fails / release blocked; not live VERIFIED).

**T-X054** maps only to `REPLY_SENT_CRM_RECONCILES_NO_RESEND` (reply SENT/DELIVERED + CRM fail → CRM reconcile; no outbound resend; inbound/QUEUED gated; fixtureOnly required; liveCrmWiring NOT_WIRED; live VERIFIED / live CRM wire / non-fixture → LIVE_CRM_CLAIM_REFUSED; externalEffects NONE; not live VERIFIED).

**T-X055** maps only to `UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE`.

**T-X056** maps only to `AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF` (agent message cap → MESSAGE_LIMIT handoff; over-bound/max=0 still hand off; live NOT_WIRED; not live VERIFIED).

**T-X059** maps only to `DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING` (one booking; separate claims; liveProviderWiring NOT_WIRED; not live VERIFIED). Shared map with T-US-038.

**T-X070** maps only to `VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES` (VALIDATION_FAILED ≠ COLLECTION_FAILED; empty recordId → COLLECTION_FAILED; live NOT_WIRED; not live VERIFIED).

**T-X060** maps only to `CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM` (whitespace-normalized match; blank → INVALID_DIMENSION; heterogeneous refuse silent sum; live NOT_WIRED; not live VERIFIED).

**T-X028** maps only to `ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE`.

| T-X044 | Fixture ACCEPTED via unlicensed venue media publish blocked only |

**T-X045** maps only to `PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE` (per-destination PARTIAL honesty; not live VERIFIED).


**T-US-052** maps only to `MOCKED_CONNECTOR_NOT_PRODUCTION_READY` (mocked FIXTURE/NOT_WIRED ≠ production-ready; not live VERIFIED).

**T-US-006** maps only to `UNBOUND_WRITE_PATH_FAIL_CLOSED` (observe/create ok; unbound write fail closed; applyAttemptCount=0; not live VERIFIED).

**T-X023**, **T-US-052** maps only to `EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND`.

**T-US-056** maps only to `HONEST_OUTAGE_HOSTED_CONTACT_PATH` (honest outage; durable hosted contact path; not live VERIFIED).

**T-X030** maps only to `RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE` (bounded backoff preserves deadline; not live VERIFIED).

**T-X040** maps only to `LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE` (research-only; never a publish trigger; not live VERIFIED).

**T-US-012** maps only to `GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED` (Google Ads TEST vs PRODUCTION credential/customer separation; LIVE NOT_WIRED; not live VERIFIED).

**T-X034** maps only to `ADS_TEST_PROJECT_PRODUCTION_BLOCKED` (test-only/sandbox Ads project cannot bind production/LIVE; bind call count 0; distinct from T-US-012; not live VERIFIED).

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
**T-X036** maps only to `RECENT_ADS_CONVERSION_BLANK_PENDING` (blank/omitted/unsettled recent Ads conversions stay PENDING with displayValue null — never a false zero; budget adjust blocked while unsettled; live NOT_WIRED; distinct from T-US-011/T-US-031/T-X034/T-X035; ChatGPT Ads connect soft-skip ACCESS_BLOCKED; not live VERIFIED).
**T-US-033** maps only to `EVAL_SUITE_ADJUDICATION_BACKLOG` (Claude/Gemini eval suite adjudication + linked backlog; no production writes; live NOT_WIRED; distinct from T-US-015/T-US-017/T-US-018/T-X037/T-X038; not live VERIFIED).
**T-US-034** maps only to `PROVIDER_ERROR_NOT_PASS` (provider error ≠ bad answer or pass; distinct statuses; pass-rate denominator excludes infrastructure errors; live NOT_WIRED; distinct from T-X039/T-US-058 / T-US-033 / T-X038; not live VERIFIED).
**T-US-049** maps only to `DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE` (daily owner review; reviewed operating knowledge; live NOT_WIRED; distinct from T-US-050 / T-US-025 / T-US-035; not live VERIFIED).
**T-US-050** maps only to `OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE` (owner brief groups root cause; actionable next steps; ungrouped flood refused; live NOT_WIRED; distinct from T-US-049 / T-X068; not live VERIFIED).
**T-US-051** maps only to `DESIGN_RELEASE_READINESS_PACKET` (design/release readiness; release acceptance packet with SC-01..SC-25 coverage + outcome evidence; live NOT_WIRED; distinct from T-US-035 / T-US-049 / T-US-055; not live VERIFIED).
**T-US-053** maps only to `SECRETS_NEVER_IN_BROWSER_ASSETS` (secrets never in browser assets; secret-bearing browser/public-env assets refused; live NOT_WIRED; distinct from T-X065 / T-X005 / T-F24/T-US-047 / T-X063; not live VERIFIED).
**T-US-055** maps only to `KEYBOARD_JOURNEY_REDUCED_MOTION` (complete keyboard journey with reduced motion; motion/focus/pointer failures refused; live NOT_WIRED; distinct from T-X061 / T-US-051; not live VERIFIED).
**T-US-059** maps only to `SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED` (shared briefs redacted; private evidence retained in private vault; unredacted share / private-field leak / discard-on-share refused; live NOT_WIRED; distinct from T-US-050 / T-US-053 / redactEvidenceSummary; not live VERIFIED).

**T-F01** maps only to `CREATE_TRUSTED_LOCAL_WORKSPACE` (complete F01 evidence package: owner session, workspace revision, timestamped diagnostics not online badge, Observe authority, startup + recovery, blockers+next-actions; public writes refused; live NOT_WIRED; distinct from T-US-001 readiness blockers summary; not live VERIFIED).

**T-F02** maps only to `CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH` (complete F02 evidence package: registered roots + write/read probe, storage-risk checks, ingestion manifest + duplicate detection, business facts + unresolved conflicts, signed revision + impacted assets, restore with secrets excluded; public claims from unresolved refused; live NOT_WIRED; distinct from T-US-003 folders-ready happy-path summary; not live VERIFIED).

**T-F03** maps only to `MAP_SITES_PAGES_EDITABLE_SOURCES` (complete F03 evidence package: domain/URL inventory + exclusions, timestamped HTML/screenshot, source binding + deploy target, journey graph with owners, scope grant, baseline ID + checks; unsafe claims refused; live NOT_WIRED; distinct from T-US-005 baseline-ID happy-path summary; not live VERIFIED).

**T-F04** maps only to `CONNECT_GOOGLE_ANALYTICS_4` (complete F04 evidence package: scopes+identity, property→site bind, versioned event dictionary+owner+gaps, sample report request/rows/coverage, three measurement outcomes, READ_READY+next sync; unsafe claims refused; live NOT_WIRED; distinct from T-US-007 ready-read/next-sync summary; not live VERIFIED).

**T-US-009** maps only to `CONNECT_GSC_SCHEDULE_WATERMARK` (schedule/watermark summary; applyAttemptCount=0; distinct from T-F05; not live VERIFIED).

**T-US-007** maps only to `CONNECT_GA4_READ_READY_NEXT_SYNC` (ready-read/next-sync summary; live NOT_WIRED; distinct from T-F04; not live VERIFIED).

**T-F05** maps only to `CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY` (complete F05 evidence package: identity+scopes+API readiness, domain/URL-prefix property bind, comparable-query config, observation batch+coverage+sitemap, intent→page map, daily schedule+watermark; unsafe claims refused; live NOT_WIRED; distinct from T-US-009 schedule/watermark summary; not live VERIFIED).

**T-F06** maps only to `CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS` (complete F06 evidence package: project+access tier, identity+scopes, deny-write consent, client/manager bind+TEST badge, campaigns+conversions, event mapping+discrepancies, read receipt+watermark, READ_READY Analyze-only; unsafe claims refused; live NOT_WIRED; distinct from T-US-011 analyze-only save/reload and T-US-012 test vs production; not live VERIFIED).
**T-US-011**, **T-US-045** maps only to `CONNECT_GOOGLE_ADS_ANALYZE_ONLY` (analyze-only save/reload; write/spend disabled; distinct from T-F06 complete package; not live VERIFIED).


**T-F08** maps only to `CONNECT_CLAUDE_CODE_AND_TEST_API` (complete F08 evidence package: install+auth diagnostic, broker test-API bind, dated model catalog, budget policy+selected model, consented smoke+usage ledger, EVAL_ONLY test adapter enabled; unsafe claims refused; live NOT_WIRED; distinct from T-US-015 EVAL_ONLY connect summary and T-US-016 runtime vs API eval auth; not live VERIFIED).

**T-F09** maps only to `CONNECT_GEMINI_INDEPENDENT_TESTING` (complete F09 evidence package: data-use decision, broker credential, dated model/capability snapshot, evaluation condition, consented smoke under cap + provider receipt, EVAL_ONLY save with publish/customer-reply denied; unsafe claims refused; live NOT_WIRED; distinct from T-US-017 EVAL_ONLY connect summary and T-US-018/T-X037 operational tool forbid; not live VERIFIED).

**T-F10** maps only to `MAP_CRM_FORMS_BOOKING_TRUTH` (complete F10 evidence package: Zoho org/region/environment binding, form→CRM contract, canary grant/retention, booking capability matrix, correlated journey, passing failure/recovery; unsafe claims refused; live Zoho NOT_WIRED; distinct from T-US-019 failure/recovery readiness summary, T-US-039 continuous cadence, and T-US-040 thank-you ≠ CRM; not live VERIFIED).

**T-F11** maps only to `CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS` (complete F11 evidence package: account/asset IDs, auth results, per-action capability matrices, destination contracts, support policy, authorized test artifact with ready capability; unsafe claims refused; live NOT_WIRED; distinct from T-US-021 connect readiness summary, T-US-022 unsupported destination capabilities, and T-X045 partial campaign destinations; not live VERIFIED).

**T-F12** maps only to `GRANT_STANDING_AUTONOMY_SAFELY` (complete F12 evidence package: scope snapshot, autonomy mode, versioned authority draft, policy constraints, policy test matrix, owner-signed grant + audit, pause/stop-writes/pause-replies control receipts; unsafe claims refused; live NOT_WIRED; distinct from T-US-023 control-receipts readiness summary, T-US-024 agent cannot widen grant, and T-US-060 emergency stop at commit; not live VERIFIED).

**T-F13** maps only to `LAUNCH_WORKSTREAM_RECURRING_SCHEDULE` (complete F13 evidence package: objective + pilot scope, readiness gates, plan/assets/cost, dry rehearsal with externalEffects NONE, frequency/timezone/cooldown, owner-reviewed launch receipt, mission outcome + next action; unsafe claims refused; live NOT_WIRED; distinct from T-US-025 launch readiness summary, T-US-026 missed-schedule coalesce, and T-X015 DST schedule no duplicates; not live VERIFIED).

**T-F14** maps only to `TURN_DEMAND_INTO_PAGE_IMPROVEMENT` (complete F14 evidence package: observations, intent-to-page, mission/brief, proposed answer/metadata/links review, exact revision diff, independent QA, policy release receipt + experiment window, measurable change observation; unsafe claims refused; live NOT_WIRED; distinct from T-US-027 release receipt summary, T-US-028 keyword proliferation, and T-US-035 review/revise/release; not live VERIFIED).

**T-F15** maps only to `CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN` (complete F15 evidence package: approved facts, venue media, authorized capabilities, brief+outcome, versioned draft, QA, previews, canonical publish, provider outcomes, campaign manifest, measurement, distribution review; unsafe claims refused; live NOT_WIRED; distinct from T-US-029 campaign-manifest summary, T-X045 partial destinations, T-US-022 unsupported capabilities, and T-US-030 uncertain post reconcile; not live VERIFIED).

**T-F20** maps only to `VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY` (complete F20 evidence package: canary identity, journey spec, safety gate, step timestamps+correlation, journey graph, pass-or-named-failure (+incident/owner on failure), cadence/heartbeat; unsafe claims refused; live Zoho NOT_WIRED; distinct from T-US-039 cadence/heartbeat summary, T-F10/T-US-019 CRM map / failure→recovery, and T-US-040 thank-you ≠ CRM; not live VERIFIED).

**T-F23** maps only to `TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT` (complete F23 evidence package: approved catalog/ownership, parsed intent+ambiguities, eligibility filter trace, answer/handoff review, judgment, remediation, golden evaluation comparison; unsafe claims refused; live NOT_WIRED; distinct from T-US-045 evaluation-comparison focused path, T-US-046/T-X048 hard constraints, and T-X038 eval no-grounding; not live VERIFIED).

**T-F17** maps only to `RUN_CLAUDE_GEMINI_EVALUATION_SUITES` (complete F17 evidence package; live NOT_WIRED; distinct from T-US-033; not live VERIFIED).

**T-F25** maps only to `OPERATE_DAILY_OWNER_REVIEW` (complete F25 evidence package; unsafe claims refused; live NOT_WIRED; distinct from T-US-049; not live VERIFIED).

**T-US-004** maps only to `UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED` (unsafe folders / unresolved facts blocked; safe facts usable; not live VERIFIED).

**T-US-005** maps only to `SITE_PAGE_EDITABLE_SOURCES_BASELINE` (baseline-ID happy-path; distinct from T-F03 complete F03 evidence; not live VERIFIED).

**T-US-001** maps only to `TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS` (host/Claude/providers/workstreams blockers + next actions; Observe; Ads ACCESS_BLOCKED; distinct from T-F01; not live VERIFIED).

**T-F22** maps only to `HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER` (complete F22 evidence package: response policy, inbound versions, sources/allowed-action, send+CRM lead, ownership audit takeover, acknowledged morning handoff; competing replies refused; live NOT_WIRED; distinct from T-US-043 handoff summary, T-US-044/T-X053 takeover-cancel, T-X055 unknown-policy escalate, and T-X056 bounded auto-reply loop; not live VERIFIED).


**T-F18** maps only to `REVIEW_REVISE_AND_RELEASE_A_CHANGE` (complete F18 evidence package; live NOT_WIRED; distinct from T-US-035; not live VERIFIED).

**T-F21** maps only to `DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT` (complete F21 evidence package; live NOT_WIRED; distinct from T-US-041 / T-US-042 / T-X058; not live VERIFIED).

**T-F26** maps only to `CALIBRATE_DESIGN_RELEASE_READINESS` (complete F26 evidence package; unsafe claims refused; live NOT_WIRED; distinct from T-US-051/T-US-035/T-US-049/T-US-055; not live VERIFIED).

**T-F19** maps only to `ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS` (complete F19 evidence package: analysis definition, metric definitions/denominators, view, inspection, discrepancy investigation, reconciliation worksheet, hypothesis+measurement plan, experiment record, redacted portable decision brief; vanity-score and live claims refused; live NOT_WIRED; distinct from T-US-037 portable-artifact summary, T-US-031 paid-media recommendation, T-US-058/T-X039 metric denominators, and T-X060 currency/timezone mismatch; not live VERIFIED).

**T-F16** maps only to `REVIEW_PAID_MEDIA_RECOMMENDATIONS` (complete F16 evidence package: read-ready selection, reproducible analysis definition, evidence-backed diagnosis, typed change proposal, revision-bound financial diff, authorization record, verified mutation or explicit failure; ChatGPT Ads ACCESS_BLOCKED without transport/entitlement; unsafe claims refused; live NOT_WIRED; distinct from T-US-031 decision+execute-failure summary, T-US-011 analyze-only, T-US-012 test vs production, T-US-032 exact financial boundaries, and T-F07/T-US-013/T-US-014 ChatGPT Ads connect; not live VERIFIED).

**T-US-035** maps only to `REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED` (review/revise/release; independent decision; release receipt or blocked exception; self-approval and stale approval refused; live NOT_WIRED; distinct from T-US-027 / T-US-036/T-X019 / T-US-054/T-X018; not live VERIFIED).


**T-US-041** maps only to `DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF` (verified resolution or acknowledged handoff; CMS repair NOT_WIRED; not live VERIFIED).


**T-X042** maps only to `SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS`.

**T-X046** maps only to `UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION` (unsupported blog destination; no fake publication; never invent PUBLISHED_VERIFIED; distinct from T-US-022/T-X045; not live VERIFIED).


**T-X047** maps only to `LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS`.

**T-X051** maps only to `WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH` (trim match; case-differ IDENTITY_MISMATCH; blank refuse; fixture+WIRED / non-fixture matched refuse; liveProviderWiring NOT_WIRED; externalEffects NONE; not live VERIFIED).

**T-X052** maps only to `SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED` (synthetic conversion contaminants projected out; syntheticExcludedRevenueMinor tracked; defense-in-depth; live NOT_WIRED; not live VERIFIED).


**T-X062** maps only to `SSE_GAP_FULL_STATE_RESYNC` (offline/online SSE gap → full-state resync; pending gap blocks invent; liveProviderWiring NOT_WIRED; not live VERIFIED).

**T-X061** maps only to `KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG` (dialog open/trap/restore or FOCUS_LOST; not live VERIFIED).

**T-X068** maps only to `THIRTY_ALERTS_ONE_OUTAGE_GROUPED` (thirty alerts sharing one whitespace-normalized outageKey → one grouped incident with chronological alertIds / max severity / uniqueSources; live NOT_WIRED; not live VERIFIED).

**T-X064** maps only to `SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP` (redirect + DNS rebind blocked every hop; fixture only; not live VERIFIED).

**T-X067** maps only to `INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED` (in-flight RUNNING/APPLYING refuse breaking / cross-epoch / breakingRevision upgrades and retain compatible pin; IDLE/COMPLETE refuse silent incompatible rebind; Temporal NOT_WIRED; externalEffects NONE; not live VERIFIED).

**T-X071** maps only to `HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE` (offline host → honest UNAVAILABLE/HOST_OFFLINE across surfaces; ONLINE without prior → HOST_ONLINE_NO_PRIOR_UNAVAILABLE; live NOT_WIRED; not live VERIFIED).

**T-X072** maps only to `CUSTOMER_DATA_EVAL_REDACTION_BLOCKS` (raw customer PII cannot enter EVAL_ONLY; redact → `REDACTED_FOR_EVAL` incl. conversationId / boundary-safe intentLabel; eval prompts withhold conversationId; raw passthrough / residual PII / live-VERIFIED claims → `CUSTOMER_DATA_LEAK_BLOCKED`; liveEvalWiring NOT_WIRED; externalEffects NONE; not live VERIFIED).
