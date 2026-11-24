# WorkSocial product acceptance and failure test catalog (v6)

159 specified cases. Every product case is NOT_RUN until executed in its declared environment with redacted evidence. Fixture, sandbox, and specifically authorized production results must remain distinguishable. The v6 ChatGPT Ads case requires verified local transport and entitlement instead of assuming a specific credential is available.

Source locked: owner paste 2026-11-19 (America/New_York). Separate executed reference-core tests do not establish production acceptance.

## Shared rules

- Each case must run in its declared environment with redacted evidence.
- Labels: fixture | sandbox | authorized production — never conflate.
- ChatGPT Ads (T-F07 / T-US-013): access-blocked unless supported local transport, entitlement, and auth are verified.

---

## Full-stack e2e flows (T-F01–T-F26)

### T-F01 - Create a trusted local workspace
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — create trusted local workspace complete F01 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-001, RQ-003, RQ-035 | Flows: F01 | Screens: SC-02
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: An authorized administrator has installed the application and Claude Code.

Steps:
1. Open the local application and create the owner identity.
2. Confirm business name, time zone and notification recipients.
3. Run host diagnostics.
4. Choose Observe as the initial operating mode.
5. Enable unattended startup after reviewing host requirements.
6. Read the readiness summary.

Expected result: Owner can sign in and see verified local readiness; no public writes have occurred.

Required evidence:
- Owner ID, role and session record.
- Workspace configuration revision.
- Timestamped diagnostic results, not a decorative online badge.
- Initial authority decision.
- Startup result and recovery test.
- Explicit blockers and next action for each.

### T-F02 - Choose folders and establish business truth
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — choose folders establish business truth complete F02 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-002, RQ-005, RQ-033, RQ-036 | Flows: F02 | Screens: SC-20
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Workspace exists; operator has folder and knowledge permissions.

Steps:
1. Select workspace, content, evidence and backup folders.
2. Review the database and secret-store locations.
3. Import approved descriptions, venue media and operating rules.
4. Map authoritative sources for prices, capacity, hours and availability.
5. Resolve or leave each conflict blocked.
6. Run an export/restore rehearsal.

Expected result: Content and evidence destinations are valid; every critical pilot claim has an owner and source.

Required evidence:
- Registered root IDs and write/read probe.
- Storage-risk checks.
- Ingestion manifest; duplicate detection.
- Business fact records and unresolved conflicts.
- Signed fact revision and impacted assets.
- Restore evidence; secrets excluded.

### T-F03 - Map sites, pages and editable sources
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — map sites pages editable sources complete F03 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-004, RQ-020 | Flows: F03 | Screens: SC-06
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Owner has authorized the domain and relevant repositories/CMS.

Steps:
1. Add the domain and allowed URL boundaries.
2. Select a pilot page.
3. Bind the page to its actual CMS item or repository source.
4. Map the booking, form and CRM destinations.
5. Choose an initial editable subset and exclusions.
6. Run baseline checks.

Expected result: Each pilot page has a proven editable source and release path.

Required evidence:
- Inventory with source counts and exclusions.
- Timestamped HTML and screenshot snapshot.
- Source binding and deployment target.
- Journey graph with owners.
- Scope grant draft.
- Baseline ID and passing/failing checks.

### T-F04 - Connect Google Analytics 4
Level: full_stack_e2e | Status: ACCEPTED (fixture only — not sandbox/prod VERIFIED)
Requirements: RQ-013, RQ-014, RQ-034 | Flows: F04 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: A Google Cloud project, enabled Analytics Data/Admin APIs and property access are available.

Steps:
1. Choose GA4, then connect through the system browser.
2. Select the Analytics account, GA4 property and relevant web stream.
3. Choose the business outcomes to map.
4. Run a bounded sample report.
5. Test measurement separately.
6. Save the connection as read-only.

Expected result: Correct GA4 property is bound, sample reporting works and event-mapping gaps are explicit.

Required evidence:
- Grant scopes and connection identity.
- Confirmed property-to-site binding.
- Versioned event dictionary with owner.
- Provider request ID, dimensions, rows and coverage.
- Three distinct test outcomes.
- Ready-read status and next sync time.

### T-F05 - Connect Search Console and organic visibility
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — connect Search Console organic visibility complete F05 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-013, RQ-015 | Flows: F05 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Verified Search Console access and enabled API are available.

Steps:
1. Select Search Console and authorize read-only access.
2. Choose the exact domain or URL-prefix property.
3. Set country, device, search type and comparison window.
4. Load query/page observations and sitemap status.
5. Map high-value intents to pages.
6. Save the daily read schedule.

Expected result: Organic observations are comparable and attributable to the right Search Console property.

Required evidence:
- Identity, scopes and API readiness.
- Property binding.
- Comparable-query configuration.
- Observation batch and coverage notes.
- Intent-to-page mapping.
- Scheduled task and source watermark.

### T-F06 - Connect Google Ads for controlled analysis
Level: full_stack_e2e | Status: fixture ACCEPTED (not live VERIFIED)
Requirements: RQ-013, RQ-016 | Flows: F06 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Google Cloud API access and the appropriate Ads account role exist.

Steps:
1. Choose Google Ads and review the current access requirements.
2. Authorize the Google identity.
3. Select the client customer and manager context when applicable.
4. Fetch campaigns and conversion-action definitions.
5. Map conversion actions to the business event dictionary.
6. Choose Analyze only as the initial capability.

Expected result: Ads reporting works for the chosen account; spending authority remains disabled.

Required evidence:
- Project and access-tier evidence.
- Consent plus application-level deny-write rule.
- Account binding; test versus production badge.
- Read receipt and source watermark.
- Mapping and discrepancy tasks.
- Read-ready connection and disabled write capability.

### T-F07 - Connect ChatGPT Ads
Level: full_stack_e2e | Status: NOT_RUN
Requirements: RQ-013, RQ-017 | Flows: F07 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: An eligible Ads Manager account exists; the administrator has verified a supported local integration transport, account entitlement and authentication method. Otherwise the capability remains access-blocked.

Steps:
1. Choose ChatGPT Ads, not ChatGPT organic presence.
2. Provision the verified supported account credential through the protected broker, or keep the adapter blocked and retain import/review workflows. Do not assume an installed ChatGPT connector is callable from local Claude.
3. Run an account identity read.
4. Inspect conversion sources and campaign associations.
5. Import a bounded performance window.
6. Save Analyze only and choose an escalation owner.

Expected result: Identity and reads are verified; reporting delays and measurement gaps remain visible.

Required evidence:
- Selected integration type.
- Verified transport/entitlement and masked broker reference; no raw credential in UI. Access-blocked state when no supported local transport is available.
- Account binding receipt.
- Measurement-readiness checklist.
- Source watermarks and pending-data labels.
- Read-ready status and explicit write denial.

### T-F08 - Connect Claude Code and the Claude test API
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — connect Claude Code and test API complete F08 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-006, RQ-012, RQ-013, RQ-018 | Flows: F08 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Claude Code is installed; an authorized Claude API workspace credential is available for testing.

Steps:
1. Validate the local Claude Code installation and authentication.
2. Select a broker-held credential reference for Claude API tests.
3. Discover accessible models.
4. Choose the evaluation model and maximum cost.
5. Run a small consented smoke test with synthetic data.
6. Enable the test adapter.

Expected result: CLI readiness and API evaluation readiness are separately visible and testable.

Required evidence:
- Runtime diagnostic receipt.
- Test-provider binding.
- Dated model catalog.
- Budget policy revision.
- Smoke-test artifact and usage ledger.
- EVAL_ONLY capability.

### T-F09 - Connect Gemini for independent testing
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — connect Gemini independent testing complete F09 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-012, RQ-013, RQ-018, RQ-036 | Flows: F09 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: A permitted Gemini project credential and a bounded testing budget exist.

Steps:
1. Select Gemini Evaluation and review data policy.
2. Bind an approved restricted credential through the local broker.
3. Discover available models and supported tools.
4. Choose either fixed-corpus or open-web test mode.
5. Run a minimal test under the displayed cap.
6. Save Evaluation only.

Expected result: Gemini can be selected for controlled evaluation; it cannot publish or respond to customers.

Required evidence:
- Data-use decision.
- Masked credential reference.
- Model/capability snapshot.
- Evaluation condition definition.
- Provider response and test receipt.
- EVAL_ONLY connection state.

### T-F10 - Map CRM, forms and booking truth
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — map CRM/forms/booking truth complete F10 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-024, RQ-025 | Flows: F10 | Screens: SC-16
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Authorized Zoho environment, controlled test identities and booking-system access exist.

Steps:
1. Connect the exact Zoho organization, region and environment.
2. Map every pilot form field and assignment rule.
3. Set controlled test recipients and synthetic-record rules.
4. Map the booking inventory and receipt source.
5. Run one authorized end-to-end canary.
6. Review failure injection and retry behavior.

Expected result: A known pilot journey is proven, including correct mapping and safe synthetic-data handling.

Required evidence:
- Environment binding.
- Form-to-CRM contract.
- Canary grant and retention policy.
- Booking capability matrix.
- Correlated journey evidence.
- Passing failure/recovery scenario.

### T-F11 - Connect local, social and inbox channels
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — connect local/social/inbox channels complete F11 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-013, RQ-022 | Flows: F11 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Ownership, eligible account types and supported provider access exist.

Steps:
1. Select a provider and exact page/profile/location.
2. Complete provider sign-in and any human verification.
3. Inspect post, review, message and read-back capabilities separately.
4. Choose approved content formats and location boundaries.
5. Set support hours and human escalation recipients.
6. Perform a specifically authorized test.

Expected result: Every enabled destination has verified capabilities and its own authority.

Required evidence:
- Account and asset IDs.
- Authentication result.
- Capability matrix per action.
- Destination contract.
- Support policy.
- Test artifact and ready capability.

### T-F12 - Grant standing autonomy safely
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — grant standing autonomy safely complete F12 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-003, RQ-008, RQ-030 | Flows: F12 | Screens: SC-19
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Relevant connection tests, business facts and asset bindings have passed.

Steps:
1. Choose the workstream and scope.
2. Select Observe, Draft, Review required or Bounded automatic.
3. Set limits, expiry, notification rules and excluded actions.
4. Preview allowed and blocked examples.
5. Approve the policy with owner identity.
6. Try pause, stop writes and pause replies.

Expected result: Routine eligible actions may proceed; material exceptions and spending remain explicit.

Required evidence:
- Scope snapshot.
- Versioned authority draft.
- Policy constraints.
- Policy test matrix.
- Signed grant and audit event.
- Control tests with receipts.

### T-F13 - Launch a workstream and recurring schedule
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — launch workstream recurring schedule complete F13 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-006, RQ-007 | Flows: F13 | Screens: SC-02
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Required connections, facts, tests and policy are ready for the chosen workstream.

Steps:
1. Choose an objective and pilot scope.
2. Review the required readiness gates.
3. Run a dry rehearsal.
4. Select frequency, timezone and change cooldown.
5. Enable the reviewed workstream.
6. Follow the mission to verified completion.

Expected result: One authorized workflow finishes with evidence and a visible recurring schedule.

Required evidence:
- Plan, affected assets and estimated cost.
- Workstream readiness checklist.
- Dry-run evidence bundle.
- Schedule definition.
- Launch receipt.
- Mission outcome and next action.

### T-F14 - Turn demand into a page improvement
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — turn demand into page improvement complete F14 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-005, RQ-015, RQ-019, RQ-020 | Flows: F14 | Screens: SC-07
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Read observations and a verified editable page exist.

Steps:
1. Open a trend or recurring question.
2. Confirm the target intent and page.
3. Create a visibility mission.
4. Review the proposed answer, metadata and internal links.
5. Run quality and customer-journey tests.
6. Release under the applicable policy and observe.

Expected result: A source-backed change is live and measurable, or blocked with a clear reason.

Required evidence:
- Observation IDs.
- Intent-to-page match.
- Task plan and content brief.
- Exact revision diff.
- Independent QA bundle.
- Release receipt and experiment window.

### T-F15 - Create and distribute an original campaign
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — create and distribute original campaign complete F15 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-010, RQ-021, RQ-022 | Flows: F15 | Screens: SC-08
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Approved facts, actual venue media and authorized destination capabilities exist.

Steps:
1. Choose a brief and audience need.
2. Draft the canonical article.
3. Review utility, brand, sources and accessibility.
4. Preview the destination variants.
5. Publish the canonical page and eligible variants.
6. Review distribution and outcome collection.

Expected result: Eligible content has receipts; blocked channels have visible recovery actions.

Required evidence:
- Brief with source IDs and outcome.
- Editable versioned draft.
- QA findings and revision hash.
- Per-destination preview.
- Independent provider outcomes.
- Campaign manifest and measurement state.

### T-F16 - Review Google and ChatGPT paid-media recommendations
Level: full_stack_e2e | Status: ACCEPTED (fixture)
Requirements: RQ-016, RQ-017, RQ-034 | Flows: F16 | Screens: SC-13
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Selected accounts are read-ready; comparable settled data and conversion context exist.

Steps:
1. Select platform, account, dates and attribution basis.
2. Inspect delivery before diagnosing conversion.
3. Request a recommendation.
4. Inspect the exact before/after and affected shared budgets.
5. Approve or decline the specific action.
6. Execute and verify only when authorized.

Expected result: A precisely scoped decision is recorded and any permitted mutation is verified.

Required evidence:
- Reproducible analysis definition.
- Evidence-backed diagnosis.
- Typed change proposal.
- Revision-bound financial diff.
- Authorization record.
- Verified mutation or explicit failure.

### T-F17 - Run Claude and Gemini evaluation suites
Level: full_stack_e2e | Status: ACCEPTED (fixture — not sandbox/prod VERIFIED)
Requirements: RQ-012, RQ-018 | Flows: F17 | Screens: SC-14
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Evaluation-only provider connections, curated cases and budget consent exist.

Steps:
1. Select the suite and purpose.
2. Choose models, evidence version, repetitions and tool mode.
3. Review prompts and privacy.
4. Approve the bounded test run.
5. Inspect case-level outcomes.
6. Adjudicate failures and create remediation tasks.

Expected result: Reproducible test results identify specific content/search gaps without production writes.

Required evidence:
- Versioned suite ID and surface label.
- Condition manifest.
- Redaction and fixture check.
- Run authorization.
- Case result artifacts.
- Adjudication plus linked backlog item.

### T-F18 - Review, revise and release a change
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — review revise and release a change complete F18 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-008, RQ-009, RQ-011 | Flows: F18 | Screens: SC-05
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: A proposed revision, source evidence and applicable checks exist.

Steps:
1. Open the review queue and select an item.
2. Read why the change is proposed.
3. Compare before/after and supporting sources.
4. Inspect technical, factual and policy gates.
5. Approve exact revision, request revision or reject.
6. Track release and verify.

Expected result: The decision and any external effect are traceable to a reviewed revision.

Required evidence:
- Review item and current revision.
- Evidence summary.
- Human-readable diff and source drawer.
- QA bundle.
- Decision record bound to revision and policy.
- Release receipt or blocked exception.

### T-F19 - Analyze performance and test a hypothesis
Level: full_stack_e2e | Status: ACCEPTED
Requirements: RQ-014, RQ-028, RQ-034 | Flows: F19 | Screens: SC-12
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Data sources and business event definitions have mapped identities and freshness.

Steps:
1. Choose site, period, comparison and reporting timezone.
2. Select acquisition, journey or revenue view.
3. Inspect a channel or page.
4. Investigate a discrepancy.
5. Save a hypothesis and measurement plan.
6. Export or share a redacted decision brief.

Expected result: A reproducible analysis produces a supported decision, not a vanity score.

Required evidence:
- Saved analysis definition.
- Metric definitions and denominators.
- Drill-through and annotations.
- Reconciliation worksheet.
- Experiment record.
- Portable analysis artifact.

### T-F20 - Verify a form-to-CRM journey continuously
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — verify form-to-CRM journey continuously complete F20 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-024, RQ-025 | Flows: F20 | Screens: SC-15
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Controlled canary identity, target environment and test permission exist.

Steps:
1. Select a declared journey and device.
2. Review synthetic-data protections.
3. Run the canary.
4. Inspect each step, not just the page status.
5. Create an incident for reproducible failure.
6. Set recurring cadence within allowed load.

Expected result: The journey either passes end to end or names the failed/unverified stage.

Required evidence:
- Journey specification.
- Safety gate.
- Step timestamps and correlation ID.
- Journey graph.
- Incident and owner.
- Cadence and heartbeat history.

### T-F21 - Diagnose and repair a permitted defect
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — diagnose and repair permitted defect complete F21 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-011, RQ-027 | Flows: F21 | Screens: SC-21
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: A reproduced incident, source binding and bounded repair policy exist.

Steps:
1. Open the incident and business-impact evidence.
2. Review the proposed repair scope.
3. Run the patch and regression tests.
4. Obtain independent approval or verify standing authority.
5. Release to a canary and re-run the original failing journey.
6. Close, roll back or escalate.

Expected result: The original failing journey is recovered or safely escalated with evidence.

Required evidence:
- Incident bundle.
- Repair plan and source revision.
- Diff, test results and attempt ledger.
- Review plus policy decision.
- Read-back and repeated test.
- Verified resolution or human handoff.

### T-F22 - Handle after-hours messages and take over
Level: full_stack_e2e | Status: ACCEPTED (fixture — not sandbox/prod VERIFIED)
Requirements: RQ-026, RQ-035, RQ-036 | Flows: F22 | Screens: SC-17
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Supported inbox connection, approved facts and response policy exist.

Steps:
1. Set coverage hours, allowed questions and escalation owner.
2. Receive an inbound conversation.
3. Inspect or allow the proposed response.
4. Send within policy and log the lead.
5. Choose Take over when needed.
6. Review the morning handoff.

Expected result: Customer receives a supported answer or a clear handoff; no competing replies occur.

Required evidence:
- Response policy.
- Message and conversation versions.
- Sources and allowed-action evaluation.
- Message receipt and CRM link.
- Ownership audit event.
- Acknowledged handoff.

### T-F23 - Test semantic search and improve no-result cases
Level: full_stack_e2e | Status: ACCEPTED (fixture — not sandbox/prod VERIFIED)
Requirements: RQ-005, RQ-023, RQ-035 | Flows: F23 | Screens: SC-11
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Approved catalog and authoritative field ownership exist.

Steps:
1. Enter a representative customer need.
2. Inspect candidate eligibility.
3. Review the answer and booking handoff.
4. Mark relevant, wrong or no-match.
5. Create a content or retrieval correction.
6. Re-run the golden set.

Expected result: Search answers satisfy hard constraints and have verified facts or explicit uncertainty.

Required evidence:
- Parsed intent with ambiguities.
- Filter trace.
- Citations and destination links.
- Judgment record.
- Remediation task.
- Evaluation comparison.

### T-F24 - Recover, rotate access and reconcile
Level: full_stack_e2e | Status: ACCEPTED (fixture only — recover/rotate/reconcile proof; not sandbox/prod VERIFIED)
Requirements: RQ-001, RQ-007, RQ-010, RQ-013, RQ-030, RQ-031, RQ-036 | Flows: F24 | Screens: SC-18
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: A recovery policy, backups and authorized provider access exist.

Steps:
1. Inspect host/provider outage and queued work.
2. Pause affected outbound capabilities.
3. Reconnect or rotate credentials through the secure broker.
4. Reconcile unconfirmed publications and replies.
5. Resume with a controlled canary.
6. Export or offboard when needed.

Expected result: Recovery preserves state and does not duplicate external actions.

Required evidence:
- Health timeline.
- Capability-level stop.
- Rotation record without secrets.
- Reconciliation receipts.
- Recovery test.
- Offboarding manifest and residual obligations.

### T-F25 - Operate the daily owner review
Level: full_stack_e2e | Status: ACCEPTED (fixture — not sandbox/prod VERIFIED)
Requirements: RQ-028, RQ-032 | Flows: F25 | Screens: SC-01
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Scheduled work has accumulated actual outcomes and exceptions.

Steps:
1. Open the morning brief.
2. Inspect what changed overnight.
3. Resolve the few exceptions needing authority.
4. Review qualified demand and costs.
5. Choose the next commercial objective.
6. Save the useful learning.

Expected result: Owner leaves with clear decisions and fewer unresolved business risks.

Required evidence:
- Evidence-backed summary.
- Completed-work ledger.
- Decision records.
- Outcome and cost view.
- New bounded mission.
- Reviewed operating knowledge.

### T-F26 - Calibrate the design and release readiness
Level: full_stack_e2e | Status: ACCEPTED *(fixture ACCEPTED — calibrate design and release readiness complete F26 evidence; not sandbox/prod VERIFIED)*
Requirements: RQ-003, RQ-029 | Flows: F26
Screens: SC-01 through SC-25
Environment: controlled_local_stack_then_authorized_canary_where_required

Given: Working prototype or implementation and agreed acceptance cases exist.

Steps:
1. Choose role, viewport, keyboard and theme.
2. Walk one complete configure-to-outcome path.
3. Check accessible states and dangerous actions.
4. Review empty, loading, stale, partial and failed examples.
5. Compare handoff requirements to implemented behavior.
6. Approve a release only with outcome evidence.
7. Repeat route-state verification for every SC-01 through SC-25 screen.

Expected result: The interface supports the required journeys and honestly represents its implementation state.

Required evidence:
- Test context.
- Interaction trace.
- Accessibility findings.
- State coverage matrix.
- Coverage register.
- Release acceptance packet.

---

## Behavior acceptance (T-US-001–T-US-060)

Each case: Level behavior_acceptance | Status NOT_RUN unless listed under fixture ACCEPTED below | Environment fixture_or_sandbox; live evidence separately authorized.

**Fixture ACCEPTED (M9 soak evidence, not live VERIFIED):** T-US-001, T-US-002, T-US-003, T-US-004, T-US-005, T-US-006, T-US-007, T-US-008, T-US-009, T-US-010, T-US-011, T-US-012, T-US-015, T-US-016, T-US-017, T-US-018, T-US-019, T-US-020, T-US-021, T-US-022, T-US-023, T-US-024, T-US-025, T-US-026, T-US-027, T-US-028, T-US-029, T-US-030, T-US-031, T-US-032, T-US-033, T-US-034, T-US-035, T-US-036, T-US-037, T-US-038, T-US-039, T-US-040, T-US-041, T-US-042, T-US-043, T-US-044, T-US-045, T-US-046, T-US-047, T-US-048, T-US-049, T-US-050, T-US-051, T-US-052, T-US-053, T-US-054, T-US-055, T-US-056, T-US-057, T-US-058, T-US-059, T-US-060.

**T-US-003** is fixture ACCEPTED only via the business truth folders restore secrets excluded proof (`BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED`) — artifact roots + durable secrets/database off sync, hours/capacity/prices/availability with owner/source, write/read + export/restore observed, secrets excluded from restore evidence; live NOT_WIRED; `externalEffects: NONE`. Distinct from T-F02 complete F02 evidence set. Not sandbox/prod VERIFIED.

**T-US-004** is fixture ACCEPTED only via the unsafe folders / unresolved facts blocked proof (`UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED`) — durable roots under sync paths refuse with DURABLE_ON_SYNC_PATH; unresolved/conflict facts stay blocked from article and concierge gates while SUPPORTED safe facts remain usable. Not sandbox/prod VERIFIED.

**T-US-012** is fixture ACCEPTED only via the Google Ads test vs production access separated proof (`GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED`) — TEST credential cannot reach PRODUCTION customer (and reverse); LIVE stays NOT_WIRED; mutate never authorized from this gate. Distinct from T-X034 (ChatGPT Ads SANDBOX→LIVE) and T-US-011 (analyze-only connect). Not sandbox/prod VERIFIED.

**T-US-015** is fixture ACCEPTED only via the Connect Claude Code + test API EVAL_ONLY proof (`CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY`) — Claude Code runtime and Claude test-API readiness are separately visible; both bind EVAL_ONLY; live eval wiring stays NOT_WIRED; operational capability refused. Distinct from T-US-016 (runtime vs API eval auth) and T-US-018/T-X037 (operational tool forbid). Not sandbox/prod VERIFIED.

**T-US-016** is fixture ACCEPTED only via the Claude runtime vs API eval auth separated proof (`CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED`) — credential-broker mint/reveal deny for claude-runner and evaluation-worker; EVAL_ONLY evaluation-worker isolation ≠ Claude LIVE_CLI runtime auth; live NOT_WIRED; `externalEffects: NONE`. Distinct from T-US-015 (connect EVAL_ONLY summary) and T-US-018/T-X037 (operational tool forbid). Not sandbox/prod VERIFIED.

**T-US-017** is fixture ACCEPTED only via the Connect Gemini evaluation EVAL_ONLY proof (`CONNECT_GEMINI_EVALUATION_EVAL_ONLY`) — data-use decision, broker-held masked credential, model/capability snapshot, FIXED_CORPUS or OPEN_WEB test mode; EVAL_ONLY only; live NOT_WIRED; cannot publish or respond to customers. Distinct from T-US-015 (Claude Code + test API) and T-US-018/T-X037 (operational tool forbid). Not sandbox/prod VERIFIED.

**T-US-019** is fixture ACCEPTED only via the Map CRM/forms/booking failure/recovery proof (`MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY`) — Zoho environment binding, form→CRM contract, canary grant/retention, booking capability matrix, correlated journey evidence, passing failure→recovery; live Zoho NOT_WIRED; commercialExcluded. Distinct from T-US-039 (continuous cadence/heartbeat) and T-US-040 (thank-you ≠ CRM). Not sandbox/prod VERIFIED.

**T-US-020** is fixture ACCEPTED only via the synthetic leads classified no commerce pollution proof (`SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION`) — canary classified with `synthetic=true` + `ws_synthetic=true` + matching correlation; commerce projection excludes synthetics; `synthetic && countedInCommerce` refused; live Zoho NOT_WIRED. Distinct from T-X052 (conversion contamination) and T-X050 (public flag grant). Not sandbox/prod VERIFIED.

**T-US-021** is fixture ACCEPTED only via the Connect local/social/inbox test artifact and capability proof (`CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT`) — each enabled destination has account/asset IDs, FIXTURE_AUTH_OK, per-action capability matrix (post/review/message/read-back), destination contract, support policy with escalation recipients, and an authorized test artifact; live provider wiring stays NOT_WIRED. Distinct from T-US-022 (unsupported destination capabilities) and T-X045 (partial campaign destinations). Not sandbox/prod VERIFIED.

**T-US-022** is fixture ACCEPTED only via the unsupported destination capabilities respected proof (`UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED`) — each destination's declared capability matrix is enforced; unsupported actions are refused; false success claims are refused; live provider wiring stays NOT_WIRED. Distinct from T-US-021 (connect test artifact), T-X045 (partial campaign destinations), and T-X046 (unsupported blog destination). Not sandbox/prod VERIFIED.

**T-US-023** is fixture ACCEPTED only via the standing autonomy grant control receipts proof (`STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS`) — scope snapshot, versioned authority draft, policy constraints (inference vs ad-spend), policy test matrix (allowed + blocked), owner-signed grant + audit event, and pause / stop-writes / pause-replies control receipts; live provider wiring stays NOT_WIRED; ad spend never a side effect. Distinct from T-US-024 (agent cannot widen grant) and T-US-060 (emergency stop at commit). Not sandbox/prod VERIFIED.

**T-US-025** is fixture ACCEPTED only via the launch workstream schedule mission outcome proof (`LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME`) — objective + pilot scope, readiness gates, dry rehearsal with externalEffects NONE, frequency/timezone/change cooldown, owner-reviewed launch receipt, and mission outcome + next action; live provider wiring stays NOT_WIRED; burst republish refused. Distinct from T-US-026 (missed-schedule coalesce / no burst) and T-X015 (DST recurring schedule no duplicates). Not sandbox/prod VERIFIED.

**T-US-026** is fixture ACCEPTED only via the missed schedule coalesce no burst republish proof (`MISSED_SCHEDULE_COALESCE_NO_BURST`) — cadence-derived content/social misses, single catch-up after fixture publish decision, burst republish of every missed post refused; live provider wiring stays NOT_WIRED. Distinct from T-X001 (monitoring probe coalesce), T-X015 (DST no duplicates), and T-US-025 (workstream launch). Not sandbox/prod VERIFIED.

**T-US-027** is fixture ACCEPTED only via the demand page improvement release receipt proof (`DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT`) — observation IDs, intent-to-page match, visibility mission + content brief, exact revision diff, independent QA bundle, release receipt and experiment window; keyword proliferation refused; live provider wiring stays NOT_WIRED. Distinct from T-US-025 (workstream launch), T-US-026 (missed-schedule coalesce), and T-US-028 (prefer one useful update / keyword proliferation). Not sandbox/prod VERIFIED.

**T-US-028** is fixture ACCEPTED only via the keyword proliferation one useful update proof (`KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE`) — many thin keyword pages refused with blocking decision, preserved inputs, current state BLOCKED, and recovery path COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE; one useful verified editable page update preferred; false success claims refused; live provider wiring stays NOT_WIRED. Distinct from T-US-027 (demand→page improvement release receipt). Not sandbox/prod VERIFIED.

**T-US-029** is fixture ACCEPTED only via the campaign manifest distribution proof (`CAMPAIGN_MANIFEST_DISTRIBUTION`) — brief with source IDs, editable versioned draft, independent QA findings, per-destination previews, eligible destination receipts, blocked channels with visible recovery actions, measurement state, and campaign manifest; false live success claims refused; live provider wiring stays NOT_WIRED. Distinct from T-X045 (partial campaign destinations), T-US-022 (unsupported destination capabilities), and T-US-030 (uncertain post reconcile). Not sandbox/prod VERIFIED.

**T-US-030** is fixture ACCEPTED only via the uncertain post reconcile-before-retry proof (`UNCERTAIN_POST_RECONCILE_BEFORE_RETRY`) — blind retry refused while remote outcome is uncertain; reconcile/read-back required; VERIFIED_PRESENT refuses retry (no double-post); VERIFIED_ABSENT authorizes a linked retry; false success claims refused; live provider wiring stays NOT_WIRED. Distinct from T-US-048/T-X020 (general unknown-remote resume), T-X017 (stop-after-dispatch), T-US-029 (campaign manifest), and T-X045 (partial destinations). Not sandbox/prod VERIFIED.

**T-US-031** is fixture ACCEPTED only via the paid-media recommendation mutation-or-failure proof (`PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE`) — Google Ads recommendation decision recorded; approve+execute yields honest LIVE_MUTATION_NOT_WIRED failure; ChatGPT Ads ACCESS_BLOCKED; shared-budget unknown and missing delivery inspection fail closed; false live-verified mutation claims refused; live provider wiring stays NOT_WIRED. Distinct from T-US-011 (analyze-only), T-US-012 (test vs production), T-US-032 (financial boundaries), and T-X034–T-X036 (Ads edge cases). Not sandbox/prod VERIFIED.

**T-US-033** is fixture ACCEPTED only via the eval suite adjudication + backlog proof (`EVAL_SUITE_ADJUDICATION_BACKLOG`) — versioned Claude/Gemini EVAL_ONLY suite with condition manifest, run authorization, redaction/fixture check, case result artifacts, and failed-case adjudication linked to remediation backlog; production writes refused; false live-verified suite claims refused; live eval wiring stays NOT_WIRED. Distinct from T-US-015 (Claude Code + test API connect), T-US-017 (Gemini connect), T-US-018/T-X037 (operational tool forbid), and T-X038 (no-grounding fail closed). Not sandbox/prod VERIFIED.

**T-US-034** is fixture ACCEPTED only via the provider-error-not-pass proof (`PROVIDER_ERROR_NOT_PASS`) — distinct outcome statuses (pass/fail/provider_error/refusal/…); provider_error never graded as pass or fail; pass-rate denominator excludes infrastructure errors; false live-verified grading refused; live eval wiring stays NOT_WIRED. Distinct from T-X039/T-US-058 (metric observation denominators), T-US-033 (suite adjudication + backlog), and T-X038 (no-grounding fail closed). Not sandbox/prod VERIFIED.

**T-US-035** is fixture ACCEPTED only via the review/revise/release receipt-or-blocked proof (`REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED`) — review item + revision, evidence summary, human-readable diff, QA bundle, independent decision bound to revision and policy; approve yields release receipt or blocked exception; self-approval and stale approval refused; live provider wiring stays NOT_WIRED. Distinct from T-US-027 (demand→page improvement release receipt), T-US-036/T-X019 (stale approval invalidated), and T-US-054/T-X018 (self-approval rejected alone). Not sandbox/prod VERIFIED.

**T-US-049** is fixture ACCEPTED only via the daily owner review operating knowledge proof (`DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE`) — evidence-backed morning brief, completed-work ledger linked to revision/receipt, exception decision records, outcome/cost view with synthetic excluded, new bounded mission within approved scope, and versioned playbook learning that never silently expands authority; live provider wiring stays NOT_WIRED. Distinct from T-US-050 (owner brief groups root cause), T-US-025 (launch workstream schedule mission outcome), and T-US-035 (review/revise/release). Not sandbox/prod VERIFIED.

**T-US-050** is fixture ACCEPTED only via the owner brief root-cause actionable proof (`OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE`) — repeated incident signals fold into root-cause groups with actionable next steps; ungrouped notification floods and non-actionable groups are refused; live provider wiring stays NOT_WIRED. Distinct from T-US-049 (daily owner review operating knowledge) and T-X068 (thirty alerts one outage). Not sandbox/prod VERIFIED.

**T-US-051** is fixture ACCEPTED only via the design/release readiness packet proof (`DESIGN_RELEASE_READINESS_PACKET`) — test context, interaction trace, accessibility findings, state coverage matrix (empty/loading/stale/partial/failed), SC-01..SC-25 coverage register, and release acceptance packet with outcome evidence; incomplete coverage and evidence-free approve refused; live provider wiring stays NOT_WIRED. Distinct from T-US-035 (review/revise/release), T-US-049 (daily owner review), and T-US-055 (keyboard journey). Not sandbox/prod VERIFIED.

**T-US-053** is fixture ACCEPTED only via the secrets never in browser assets proof (`SECRETS_NEVER_IN_BROWSER_ASSETS`) — browser-served JS/HTML/CSS/service-worker/public-env assets must not embed API keys, tokens, broker secrets, private keys, or OAuth client secrets; public-env secret embeds and broker-secret ship attempts refused; live provider wiring stays NOT_WIRED. Distinct from T-X065 (worker browser auth OS deny), T-X005 (forged browser role), T-F24/T-US-047 (rotation secretsExported), and T-X063 (prompt-injection exfil). Not sandbox/prod VERIFIED.

**T-US-055** is fixture ACCEPTED only via the complete keyboard journey with reduced motion proof (`KEYBOARD_JOURNEY_REDUCED_MOTION`) — nav→content→dialog→primary CTA keyboard path with prefers-reduced-motion honored; motion that ignores reduced-motion preference, missing focus rings, pointer-only steps, and incomplete journeys refused; live provider wiring stays NOT_WIRED. Distinct from T-X061 (dialog focus restore) and T-US-051 (design/release readiness packet). Not sandbox/prod VERIFIED.

**T-US-059** is fixture ACCEPTED only via the shared briefs redacted / private evidence retained proof (`SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED`) — shareable brief must be redacted with zero private fields; private evidence retained in private vault (not discarded, not shipped into shared export); unredacted share / discard-on-share / private-field leak refused; live provider wiring stays NOT_WIRED. Distinct from T-US-050 (owner brief root-cause), T-US-053 (secrets never in browser assets), and soak `redactEvidenceSummary` (string scrub). Not sandbox/prod VERIFIED.

### Happy-path / documented flow completions
- **T-US-001** Create a trusted local workspace (F01/SC-02) — blockers and next actions. *(fixture ACCEPTED — trusted workspace readiness blockers/next-actions proof; not sandbox/prod VERIFIED)*
- **T-US-003** Choose folders and establish business truth (F02/SC-20) — restore evidence; secrets excluded.
- **T-US-005** Map sites, pages and editable sources (F03/SC-06) — baseline ID and checks. *(fixture ACCEPTED — site/page/editable sources baseline proof; distinct from T-F03; not sandbox/prod VERIFIED)*
- **T-US-007** Connect GA4 (F04/SC-18) — ready-read and next sync. *(fixture ACCEPTED — connect GA4 read-ready next sync proof; not sandbox/prod VERIFIED)*
- **T-US-009** Connect Search Console (F05/SC-18) — schedule and watermark. *(fixture ACCEPTED — connect GSC schedule and watermark proof; not sandbox/prod VERIFIED)*
- **T-US-011** Connect Google Ads analyze-only (F06/SC-18) — write disabled. *(fixture ACCEPTED — Google Ads analyze-only save/reload proof; not sandbox/prod VERIFIED)*
- **T-US-013** Connect ChatGPT Ads (F07/SC-18) — read-ready; write denial; transport/entitlement gate.
- **T-US-015** Connect Claude Code + test API (F08/SC-18) — EVAL_ONLY. *(fixture ACCEPTED — connect Claude Code + test API EVAL_ONLY proof; not sandbox/prod VERIFIED)*
- **T-US-017** Connect Gemini evaluation (F09/SC-18) — EVAL_ONLY. *(fixture ACCEPTED — connect Gemini evaluation EVAL_ONLY proof; not sandbox/prod VERIFIED)*
- **T-US-019** Map CRM/forms/booking (F10/SC-16) — failure/recovery scenario. *(fixture ACCEPTED — map CRM/forms/booking failure/recovery proof; not sandbox/prod VERIFIED)*
- **T-US-021** Connect local/social/inbox (F11/SC-18) — test artifact and capability. *(fixture ACCEPTED — connect local/social/inbox test artifact and capability proof; not sandbox/prod VERIFIED)*
- **T-US-023** Grant standing autonomy (F12/SC-19) — control tests with receipts. *(fixture ACCEPTED — standing autonomy grant control receipts proof; not sandbox/prod VERIFIED)*
- **T-US-025** Launch workstream and schedule (F13/SC-02) — mission outcome. *(fixture ACCEPTED — launch workstream schedule mission outcome proof; not sandbox/prod VERIFIED)*
- **T-US-027** Demand → page improvement (F14/SC-07) — release receipt and experiment window. *(fixture ACCEPTED — demand page improvement release receipt proof; not sandbox/prod VERIFIED)*
- **T-US-029** Original campaign distribution (F15/SC-08) — campaign manifest. *(fixture ACCEPTED — campaign manifest distribution proof; not sandbox/prod VERIFIED)*
- **T-US-031** Paid-media recommendations (F16/SC-13) — verified mutation or failure. *(fixture ACCEPTED — paid-media recommendation mutation-or-failure proof; not sandbox/prod VERIFIED)*
- **T-US-033** Claude/Gemini eval suites (F17/SC-14) — adjudication + backlog. *(fixture ACCEPTED — eval suite adjudication + backlog proof; not sandbox/prod VERIFIED)*
- **T-US-035** Review/revise/release (F18/SC-05) — release receipt or blocked exception. *(fixture ACCEPTED — review/revise/release receipt-or-blocked proof; not sandbox/prod VERIFIED)*
- **T-US-037** Analyze and hypothesis (F19/SC-12) — portable analysis artifact. *(fixture ACCEPTED — portable analysis artifact proof; not sandbox/prod VERIFIED)*
- **T-US-039** Form→CRM continuous verify (F20/SC-15) — cadence/heartbeat. *(fixture ACCEPTED — form→CRM continuous verify cadence/heartbeat proof; not sandbox/prod VERIFIED)*
- **T-US-041** Diagnose/repair defect (F21/SC-21) — verified resolution or handoff. *(fixture ACCEPTED — diagnose/repair defect resolved or handoff proof; not sandbox/prod VERIFIED)*
- **T-US-043** After-hours + takeover (F22/SC-17) — acknowledged handoff. *(fixture ACCEPTED — after-hours handoff acknowledged proof; not sandbox/prod VERIFIED)*
- **T-US-045** Semantic search / no-result (F23/SC-11) — evaluation comparison. *(fixture ACCEPTED — semantic search no-result evaluation comparison proof; not sandbox/prod VERIFIED)*
- **T-US-047** Recover/rotate/reconcile (F24/SC-18) — offboarding manifest. *(fixture ACCEPTED — recover/rotate/reconcile proof; not sandbox/prod VERIFIED)*
- **T-US-049** Daily owner review (F25/SC-01) — reviewed operating knowledge. *(fixture ACCEPTED — daily owner review operating knowledge proof; not sandbox/prod VERIFIED)*
- **T-US-051** Design/release readiness (F26/SC-23) — release acceptance packet. *(fixture ACCEPTED — design/release readiness packet proof; not sandbox/prod VERIFIED)*

### Failure / gate cases (evidence: blocking decision, preserved inputs, current state, recovery path)
- **T-US-002** Competing supervisors refused; no duplicate leases. *(fixture ACCEPTED — competing-supervisor / singleton host-lease proof; not sandbox/prod VERIFIED)*
- **T-US-004** Unsafe folders / unresolved facts blocked; safe facts usable. *(fixture ACCEPTED — unsafe folders / unresolved facts blocked proof; not sandbox/prod VERIFIED)*
- **T-US-006** Unbound URL: analysis ok, write blocked. *(fixture ACCEPTED — unbound write path fail-closed proof; not sandbox/prod VERIFIED)*
- **T-US-008** GA4 debug validation ≠ measured receipt *(fixture ACCEPTED)*.
- **T-US-010** Missing GSC rows ≠ zero demand *(fixture ACCEPTED)*.
- **T-US-012** Google Ads test vs production access separated. *(fixture ACCEPTED — Google Ads test vs production access separated proof; not sandbox/prod VERIFIED)*
- **T-US-014** ChatGPT Ads key/account identity mismatch refuses bind.
- **T-US-016** Claude runtime vs API eval auth separated.
- **T-US-018** Gemini never used for publish/CRM/customer reply. *(fixture ACCEPTED — EVAL_ONLY operational tool forbidden proof; not sandbox/prod VERIFIED)*
- **T-US-020** Synthetic leads classified; no commerce pollution. *(fixture ACCEPTED — synthetic leads classified no commerce pollution proof; not sandbox/prod VERIFIED)*
- **T-US-022** Unsupported destination capabilities respected. *(fixture ACCEPTED — unsupported destination capabilities respected proof; not sandbox/prod VERIFIED)*
- **T-US-024** Agent cannot widen its own grant. *(fixture ACCEPTED — agent cannot widen grant proof; not sandbox/prod VERIFIED)*
- **T-US-026** Missed schedules coalesce; no burst republish. *(fixture ACCEPTED — missed schedule coalesce no burst republish proof; not sandbox/prod VERIFIED)*
- **T-US-028** Prefer one useful page update over keyword proliferation. *(fixture ACCEPTED — keyword proliferation one useful update proof; not sandbox/prod VERIFIED)*
- **T-US-030** Uncertain post: reconcile before retry. *(fixture ACCEPTED — uncertain post reconcile-before-retry proof; not sandbox/prod VERIFIED)*
- **T-US-032** Exact financial boundaries preserved. *(fixture ACCEPTED — exact financial boundaries preserved proof; not sandbox/prod VERIFIED)*
- **T-US-034** Provider error ≠ bad answer or pass. *(fixture ACCEPTED — provider-error-not-pass proof; not sandbox/prod VERIFIED)*
- **T-US-036** Stale approval invalidated on revision change. *(fixture ACCEPTED — approved payload edit invalidated proof; not sandbox/prod VERIFIED)*
- **T-US-038** Double-counted attribution avoided in unique outcomes.
- **T-US-040** Thank-you without Zoho record fails at CRM *(fixture ACCEPTED)*.
- **T-US-042** Repair cannot weaken protected tests. *(fixture ACCEPTED — repair weaken test rejected proof; not sandbox/prod VERIFIED)*
- **T-US-044** Takeover cancels unsent agent replies. *(fixture ACCEPTED — takeover cancels unsent proof; not sandbox/prod VERIFIED)*
- **T-US-046** Hard search constraints enforced; no invented availability *(fixture ACCEPTED)*.
- **T-US-048** Unknown remote effects reconciled before resume. *(fixture ACCEPTED — soak unknown-remote reconcile proof; not sandbox/prod VERIFIED)*
- **T-US-050** Owner brief groups root cause; actionable. *(fixture ACCEPTED — owner brief root-cause actionable proof; not sandbox/prod VERIFIED)*
- **T-US-052** Mocked connector ≠ production-ready. *(fixture ACCEPTED — mocked connector not production-ready proof; not sandbox/prod VERIFIED)*

### Cross-cutting (T-US-053–T-US-060)
- **T-US-053** Secrets never in browser assets. *(fixture ACCEPTED — secrets never in browser assets proof; not sandbox/prod VERIFIED)*
- **T-US-054** Independent approval enforced (no ordinary self-approval). *(fixture ACCEPTED — self-approval rejected / independent A25 proof; not sandbox/prod VERIFIED)*
- **T-US-055** Complete keyboard journey with reduced motion. *(fixture ACCEPTED — keyboard journey reduced motion proof; not sandbox/prod VERIFIED)*
- **T-US-056** Honest outage; durable hosted contact path. *(fixture ACCEPTED — honest outage hosted contact path proof; not sandbox/prod VERIFIED)*
- **T-US-057** Cross-workspace resource substitution rejected. *(fixture ACCEPTED — cross-workspace resource substitution proof; not sandbox/prod VERIFIED)*
- **T-US-058** Synthetic excluded from business denominators *(fixture ACCEPTED)*.
- **T-US-059** Shared briefs redacted; private evidence retained. *(fixture ACCEPTED — shared briefs redacted / private evidence retained proof; not sandbox/prod VERIFIED)*
- **T-US-060** Emergency stop checked at commit time. *(fixture ACCEPTED — emergency-stop / outbound-stop at commit proof; not sandbox/prod VERIFIED)*

---

## Platform / security / resilience probes (T-X001–T-X073)

Level as labeled | Status: NOT_RUN unless listed under fixture ACCEPTED below | Environment: fixture/integration; live only when separately approved.

**Fixture ACCEPTED (M9 soak evidence, not live VERIFIED):** T-X001, T-X002, T-X003, T-X004, T-X005, T-X006, T-X007, T-X008, T-X009, T-X010, T-X011, T-X012, T-X013, T-X014, T-X015, T-X016, T-X017, T-X018, T-X019, T-X020, T-X021, T-X022, T-X023, T-X024, T-X025, T-X026, T-X027, T-X028, T-X029, T-X030, T-X031, T-X032, T-X033, T-X034, T-X035, T-X036, T-X037, T-X038, T-X039, T-X040, T-X041, T-X042, T-X043, T-X044, T-X045, T-X046, T-X047, T-X048, T-X049, T-X050, T-X051, T-X052, T-X053, T-X054, T-X055, T-X056, T-X057, T-X058, T-X059, T-X060, T-X061, T-X062, T-X063, T-X064, T-X065, T-X066, T-X067, T-X068, T-X069, T-X070, T-X071, T-X072, T-X073.

**T-X021** is fixture ACCEPTED only via `CONCURRENT_IDEMPOTENT_RELEASE` (barrier+mutex one dispatch; not retry-only NO_DUPLICATE_EFFECTS). Not sandbox/prod VERIFIED.

**T-X025** is fixture ACCEPTED only via the external human edit during staging conflict-retained proof (`EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED`) — base-revision pin, human edit retains CONFLICT, blind overwrite forbidden; ACCEPTED ≠ VERIFIED. Not sandbox/prod VERIFIED.

**T-X001** is fixture ACCEPTED only via the host-sleep monitoring coverage-gap coalesce proof (`HOST_SLEEP_MONITORING_COVERAGE_GAP`) — cadence-derived misses, catch-up probe required, no burst. Not sandbox/prod VERIFIED.

**T-X015** is fixture ACCEPTED only via the DST recurring schedule no-duplicates proof (`DST_RECURRING_SCHEDULE_NO_DUPLICATES`) — America/New_York civil occurrence keys; spring-forward gap skipped; fall-back ambiguous hour claims once across durable reload. Not sandbox/prod VERIFIED.

**T-X066** is fixture ACCEPTED only via the backup / omit-receipt / post-restore reconcile proof (`BACKUP_OMIT_RECEIPT`). Retry-only no-duplicate-effects does **not** satisfy this case. Not sandbox/prod VERIFIED.

**T-F01** is fixture ACCEPTED only via the create trusted local workspace complete F01 evidence proof (`CREATE_TRUSTED_LOCAL_WORKSPACE`) — owner session, workspace configuration revision, timestamped diagnostics (not a decorative online badge), Observe initial authority, startup result + recovery test, and explicit blockers with next actions; public writes refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-001 readiness blockers/next-actions summary. Never silently VERIFIED for live.

**T-F02** is fixture ACCEPTED only via the choose folders establish business truth complete F02 evidence proof (`CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH`) — registered root IDs + write/read probe, storage-risk checks, ingestion manifest with duplicate detection, business fact records with unresolved conflicts, signed fact revision + impacted assets, and restore rehearsal evidence with secrets excluded; public claims from unresolved refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-003 folders-ready happy-path summary. Never silently VERIFIED for live.

**T-F03** is fixture ACCEPTED only via the map sites pages editable sources complete F03 evidence proof (`MAP_SITES_PAGES_EDITABLE_SOURCES`) — domain/URL inventory with source counts and exclusions, timestamped HTML and screenshot snapshot, CMS/repo source binding and deployment target, journey graph with owners, scope grant draft (editable subset + exclusions; unbound remain read-only), and baseline ID with passing/failing checks; 100% coverage claims when discovery is incomplete, wrong-environment publish, redirects outside allowed domain, and unbound page writes refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-005 baseline-ID happy-path summary. Never silently VERIFIED for live.

**T-US-005** is fixture ACCEPTED only via the site/page/editable sources baseline proof (`SITE_PAGE_EDITABLE_SOURCES_BASELINE`) — authorized domain + URL boundaries; pilot page CMS/repo binding; form/CRM destinations; editable subset/exclusions; deterministic page checks mint a fixture baseline ID with a proven release path. Distinct from T-F03 complete F03 evidence. Not sandbox/prod VERIFIED.


**T-F04** is fixture ACCEPTED only via the connect Google Analytics 4 complete F04 evidence proof (`CONNECT_GOOGLE_ANALYTICS_4`) — grant scopes and connection identity, confirmed property-to-site binding (account, GA4 property, web stream), versioned event dictionary with owner and explicit mapping gaps, bounded sample report (provider request ID, dimensions, rows, coverage), three distinct measurement test outcomes, and READ_READY with next sync (write unauthorized); write saves, debug→delivered conversion claims, wrong property kinds, and false live-verified claims refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-007 ready-read/next-sync summary. Never silently VERIFIED for live.


**T-US-011** is fixture ACCEPTED only via the connect Google Ads analyze-only proof (`CONNECT_GOOGLE_ADS_ANALYZE_ONLY`) — analyze-only save/reload with deny-write, inventory id uniqueness, conversion mapping coverage, Ads scope, read receipt + source watermark; WRITE / LIVE / NOT_WIRED / UNAVAILABLE refused; persist/reload via in-memory fixture store; live provider wiring stays **NOT_WIRED**. Distinct from T-F06 complete F06 evidence package and T-US-012 test vs production access separated. Never silently VERIFIED for live.

**T-US-009** is fixture ACCEPTED only via the connect GSC schedule and watermark proof (`CONNECT_GSC_SCHEDULE_WATERMARK`) — fixture Search Console domain/URL-prefix property saved read-only as `READ_READY` with daily read schedule and source watermark; WRITE refused; live NOT_WIRED; `applyAttemptCount=0`; distinct from T-F05 complete F05 package. Not sandbox/prod VERIFIED.

**T-US-007** is fixture ACCEPTED only via the connect GA4 read-ready and next sync proof (`CONNECT_GA4_READ_READY_NEXT_SYNC`) — read-only fixture property→site bind as `READ_READY` with `nextSyncAtIso`, versioned event-dictionary gaps, bounded sample report; WRITE save and LIVE transport refuse; `applyAttemptCount=0`; live GA4 remains **NOT_WIRED**. Distinct from T-F04 complete CONNECT_GOOGLE_ANALYTICS_4 evidence package. Not sandbox/prod VERIFIED.

**T-F05** is fixture ACCEPTED only via the connect Search Console organic visibility complete F05 evidence proof (`CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY`) — identity, scopes and API readiness, exact domain or URL-prefix property binding, comparable-query configuration (country, device, search type, comparison window), observation batch with coverage notes and sitemap status, high-value intent→page mapping, and daily read schedule with source watermark (write unauthorized); write saves, inventing zero demand from omitted rows, and false live-verified claims refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-009 schedule/watermark summary. Never silently VERIFIED for live.

**T-F06** is fixture ACCEPTED only via the connect Google Ads controlled analysis complete F06 evidence proof (`CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS`) — project and access-tier evidence, Google identity + Ads scopes, consent plus application-level deny-write rule, client customer (+ optional manager) binding with TEST/PRODUCTION badge, campaign and conversion-action inventory, conversion→business-event mapping with discrepancy tasks, read receipt + source watermark, and READ_READY Analyze-only (write/spend unauthorized); write/spend saves, PRODUCTION tier on fixture, and false live-verified claims refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-011 analyze-only save/reload summary and T-US-012 test vs production access separated. Never silently VERIFIED for live.

**T-F08** is fixture ACCEPTED only via the connect Claude Code and Claude test API complete F08 evidence proof (`CONNECT_CLAUDE_CODE_AND_TEST_API`) — local Claude Code installation + authentication diagnostic, broker-held masked test-API credential binding, dated model catalog with discovered models, evaluation model + max-cost budget policy revision, consented synthetic smoke-test artifact + usage ledger, and EVAL_ONLY capability with test adapter enabled; operational capability, false live-verified claims, and live eval wiring refused; live eval wiring stays **NOT_WIRED**. Distinct from T-US-015 EVAL_ONLY connect summary and T-US-016 runtime vs API eval auth. Never silently VERIFIED for live.

**T-F09** is fixture ACCEPTED only via the connect Gemini independent testing complete F09 evidence proof (`CONNECT_GEMINI_INDEPENDENT_TESTING`) — data-use decision, broker-held masked restricted credential, dated model/capability snapshot with supported tools, evaluation condition (fixed-corpus or open-web), consented synthetic smoke under the displayed budget cap with provider response receipt, and EVAL_ONLY connection state (cannot publish or respond to customers); operational capability, false live-verified claims, and live eval wiring refused; live eval wiring stays **NOT_WIRED**. Distinct from T-US-017 EVAL_ONLY connect summary and T-US-018/T-X037 operational tool forbid. Never silently VERIFIED for live.

**T-F10** is fixture ACCEPTED only via the map CRM/forms/booking truth complete F10 evidence proof (`MAP_CRM_FORMS_BOOKING_TRUTH`) — Zoho organization/region/environment binding, form→CRM field contract with assignment rules, canary grant + retention policy, booking inventory/receipt capability matrix, correlated journey evidence, and a passing failure→recovery scenario; live booking mutate, commerce pollution, production environment, and false live-verified claims refused; live Zoho wiring stays **NOT_WIRED**. Distinct from T-US-019 failure/recovery readiness summary, T-US-039 continuous cadence/heartbeat, and T-US-040 thank-you ≠ CRM. Never silently VERIFIED for live.

**T-F11** is fixture ACCEPTED only via the connect local/social/inbox channels complete F11 evidence proof (`CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS`) — per-destination account/asset IDs, authentication results, per-action capability matrices, destination contracts (approved formats + location boundaries), support hours policy with escalation recipients, and an authorized test artifact with ready capability; live publish, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-021 connect readiness summary, T-US-022 unsupported destination capabilities, and T-X045 partial campaign destinations. Never silently VERIFIED for live.

**T-F12** is fixture ACCEPTED only via the grant standing autonomy safely complete F12 evidence proof (`GRANT_STANDING_AUTONOMY_SAFELY`) — workstream/scope snapshot, autonomy mode (Observe / Draft / Review required / Bounded automatic), versioned authority draft, policy constraints (limits/expiry/notifications/exclusions with inference vs ad-spend separated), policy test matrix (allowed + blocked previews), owner-signed grant + audit event, and pause / stop-writes / pause-replies control-test receipts; agent self-approve, ad-spend side effects, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-023 control-receipts readiness summary, T-US-024 agent cannot widen grant, and T-US-060 emergency stop at commit. Never silently VERIFIED for live.

**T-F13** is fixture ACCEPTED only via the launch workstream and recurring schedule complete F13 evidence proof (`LAUNCH_WORKSTREAM_RECURRING_SCHEDULE`) — objective + pilot scope, readiness gates checklist, plan with affected assets + estimated cost, dry rehearsal with externalEffects NONE, frequency/timezone/change cooldown schedule, owner-reviewed launch receipt, and mission outcome + next action; burst republish, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-025 launch readiness summary, T-US-026 missed-schedule coalesce / no burst, and T-X015 DST recurring schedule no duplicates. Never silently VERIFIED for live.

**T-F14** is fixture ACCEPTED only via the turn demand into a page improvement complete F14 evidence proof (`TURN_DEMAND_INTO_PAGE_IMPROVEMENT`) — observation IDs, intent-to-page match, visibility mission with task plan + content brief, proposed answer/metadata/internal-links review, exact revision diff, independent QA bundle, policy release receipt + experiment window, and measurable change observation; keyword proliferation, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-027 release receipt / experiment window summary, T-US-028 keyword proliferation / one useful update, and T-US-035 review/revise/release. Never silently VERIFIED for live.

**T-F15** is fixture ACCEPTED only via the create and distribute an original campaign complete F15 evidence proof (`CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN`) — approved facts + venue media + authorized destination capabilities, brief with source IDs and outcome, editable versioned draft, QA findings (utility/brand/sources/accessibility) with revision hash, per-destination previews, canonical page publish receipt, independent provider outcomes, campaign manifest, measurement/outcome collection, and distribution review; unauthorized destination publish, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-029 campaign-manifest summary, T-X045 partial destinations, T-US-022 unsupported capabilities, and T-US-030 uncertain post reconcile. Never silently VERIFIED for live.

**T-F16** is fixture ACCEPTED only via the review Google and ChatGPT paid-media recommendations complete F16 evidence proof (`REVIEW_PAID_MEDIA_RECOMMENDATIONS`) — read-ready account selection with comparable settled data + conversion context, reproducible analysis definition, evidence-backed delivery diagnosis (before conversion), typed change proposal, revision-bound financial diff with known shared-budget impact, authorization record, and verified mutation or explicit honest failure; ChatGPT Ads without verified local transport/entitlement stays **ACCESS_BLOCKED**; false live-verified mutation claims and live provider wiring refused; live Ads mutate stays **NOT_WIRED**. Distinct from T-US-031 decision+execute-failure summary, T-US-011 analyze-only, T-US-012 test vs production, T-US-032 exact financial boundaries, and soft-skipped ChatGPT Ads connect cases T-F07/T-US-013/T-US-014. Never silently VERIFIED for live.

**T-F20** is fixture ACCEPTED only via the verify form-to-CRM journey continuously complete F20 evidence proof (`VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY`) — controlled canary identity + target environment + test permission, declared journey + device, synthetic-data safety gate, per-step timestamps with correlation ID, journey graph, pass-or-named-failure outcome (incident + owner when failed), and cadence/heartbeat history within allowed load; commerce pollution, false live-verified claims, and live Zoho wiring refused; live Zoho wiring stays **NOT_WIRED**. Distinct from T-US-039 cadence/heartbeat summary, T-F10/T-US-019 CRM map / failure→recovery, and T-US-040 thank-you ≠ CRM. Never silently VERIFIED for live.

**T-F22** is fixture ACCEPTED only via the handle after-hours messages and take over complete F22 evidence proof (`HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER`) — response policy (coverage hours, allowed questions, escalation owner), inbound conversation + message versions, sources and allowed-action evaluation, message receipt + CRM lead link, ownership audit takeover, and acknowledged morning handoff; competing replies, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-043 acknowledged handoff summary, T-US-044/T-X053 takeover cancels unsent, T-X055 unknown-policy escalate, and T-X056 bounded auto-reply loop. Never silently VERIFIED for live.

**T-F18** is fixture ACCEPTED only via the review, revise and release a change complete F18 evidence proof (`REVIEW_REVISE_AND_RELEASE_A_CHANGE`) — review-queue selection, why-proposed evidence summary, human-readable before/after + source drawer, technical/factual/policy gate inspection, QA bundle, independent decision bound to exact revision + policy, and release track/verify (receipt or blocked exception); self-approval, stale approval, production write, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-035 receipt-or-blocked summary, T-US-036/T-X019 stale approval, and T-US-054/T-X018 self-approval alone. Never silently VERIFIED for live.

**T-F21** is fixture ACCEPTED only via the diagnose and repair a permitted defect complete F21 evidence proof (`DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT`) — incident bundle with business-impact evidence, source binding + one-asset limit, bounded repair policy, repair plan with source revision/worktree/lease, patch diff + regression + attempt ledger, independent review (author cannot self-approve), canary release with read-back + repeated original journey, and verified resolution or acknowledged human handoff; weaken-test proposals, false live-verified claims, and live CMS repair wiring refused; live CMS repair stays **NOT_WIRED**. Distinct from T-US-041 canary resolve/handoff path, T-US-042/T-X057 weaken-test reject, and T-X058 attempt-limit escalate. Never silently VERIFIED for live.

**T-US-041** is fixture ACCEPTED only via the diagnose/repair defect resolved or handoff proof (`DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF`) — inject fixture defect → canary fail; restore patches → canary pass → release `SUCCESS` resolves the incident; release `FAILURE` does not invent success and creates an acknowledged human handoff. Live CMS repair remains **NOT_WIRED**. Distinct from T-F21 complete permitted-defect evidence set. Not sandbox/prod VERIFIED.

**T-US-032** is fixture ACCEPTED only via the exact financial boundaries preserved proof (`EXACT_FINANCIAL_BOUNDARIES_PRESERVED`) — paid-media proposals require non-blank `exactChange` and preserve `financialDiff` verbatim; ChatGPT Ads stays `ACCESS_BLOCKED`; live mutations remain `NOT_WIRED`. Not sandbox/prod VERIFIED.

**T-US-001** is fixture ACCEPTED only via the trusted workspace readiness blockers/next-actions proof (`TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS`) — host/Claude/providers/workstreams readiness summary with explicit blockers and next actions; Observe denies publish; ChatGPT Ads ACCESS_BLOCKED; no public writes. Distinct from T-F01 complete F01 evidence set. Not sandbox/prod VERIFIED.

**T-US-037** is fixture ACCEPTED only via the portable analysis artifact proof (`PORTABLE_ANALYSIS_ARTIFACT`) — fixture analysis definition + complete hypothesis + redacted decision brief JSON round-trip; LIVE definition/hypothesis refused. Distinct from T-F19 complete F19 evidence set. Not sandbox/prod VERIFIED.

**T-F26** is fixture ACCEPTED only via the calibrate design and release readiness complete F26 evidence proof (`CALIBRATE_DESIGN_RELEASE_READINESS`) — working prototype + agreed acceptance cases, test context (role/viewport/keyboard/theme), configure-to-outcome interaction trace, accessibility findings, dangerous-actions review, empty/loading/stale/partial/failed state coverage, handoff-requirements vs implemented-behavior comparison, SC-01..SC-25 route-state verification register, and release acceptance packet with outcome evidence; evidence-free approval, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-051 design/release readiness packet summary, T-US-035 review/revise/release, T-US-049 daily owner review, and T-US-055 keyboard journey. Never silently VERIFIED for live.

**T-F19** is fixture ACCEPTED only via the analyze performance and test a hypothesis complete F19 evidence proof (`ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS`) — saved analysis definition (site/period/comparison/timezone), metric definitions with honest denominators, acquisition/journey/revenue view, channel/page inspection, discrepancy investigation with annotations and drill-through, reconciliation worksheet, hypothesis + measurement plan, experiment record, and redacted portable decision brief with a supported decision (not a vanity score); vanity-score claims, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-037 portable-artifact summary, T-US-031 paid-media recommendation, T-US-058/T-X039 metric denominators honesty alone, and T-X060 currency/timezone mismatch. Never silently VERIFIED for live.

**T-F23** is fixture ACCEPTED only via the test semantic search and improve no-result cases complete F23 evidence proof (`TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT`) — approved catalog + authoritative field ownership, parsed intent with ambiguities, candidate eligibility filter trace, answer/booking handoff review (citations when grounded or explicit uncertainty), judgment record (relevant/wrong/no-match), content or retrieval remediation, and golden-set evaluation comparison; silent false match, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-045 evaluation-comparison focused path, T-US-046/T-X048 hard search constraints, and T-X038 eval no-grounding. Never silently VERIFIED for live.

**T-US-045** is fixture ACCEPTED only via the semantic search no-result evaluation comparison proof (`SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON`) — hard-constraint miss yields honest `NO_RESULT`; judgment + remediation + EVAL_ONLY `COMPARE_GOLDEN` re-run shows improvement after catalog correction; not a silent false match. Distinct from T-F23 complete F23 evidence package. Not sandbox/prod VERIFIED.

**T-F17** is fixture ACCEPTED only via the run Claude and Gemini evaluation suites complete F17 evidence proof (`RUN_CLAUDE_GEMINI_EVALUATION_SUITES`) — EVAL_ONLY Claude + Gemini; curated corpus; budget consent; condition manifests; case-level outcomes; human adjudication + backlog; live NOT_WIRED. Distinct from T-US-033. Never silently VERIFIED for live.

**T-F25** is fixture ACCEPTED only via the operate the daily owner review complete F25 evidence proof (`OPERATE_DAILY_OWNER_REVIEW`) — opened morning brief with evidence-backed summary, overnight change inspection, completed-work ledger linked to revision/receipt, exception decision records, qualified demand view, outcome/cost view with synthetic excluded, new bounded mission within approved scope, and versioned reviewed operating knowledge that never silently expands authority; manufactured urgency, pending-data lift celebration, silent authority expansion, production writes, false live-verified claims, and live provider wiring refused; live provider wiring stays **NOT_WIRED**. Distinct from T-US-049 operating-knowledge summary, T-US-050 root-cause brief, T-US-025 launch workstream, and T-US-035 review/revise/release. Never silently VERIFIED for live.

**T-F24 / T-US-047** are fixture ACCEPTED only via the recover / rotate / reconcile / offboard proof (`RECOVER_ROTATE_RECONCILE`) with the complete F24 evidence set (health timeline, capability stop, rotation record without secrets, reconciliation receipts, recovery test, offboarding manifest + residual obligations). Live provider revoke remains **NOT_WIRED**; never silently VERIFIED for live.

**T-US-002 / T-X002** are fixture ACCEPTED only via the competing-supervisor / singleton host-lease proof (`COMPETING_SUPERVISOR_LEASE`) — second live generation refused, dead-holder reclaim allowed, ownership kill auth fail-closed. Not sandbox/prod VERIFIED.

**T-X018 / T-US-054** are fixture ACCEPTED only via the self-approval rejected / independent A25 proof (`SELF_APPROVAL_REJECTED`) — ordinary self-approval cannot bind or approve; independent reviewer required. Not sandbox/prod VERIFIED.

**T-X073** is fixture ACCEPTED only via the offboard ACTIVE_TOKEN residual proof (`OFFBOARD_ACTIVE_TOKEN_RESIDUAL`) — offboarding remains incomplete until live provider revoke is wired/performed (`ACTIVE_TOKEN` + `PROVIDER_REVOKE` residuals `BLOCKED_NOT_WIRED`). Live revoke stays **NOT_WIRED**; never silently VERIFIED for live.

**T-US-060** is fixture ACCEPTED only via the emergency-stop / outbound-stop at commit proof (`EMERGENCY_STOP_AT_COMMIT`). Not sandbox/prod VERIFIED.

**T-X005** is fixture ACCEPTED only via the forged browser role ignored proof (`FORGED_BROWSER_ROLE_IGNORED`) — session role binds; client payload `actorRole` cannot escalate. Not sandbox/prod VERIFIED.

**T-X006** is fixture ACCEPTED only via the cross-workspace reference denied proof (`CROSS_WORKSPACE_REFERENCE_DENIED`) — foreign channel/account/asset substitution denied with generic `GRANT_MISSING` (no foreign-id leak). Not sandbox/prod VERIFIED.

**T-X019 / T-US-036** are fixture ACCEPTED only via the approved payload edit invalidated proof (`APPROVED_PAYLOAD_EDIT_INVALIDATED`) — checksum digest conflict and revision change invalidate A25 binding; stale acceptance cannot ship. Not sandbox/prod VERIFIED.

**T-US-057** is fixture ACCEPTED only via the cross-workspace resource substitution proof (`CROSS_WORKSPACE_RESOURCE_SUBSTITUTION`). Not sandbox/prod VERIFIED.

**T-US-024** is fixture ACCEPTED only via the agent cannot widen grant proof (`AGENT_CANNOT_WIDEN_GRANT`). Not sandbox/prod VERIFIED.

**T-US-042** / **T-X057** are fixture ACCEPTED only via the repair weaken test rejected proof (`REPAIR_WEAKEN_TEST_REJECTED`) — all WeakenTestOperation values + hyphen/casing aliases fail closed; `__tests__/` paths protected; live CMS repair `NOT_WIRED`. Not sandbox/prod VERIFIED.

**T-US-044** / **T-X053** are fixture ACCEPTED only via the takeover cancels unsent replies proof (`TAKEOVER_CANCELS_UNSENT_REPLIES`) — human takeover increments conversation version, cancels multi-queue unsent rows (`BLOCKED_TAKEOVER`), preserves already-SENT messages, and refuses queue/send after ownership flip (`CONVERSATION_TAKEOVER`); pure stale `preparedAtVersion` while agent send is still allowed yields `VERSION_MISMATCH` (T-X053 race); live wiring stays **NOT_WIRED**; `externalEffects=NONE`. Not sandbox/prod VERIFIED.

**T-US-018** / **T-X037** are fixture ACCEPTED only via the EVAL_ONLY operational tool forbidden proof (`EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN`). Not sandbox/prod VERIFIED.

**T-X058** is fixture ACCEPTED only via the repair attempt limit escalated proof (`REPAIR_ATTEMPT_LIMIT_ESCALATED`) — `MAX_REPAIR_ATTEMPTS=2`; after two failed automatic attempts (`TESTS_FAILED` or `GATE_DENIED`) the ticket is `ESCALATED` and a third start is denied (`ATTEMPT_LIMIT`); SUCCESS/`RELEASED` within limit does not premature-escalate; CMS repair stays **NOT_WIRED**; `externalEffects: NONE`. Distinct from T-F21 / T-US-041 / T-US-042/T-X057. Not sandbox/prod VERIFIED.

**T-X069** is fixture ACCEPTED only via the imported doc quarantined as data proof (`IMPORTED_DOC_QUARANTINED_AS_DATA`) — pending/quarantined/rejected imports force `instructionVersion=null` (claimed versions refused); `UNTRUSTED_SOURCE` compile entries stay `instructionEligible=false`; untrusted attachment content is never instruction-eligible. Live wiring stays `NOT_WIRED`. Not sandbox/prod VERIFIED.

**T-X038** is fixture ACCEPTED only via the eval no-grounding fail closed proof (`EVAL_NO_GROUNDING_FAIL_CLOSED`). Not sandbox/prod VERIFIED.

**T-X039** / **T-US-058** are fixture ACCEPTED only via the metric denominators honest proof (`METRIC_DENOMINATORS_HONEST`). Not sandbox/prod VERIFIED.

**T-US-046** / **T-X048** are fixture ACCEPTED only via the hard search constraints no invention proof (`HARD_SEARCH_CONSTRAINTS_NO_INVENTION`). Not sandbox/prod VERIFIED.

**T-US-010** / **T-X033** are fixture ACCEPTED only via the GSC omitted rows unknown not zero proof (`GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO`). Not sandbox/prod VERIFIED.

**T-US-008** / **T-X032** are fixture ACCEPTED only via the GA4 debug not delivered conversion proof (`GA4_DEBUG_NOT_DELIVERED_CONVERSION`). Not sandbox/prod VERIFIED.

**T-X031** is fixture ACCEPTED only via the GA4 wrong property kind refused proof (`GA4_WRONG_PROPERTY_KIND_REFUSED`). Not sandbox/prod VERIFIED.

**T-US-040** / **T-X049** are fixture ACCEPTED only via the thank-you without CRM fails delivery proof (`THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY`). Not sandbox/prod VERIFIED.

**T-X050** is fixture ACCEPTED only via the public synthetic flag requires server grant proof (`PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT`) — client/public `ws_synthetic` / `is_synthetic` cannot authorize synthetic labeling without a server-issued canary grant; browser submission boundary and fixture CRM enforce the gate. Not sandbox/prod VERIFIED.

**T-X010** is fixture ACCEPTED only via the malicious prompt no shell injection proof (`MALICIOUS_PROMPT_NO_SHELL_INJECTION`) — prompt via stdin; fixed argv; `shell: false`. Not sandbox/prod VERIFIED.

**T-X016** is fixture ACCEPTED only via the stop-before-dispatch / no adapter mutation proof (`STOP_BEFORE_DISPATCH_NO_MUTATION`) — pre-apply AUTHORIZED/QUEUED may CANCELLED with durable `applyAttempts=0` and no fake-provider entry; outbound stop returns `OUTBOUND_STOPPED` before dispatch claim. Not sandbox/prod VERIFIED.

**T-X022** is fixture ACCEPTED only via the idempotency key payload mismatch proof (`IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`) — same businessIdempotencyKey/operationId with a different payloadDigest is Conflict; applyCount stays 1. Not sandbox/prod VERIFIED.

**T-X063** is fixture ACCEPTED only via the indirect prompt-injection exfiltration boundary proof (`INDIRECT_PROMPT_INJECTION_EXFIL_DENIED`) — untrusted web/email content is not instruction-eligible; `secret_exfiltration` / `credential_access` / `broker_secret_read` are absolute-denied via `proposeEffect` and the injection boundary. Not sandbox/prod VERIFIED.

**T-X013** is fixture ACCEPTED only via the replay historical workflow / no repeated external I/O proof (`REPLAY_HISTORICAL_NO_REPEAT_IO`) — record enqueue→accept→verify activity history, then replay the mission control flow from that history without re-invoking acceptPending/applyOnce; provider ledger must not grow. Distinct from mid-flight no-dup, crash-restart, and mere VERIFIED acceptPending short-circuit. Not sandbox/prod VERIFIED.

**T-X004** is fixture ACCEPTED only via the disk-full evidence no partial completed proof (`DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED`) — ENOSPC during evidence write must not leave a COMPLETED manifest. Not sandbox/prod VERIFIED.

**T-X026** is fixture ACCEPTED only via the concurrent final budget reservation cap proof (`CONCURRENT_FINAL_BUDGET_RESERVATION_CAP`) — same-snapshot finals compose to `BUDGET_EXHAUSTED`; reserved never exceeds the daily limit. Not sandbox/prod VERIFIED.

**T-X052** is fixture ACCEPTED only via the synthetic conversion contamination excluded proof (`SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED`) — synthetic conversion contaminants are projected out of commerce denominators; `synthetic && countedInCommerce` is refused. Distinct from T-X039/T-US-058 metric-denominators honesty and T-X050 public-flag grant. Not sandbox/prod VERIFIED.

**T-X054** is fixture ACCEPTED only via the reply sent CRM reconciles no-resend proof (`REPLY_SENT_CRM_RECONCILES_NO_RESEND`) — after outbound SENT/DELIVERED, CRM write failure reconciles/retries CRM only; outbound stays `retain_sent` and same-body resend is suppressed; inbound/QUEUED gated; CRM fail without intent still no resend; module mismatch still no resend; `fixtureOnly=false` / `claimLiveVerified` / `requestLiveCrmWire` → `LIVE_CRM_CLAIM_REFUSED`; `liveCrmWiring` stays NOT_WIRED; ChatGPT Ads ACCESS_BLOCKED; externalEffects NONE. Distinct from thank-you-without-CRM (T-US-040/T-X049). Not sandbox/prod VERIFIED.

**T-X055** is fixture ACCEPTED only via the unknown policy question escalates without promise proof (`UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE`) — questions outside `allowedQuestionIds` refuse the concierge draft and escalate handoff with empty `verifiedAnswers` (no invented promise). Not sandbox/prod VERIFIED.

**T-X056** is fixture ACCEPTED only via the automated response loop bounded handoff proof (`AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF`) — `maxAgentMessagesPerConversation` enforces `MESSAGE_LIMIT` and creates a handoff (`handed_off`, `agentSendAllowed=false`); no unbounded auto-reply loop. Distinct from takeover-cancels-unsent (T-US-044/T-X053). Not sandbox/prod VERIFIED.

**T-X059** is fixture ACCEPTED only via the duplicate platform attribution one-booking proof (`DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING`) — multiple platforms may claim the same booking; unique outcome count stays 1; platform claims remain separate ledger rows (chronological retain; trim); blank/invalid claim fields refuse (`INVALID_ATTRIBUTION_CLAIM`); `liveProviderWiring=NOT_WIRED`; never silently sum into unique bookings. Not sandbox/prod VERIFIED.

**T-X060** is fixture ACCEPTED only via the currency/timezone mismatch no silent sum proof (`CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM`) — matched currency+reportingTimezone series may aggregate (whitespace-normalized); currency or timezone mismatch / blank dimensions return `totalMinor=null` (`INVALID_DIMENSION` for blanks); never invents a cross-dimension total; live `NOT_WIRED`. Distinct from T-X059 platform-attribution uniqueness. Not sandbox/prod VERIFIED.

**T-X070** is fixture ACCEPTED only via the validated payload not collected separate failure states proof (`VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES`) — fixture webhook signature/schema/envelope validation failure reports `VALIDATION_FAILED` without collection; a valid payload whose durable write fails (or returns empty `recordId`) reports `COLLECTION_FAILED` (`validated=true`, `collected=false`); codes stay distinct; live wiring stays `NOT_WIRED`; ChatGPT Ads ACCESS_BLOCKED; `externalEffects=NONE`. Not sandbox/prod VERIFIED.

**T-X027** is fixture ACCEPTED only via the unknown usage cancel holds residual proof (`UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL`). Not sandbox/prod VERIFIED.

**T-X044** is fixture ACCEPTED only via the unlicensed venue media publish-blocked proof (`UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED`) — `releaseCanonical` fails closed for unlicensed / unknown / expired / pending-clearance / uncleared rights / unapproved invented media. Not sandbox/prod VERIFIED.

**T-US-006** is fixture ACCEPTED only via the unbound write path fail-closed proof (`UNBOUND_WRITE_PATH_FAIL_CLOSED`) — unbound URL OBSERVE/CREATE analysis may proceed without a mapped pilot write path; ROUTINE_PUBLISH on an unbound channel/asset fail closed with `prerequisiteMissing` and no matched path; `applyAttemptCount=0` (gate-only). Not sandbox/prod VERIFIED.

**T-US-052** is fixture ACCEPTED only via the mocked connector not production-ready proof (`MOCKED_CONNECTOR_NOT_PRODUCTION_READY`) — `AdapterWiring.FIXTURE`/`NOT_WIRED` map to non-production live status; fixture paid-media state keeps `productionActivated=false`; `ACCEPTED_PENDING` never sets `verified=true`; LIVE adapter read evidence is refused; FIXTURE+VERIFIED still fails closed. Not sandbox/prod VERIFIED.

**T-US-012** is fixture ACCEPTED only via the Google Ads test vs production access separated proof (`GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED`) — TEST credential cannot access PRODUCTION customer (and reverse); LIVE NOT_WIRED; mutate never authorized. Distinct from T-X034 and T-US-011. Not sandbox/prod VERIFIED.

**T-X023** is fixture ACCEPTED only via the eventual-consistency false not-found proof (`EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND`) — instrumented fixture CRM lagging read with local write refuses create (BOUND_WAIT); after visibility reconcile MATCHED; writeAttemptCount stays 1. Not sandbox/prod VERIFIED.

**T-US-056** is fixture ACCEPTED only via the honest outage durable hosted contact path proof (`HONEST_OUTAGE_HOSTED_CONTACT_PATH`) — host OFFLINE makes public chat UNAVAILABLE; hosted form path stays fail-closed durable; pretend local receipt refused. Not sandbox/prod VERIFIED.

**T-X030** is fixture ACCEPTED only via the rate-limit bounded backoff preserves deadline proof (`RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE`) — respect Retry-After / capped exponential backoff, stop before the job deadline, surface delayed/unavailable data, never spawn agents to bypass quotas. Not sandbox/prod VERIFIED.
**T-X040** is fixture ACCEPTED only via the low-sample trend spike insufficient-evidence proof (`LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE`) — research task only; never a publish trigger from this gate alone. Not sandbox/prod VERIFIED.

**T-X041** is fixture ACCEPTED only via the incomparable trend indices reject/label proof (`INCOMPARABLE_TREND_INDICES_REJECTED`) — never divides arbitrary indices from different data extracts; mismatched or missing comparability group/unit/source is rejected and labeled. Not sandbox/prod VERIFIED.

**T-X042** is fixture ACCEPTED only via the schema differs from page gate fails proof (`SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS`) — schema.org property values absent from visible page content yield `SCHEMA_VISIBLE_MISMATCH` / PARTIAL; persisted SEO `approveProposal`/`releasePilotPage` reject with no gateway decision. Not sandbox/prod VERIFIED.

**T-X046** is fixture ACCEPTED only via the unsupported blog destination no fake publication proof (`UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION`) — OTHER_BLOG / Hub without adapter → `UNSUPPORTED_ACTION` / FAILED with null receipt; never invents `PUBLISHED_VERIFIED`. Distinct from T-US-022 / T-X045. Not sandbox/prod VERIFIED.

**T-X047** is fixture ACCEPTED only via the layout-specific capacity mismatch filter proof (`LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS`) — requested layout capacity wins on `runSemanticSearch`; marketing max / mismatched layout must not admit. Not sandbox/prod VERIFIED.

**T-X051** is fixture ACCEPTED only via the wrong Zoho organization identity-mismatch proof (`WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH`) — observed org ≠ expected blocks CRM write/bind; live Zoho remains NOT_WIRED. Not sandbox/prod VERIFIED.

**T-X062** is fixture ACCEPTED only via the SSE gap full-state resync proof (`SSE_GAP_FULL_STATE_RESYNC`) — after offline UI reconnect (and for online gaps), a non-contiguous SSE sequence refuses incremental catch-up; outstanding `minResyncThroughSeq` blocks contiguous invent; covering full-state snapshot replaces UI stateDigest; invalid seq / blank digest refuse; `liveProviderWiring=NOT_WIRED`; missed events are never invented. Not sandbox/prod VERIFIED.

**T-X061** is fixture ACCEPTED only via the keyboard focus restore after dialog proof (`KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG`) — overlay open captures the trigger, Tab/Shift+Tab traps within dialog focusables (including wrap edges), close restores focus to the trigger or fails closed as `FOCUS_LOST` when unrestorable; re-open while open is refused. Distinct from T-US-055 (full keyboard journey + reduced motion). Not sandbox/prod VERIFIED.

**T-X068** is fixture ACCEPTED only via the thirty alerts one outage grouped incident proof (`THIRTY_ALERTS_ONE_OUTAGE_GROUPED`) — alerts sharing one `outageKey` (whitespace-normalized) collapse into a single open incident (`alertCount=30`, chronological `alertIds`, max severity, `uniqueSourceCount`); distinct outage keys stay separate; live `NOT_WIRED`. Not sandbox/prod VERIFIED.

**T-X064** is fixture ACCEPTED only via the SSRF redirect / DNS rebind blocked-every-hop proof (`SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP`) — each hop must be allowlisted https with public resolved addresses; private redirects and DNS rebind denied. Fixture hop chains only (no live DNS/fetch). Not sandbox/prod VERIFIED.

**T-X065** is fixture ACCEPTED only via the worker browser auth state OS-deny proof (`WORKER_BROWSER_AUTH_STATE_OS_DENIED`) — workers are OS-denied from system Chrome cookies, OS browser profiles, OAuth callback cookies, and workspace partitions; browser-pool and host-admin cannot silently reuse system/OS auth; workspace partition requires browser-pool + explicit consent (sealed ref only); fixture vault remains intact on deny; live browser-auth reads stay **NOT_WIRED**; `externalEffects: NONE`. Distinct from T-US-053 / T-X005 / T-X063. Not sandbox/prod VERIFIED.

**T-X071** is fixture ACCEPTED only via the host-offline public discovery honest unavailability proof (`HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE`) — offline host → `UNAVAILABLE`/`HOST_OFFLINE` on all public-discovery surfaces (prior success ignored); claimed `AVAILABLE` refused; ONLINE without prior success → `HOST_ONLINE_NO_PRIOR_UNAVAILABLE` (never invent ranks or active coverage); live wiring stays `NOT_WIRED`. Distinct from T-X001 host-sleep monitoring coverage gaps. ChatGPT Ads stays ACCESS_BLOCKED. Not sandbox/prod VERIFIED.

**T-X067** is fixture ACCEPTED only via the incompatible workflow upgrade blocked-or-retained proof (`INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED`) — in-flight RUNNING/APPLYING instances refuse breaking / cross-epoch / breakingRevision definition upgrades and retain the compatible pin; IDLE/COMPLETE also refuse silent incompatible rebinds; compatible same-epoch upgrades may apply. Temporal/live workflow runtime stays **NOT_WIRED**; `externalEffects: NONE`. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.

**T-X034** is fixture ACCEPTED only via the test-only Ads project vs production blocked proof (`ADS_TEST_PROJECT_PRODUCTION_BLOCKED`) — sandbox/test Ads project requesting LIVE returns `ADS_TEST_PROJECT_MISMATCH`; guarded production bind call count stays 0; external effects NONE. Distinct from T-US-012 (Google Ads TEST vs PRODUCTION) and soft-skip ChatGPT Ads connect cases (T-F07 / T-US-013 / T-US-014). Not sandbox/prod VERIFIED.

**T-X035** is fixture ACCEPTED only via the shared ad budget external-change invalidates proof (`SHARED_AD_BUDGET_EXTERNAL_CHANGE_INVALIDATES`) — bound provider snapshot re-read before mutation; external shared-budget or revision drift INVALIDATES the proposal and refuses approve/execute with `externalEffects=NONE`. Not sandbox/prod VERIFIED. Distinct from create-time `SHARED_BUDGET_UNKNOWN`.
**T-X036** is fixture ACCEPTED only via the recent Ads conversion blank PENDING proof (`RECENT_ADS_CONVERSION_BLANK_PENDING`) — blank/omitted/unsettled recent Ads conversions stay `PENDING` with `displayValue` null (never a false zero); settled measured zero remains honest; budget adjust stays blocked while attribution is unsettled; live wiring `NOT_WIRED`. Distinct from T-US-011 / T-US-031 / T-X034 / T-X035. ChatGPT Ads connect cases (T-F07 / T-US-013 / T-US-014) stay ACCESS_BLOCKED. Not sandbox/prod VERIFIED.

**T-X072** is fixture ACCEPTED only via the customer data eval redaction blocks proof (`CUSTOMER_DATA_EVAL_REDACTION_BLOCKS`) — raw customer PII cannot enter EVAL_ONLY; redact yields `REDACTED_FOR_EVAL` (incl. embedded display names, intentLabel identifiers, and conversationId PII; known-name redaction is word-boundary safe); eval prompts withhold raw conversationId; raw passthrough, residual PII, and live-VERIFIED / live-fleet claims are `CUSTOMER_DATA_LEAK_BLOCKED`; `liveEvalWiring` stays NOT_WIRED; externalEffects NONE. Distinct from EVAL_ONLY tool forbid (T-US-018/T-X037). Not sandbox/prod VERIFIED.

**T-X045** is fixture ACCEPTED only via the partial campaign destinations / per-destination states proof (`PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE`) — mixed VERIFIED/FAILED/UNKNOWN_REMOTE yields PARTIAL; ACCEPTED_PENDING stays distinct from VERIFIED; recoverable destinations exclude verified peers. Not sandbox/prod VERIFIED.

**T-X028** is fixture ACCEPTED only via the actual cost exceeds estimate overrun visible proof (`ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE`) — `settleBudget` posts full `actualMinor` when it exceeds the reserved estimate; overrun visible in `settledMinor`; reservation released; `heldMinor` stays 0. Not sandbox/prod VERIFIED.


**T-X017** is fixture ACCEPTED only via the stop-after-dispatch reconcile / no fake cancel proof (`STOP_AFTER_DISPATCH_RECONCILE`) — once APPLYING has started, stop retains work for reconcile (APPLYING→CANCELLED forbidden). Not sandbox/prod VERIFIED.

**T-X024** is fixture ACCEPTED only via the old fence after reassignment proof (`OLD_FENCE_AFTER_REASSIGNMENT`). Not sandbox/prod VERIFIED.

**T-X011** is fixture ACCEPTED only via the output bomb bounded/quarantined proof (`OUTPUT_BOMB_BOUNDED_QUARANTINED`) — oversized CLI stdout is refused (`OUTPUT_TOO_LARGE`) and not delivered. Not sandbox/prod VERIFIED.

**T-X003** is fixture ACCEPTED only via the symlink escape after root verification proof (`SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION`) — logical root check then canonical/realpath deny when a symlink would write outside the verified root. Not sandbox/prod VERIFIED.

**T-X009** is fixture ACCEPTED only via the CLI error despite exit 0 proof (`CLI_ERROR_DESPITE_EXIT_ZERO`) — Claude `--output-format json` may set `is_error` while exiting 0; the job must FAIL. Not sandbox/prod VERIFIED.

**T-X007** is fixture ACCEPTED only via the wrong CMS environment no production op proof (`WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP`) — bound≠intended / unrecognized / production mutate refused with providerMutateCount=0. Not sandbox/prod VERIFIED.

**T-X012** is fixture ACCEPTED only via `ORPHAN_WORKER_DEADLINE_TREE_STOPPED`. Not sandbox/prod VERIFIED.

**T-X008** is fixture ACCEPTED only via the fact changes after review stale / no publish proof (`FACT_CHANGES_AFTER_REVIEW_STALE`) — cited-fact set change after A25 bind invalidates review and blocks fixture publish; support-label flip fails article/approval gates (binding not claimed invalidated by label alone). Not sandbox/prod VERIFIED.

Shared evidence for each: actual state before/after; instrumented provider call count or read-back; correlated redacted logs/traces; no unauthorized external effect.

| ID | Title | Focus |
|---|---|---|
| T-X001 | Host sleeps during scheduled monitoring | Coverage gap honest; coalesce *(fixture ACCEPTED)* |
| T-X002 | Two supervisors start together | Single host lease *(fixture ACCEPTED — competing-supervisor lease proof; not sandbox/prod VERIFIED)* |
| T-X003 | Symlink escape after root verification | Write denied outside root *(fixture ACCEPTED — symlink escape after root verification proof; not sandbox/prod VERIFIED)* |
| T-X004 | Disk full during evidence write | No partial completed manifest *(fixture ACCEPTED — disk-full evidence no-partial-completed proof; not sandbox/prod VERIFIED)* |
| T-X005 | Forged browser role | Payload role ignored *(fixture ACCEPTED — forged browser role ignored proof; not sandbox/prod VERIFIED)* |
| T-X006 | Cross-workspace object reference | Deny without leak *(fixture ACCEPTED — cross-workspace reference denied proof; not sandbox/prod VERIFIED)* |
| T-X007 | Wrong CMS environment | No production op *(fixture ACCEPTED — wrong CMS environment no production op proof; not sandbox/prod VERIFIED)* |
| T-X008 | Fact changes after review | Stale; no publish *(fixture ACCEPTED — fact changes after review stale / no publish proof; not sandbox/prod VERIFIED)* |
| T-X009 | CLI error despite exit 0 | Job fails *(fixture ACCEPTED — CLI error despite exit 0 proof; not sandbox/prod VERIFIED)* |
| T-X010 | Malicious prompt interpolation | No shell injection *(fixture ACCEPTED)* |
| T-X011 | Output bomb | Bounded/quarantined *(fixture ACCEPTED — output bomb bounded/quarantined proof; not sandbox/prod VERIFIED)* |
| T-X012 | Orphan worker on deadline | Process tree stopped *(fixture ACCEPTED)* |
| T-X013 | Replay historical workflow | No repeated external I/O *(fixture ACCEPTED — replay historical no-repeat-I/O proof; not sandbox/prod VERIFIED)* |
| T-X014 | Approval wait survives restart | Resume wait; no slot hold *(fixture ACCEPTED)* |
| T-X015 | DST recurring schedule | No unintended duplicates *(fixture ACCEPTED — DST recurring schedule no-duplicates proof; not sandbox/prod VERIFIED)* |
| T-X016 | Stop before dispatch claim | No adapter mutation *(fixture ACCEPTED — stop-before-dispatch / no adapter mutation proof; not sandbox/prod VERIFIED)* |
| T-X017 | Stop after provider dispatch starts | Reconcile; no fake cancel *(fixture ACCEPTED — stop-after-dispatch reconcile / no fake cancel proof; not sandbox/prod VERIFIED)* |
| T-X018 | Self-approval | Rejected *(fixture ACCEPTED — self-approval rejected / independent A25 proof; not sandbox/prod VERIFIED)* |
| T-X019 | Approved payload edited | Digest conflict *(fixture ACCEPTED — approved payload edit invalidated proof; not sandbox/prod VERIFIED)* |
| T-X020 | Timeout after provider acceptance | Unknown → reconcile; no resend *(fixture ACCEPTED)* |
| T-X021 | Concurrent idempotent releases | One dispatch *(fixture ACCEPTED)* |
| T-X022 | Idempotency key payload mismatch | Conflict *(fixture ACCEPTED — idempotency key payload mismatch proof; not sandbox/prod VERIFIED)* |
| T-X023 | Eventual consistency false not-found | No unsafe retry *(fixture ACCEPTED — eventual-consistency false not-found proof; not sandbox/prod VERIFIED)* |
| T-X024 | Old fence after reassignment | Old worker cannot commit *(fixture ACCEPTED — old fence after reassignment proof; not sandbox/prod VERIFIED)* |
| T-X025 | External human edit during staging | Conflict retained *(fixture ACCEPTED — external human edit conflict retained proof; not sandbox/prod VERIFIED)* |
| T-X026 | Concurrent final budget reservation | Cap enforced *(fixture ACCEPTED — concurrent final budget reservation cap proof; not sandbox/prod VERIFIED)* |
| T-X027 | Unknown usage on cancelled request | Hold; not zero cost |
| T-X028 | Actual cost exceeds estimate | Overrun visible *(fixture ACCEPTED — actual cost exceeds estimate overrun visible proof; not sandbox/prod VERIFIED)* |
**T-X029** is fixture ACCEPTED only via the explicit different-account rebind proof (`EXPLICIT_ACCOUNT_REBIND`). Same-account local rotate does **not** satisfy this case. Not sandbox/prod VERIFIED.

| T-X029 | Token rotates to different account | Explicit rebind |
| T-X030 | Rate-limit with deadline | Bounded backoff *(fixture ACCEPTED — rate-limit bounded backoff preserves deadline proof; not sandbox/prod VERIFIED)* |
| T-X031 | Wrong GA4 property kind | Validation fails *(fixture ACCEPTED)* |
| T-X032 | GA4 debug validation success only | No delivered-conversion claim *(fixture ACCEPTED)* |
| T-X033 | Omitted GSC rows | Unknown ≠ zero *(fixture ACCEPTED)* |
| T-X034 | Test-only Ads project vs production | Blocked *(fixture ACCEPTED — test Ads project vs production blocked proof; not sandbox/prod VERIFIED)* |
| T-X035 | Shared ad budget changed externally | Proposal invalidated *(fixture ACCEPTED — shared ad budget external change invalidates proof; not sandbox/prod VERIFIED)* |
| T-X036 | Recent Ads conversion blank | Pending; no false zero *(fixture ACCEPTED — recent Ads conversion blank PENDING proof; not sandbox/prod VERIFIED)* |
| T-X037 | Gemini tries operational tool | No effect *(fixture ACCEPTED)* |
| T-X038 | Grounding configured but unused | No grounded pass *(fixture ACCEPTED)* |
| T-X039 | Provider error vs answer failure | Separate denominators *(fixture ACCEPTED)* |
| T-X040 | Low-sample trend spike | Insufficient evidence *(fixture ACCEPTED — low-sample trend spike insufficient-evidence proof; not sandbox/prod VERIFIED)* |
| T-X041 | Incomparable trend indices | Reject/label *(fixture ACCEPTED — incomparable trend indices reject/label proof; not sandbox/prod VERIFIED)* |
| T-X042 | Schema differs from page | Gate fails *(fixture ACCEPTED — schema differs from page gate fails proof; not sandbox/prod VERIFIED)* |
| T-X043 | Optimization breaks CTA | Journey regression fails *(fixture ACCEPTED — optimization breaks CTA journey fails proof; not sandbox/prod VERIFIED)* |
| T-X044 | Unlicensed venue media | Publish blocked *(fixture ACCEPTED — unlicensed venue media publish-blocked proof; not sandbox/prod VERIFIED)* |
| T-X045 | Partial campaign destinations | Per-destination states *(fixture ACCEPTED — partial destinations per-state proof; not sandbox/prod VERIFIED)* |
| T-X046 | Unsupported blog destination | No fake publication *(fixture ACCEPTED — unsupported blog destination no fake publication proof; not sandbox/prod VERIFIED)* |
| T-X047 | Layout-specific capacity mismatch | Filter correctly *(fixture ACCEPTED — layout-specific capacity mismatch filter proof; not sandbox/prod VERIFIED)* |
| T-X048 | Unknown price or availability | No invention *(fixture ACCEPTED)* |
| T-X049 | Thank-you but no CRM record | Fail at delivery *(fixture ACCEPTED)* |
| T-X050 | Public synthetic flag abuse | Server grant required *(fixture ACCEPTED)* |
| T-X051 | Wrong Zoho organization | Identity mismatch blocks *(fixture ACCEPTED — wrong-zoho-organization identity-mismatch proof; not sandbox/prod VERIFIED)* |
| T-X052 | Synthetic conversion contamination | Excluded from commerce *(fixture ACCEPTED — synthetic conversion contamination excluded proof; not sandbox/prod VERIFIED)* |
| T-X053 | Takeover races queued reply | Version invalidates send *(fixture ACCEPTED — takeover cancels unsent / VERSION_MISMATCH race proof; not sandbox/prod VERIFIED)* |
| T-X054 | Reply sent but CRM fails | CRM reconciles; no resend *(fixture ACCEPTED — reply sent CRM reconciles no-resend proof; liveCrmWiring NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X055 | Unknown policy question | Escalate without promise *(fixture ACCEPTED — unknown policy question escalates without promise proof; not sandbox/prod VERIFIED)* |
| T-X056 | Automated response loop | Bounded; handoff *(fixture ACCEPTED — automated response loop bounded handoff proof; not sandbox/prod VERIFIED)* |
| T-X057 | Repair disables failing test | Rejected *(fixture ACCEPTED)* |
| T-X058 | Third automatic repair attempt | Escalate *(fixture ACCEPTED — attempt-limit escalate; CMS NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X059 | Duplicate platform attribution | One booking; separate claims *(fixture ACCEPTED — duplicate platform attribution one-booking proof; liveProviderWiring NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X060 | Currency/timezone mismatch | No silent sum *(fixture ACCEPTED — whitespace match; INVALID_DIMENSION; NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X061 | Keyboard review and focus restore | A11y *(fixture ACCEPTED — keyboard focus restore after dialog proof; not sandbox/prod VERIFIED)* |
| T-X062 | SSE gap after offline UI | Full-state resync *(fixture ACCEPTED — SSE gap full-state resync proof; liveProviderWiring NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X063 | Indirect prompt-injection exfiltration | Boundary denies *(fixture ACCEPTED — indirect-prompt-injection-exfil-denied proof; not sandbox/prod VERIFIED)* |
| T-X064 | SSRF redirect and DNS rebind | Blocked every hop *(fixture ACCEPTED — SSRF redirect/DNS rebind every-hop proof; not sandbox/prod VERIFIED)* |
| T-X065 | Worker reads browser auth state | OS deny *(fixture ACCEPTED — worker/browser-pool/host-admin OS deny; vault intact; live NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X066 | Backup omits remote receipt | Reconcile; no duplicate *(fixture ACCEPTED — backup/omit-receipt proof; not sandbox/prod VERIFIED)* |
| T-X067 | Incompatible workflow upgrade | Blocked or compatible retained *(fixture ACCEPTED — incompatible workflow upgrade blocked or retained proof; epoch/rev/breaking edges + IDLE/COMPLETE retain; Temporal NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X068 | Thirty alerts one outage | Grouped incident *(fixture ACCEPTED — thirty alerts one outage grouped proof; whitespace outageKey / uniqueSources / NOT_WIRED; not sandbox/prod VERIFIED)* |
| T-X069 | Imported document becomes instructions | Quarantined as data *(fixture ACCEPTED)* |
| T-X070 | Validated payload not collected | Separate failure states *(fixture ACCEPTED — validated payload not collected separate failure states proof; not sandbox/prod VERIFIED)* |
| T-X071 | Local host offline public discovery | Honest unavailability *(fixture ACCEPTED — host-offline public discovery unavailable proof; not sandbox/prod VERIFIED)* |
| T-X072 | Customer data leaks into evaluation | Redaction blocks *(fixture ACCEPTED — customer data eval redaction blocks proof; not sandbox/prod VERIFIED)* |
| T-X073 | Offboarding retains active token | Incomplete until revoked *(fixture ACCEPTED — offboard ACTIVE_TOKEN residual; live revoke NOT_WIRED; not sandbox/prod VERIFIED)* |

## Counts

| Family | Count | Status |
|---|---:|---|
| T-F (full_stack_e2e) | 26 | 1 NOT_RUN + 25 fixture ACCEPTED (T-F01, T-F02, T-F03, T-F04, T-F05, T-F06, T-F08, T-F09, T-F10, T-F11, T-F12, T-F13, T-F14, T-F15, T-F16, T-F17, T-F18, T-F19, T-F20, T-F21, T-F22, T-F23, T-F24, T-F25, T-F26) |
| T-US (behavior_acceptance) | 60 | 2 NOT_RUN + 58 fixture ACCEPTED (T-US-001, T-US-002, T-US-003, T-US-004, T-US-005, T-US-006, T-US-007, T-US-008, T-US-009, T-US-010, T-US-011, T-US-012, T-US-015, T-US-016, T-US-017, T-US-018, T-US-019, T-US-020, T-US-021, T-US-022, T-US-023, T-US-024, T-US-025, T-US-026, T-US-027, T-US-028, T-US-029, T-US-030, T-US-031, T-US-032, T-US-033, T-US-034, T-US-035, T-US-036, T-US-037, T-US-038, T-US-039, T-US-040, T-US-041, T-US-042, T-US-043, T-US-044, T-US-045, T-US-046, T-US-047, T-US-048, T-US-049, T-US-050, T-US-051, T-US-052, T-US-053, T-US-054, T-US-055, T-US-056, T-US-057, T-US-058, T-US-059, T-US-060) |
| T-X (platform/security/resilience) | 73 | 0 NOT_RUN + 73 fixture ACCEPTED (T-X001, T-X002, T-X003, T-X004, T-X005, T-X006, T-X007, T-X008, T-X009, T-X010, T-X011, T-X012, T-X013, T-X014, T-X015, T-X016, T-X017, T-X018, T-X019, T-X020, T-X021, T-X022, T-X023, T-X024, T-X025, T-X026, T-X027, T-X028, T-X029, T-X030, T-X031, T-X032, T-X033, T-X034, T-X035, T-X036, T-X037, T-X038, T-X039, T-X040, T-X041, T-X042, T-X043, T-X044, T-X045, T-X046, T-X047, T-X048, T-X049, T-X050, T-X051, T-X052, T-X053, T-X054, T-X055, T-X056, T-X057, T-X058, T-X059, T-X060, T-X061, T-X062, T-X063, T-X064, T-X065, T-X066, T-X067, T-X068, T-X069, T-X070, T-X071, T-X072, T-X073) |
| **Total** | **159** | **3 NOT_RUN + 156 fixture ACCEPTED** |

Fixture ACCEPTED ≠ sandbox-verified ≠ authorized-production VERIFIED. Never silently VERIFIED for live. External effects for the M9 fixture harness: **NONE**.
