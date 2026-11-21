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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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
Level: full_stack_e2e | Status: NOT_RUN
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

**Fixture ACCEPTED (M9 soak evidence, not live VERIFIED):** T-US-002, T-US-010, T-US-018, T-US-024, T-US-036, T-US-042, T-US-044, T-US-046, T-US-047, T-US-048, T-US-054, T-US-057, T-US-058, T-US-060.

### Happy-path / documented flow completions
- **T-US-001** Create a trusted local workspace (F01/SC-02) — blockers and next actions.
- **T-US-003** Choose folders and establish business truth (F02/SC-20) — restore evidence; secrets excluded.
- **T-US-005** Map sites, pages and editable sources (F03/SC-06) — baseline ID and checks.
- **T-US-007** Connect GA4 (F04/SC-18) — ready-read and next sync.
- **T-US-009** Connect Search Console (F05/SC-18) — schedule and watermark.
- **T-US-011** Connect Google Ads analyze-only (F06/SC-18) — write disabled.
- **T-US-013** Connect ChatGPT Ads (F07/SC-18) — read-ready; write denial; transport/entitlement gate.
- **T-US-015** Connect Claude Code + test API (F08/SC-18) — EVAL_ONLY.
- **T-US-017** Connect Gemini evaluation (F09/SC-18) — EVAL_ONLY.
- **T-US-019** Map CRM/forms/booking (F10/SC-16) — failure/recovery scenario.
- **T-US-021** Connect local/social/inbox (F11/SC-18) — test artifact and capability.
- **T-US-023** Grant standing autonomy (F12/SC-19) — control tests with receipts.
- **T-US-025** Launch workstream and schedule (F13/SC-02) — mission outcome.
- **T-US-027** Demand → page improvement (F14/SC-07) — release receipt and experiment window.
- **T-US-029** Original campaign distribution (F15/SC-08) — campaign manifest.
- **T-US-031** Paid-media recommendations (F16/SC-13) — verified mutation or failure.
- **T-US-033** Claude/Gemini eval suites (F17/SC-14) — adjudication + backlog.
- **T-US-035** Review/revise/release (F18/SC-05) — release receipt or blocked exception.
- **T-US-037** Analyze and hypothesis (F19/SC-12) — portable analysis artifact.
- **T-US-039** Form→CRM continuous verify (F20/SC-15) — cadence/heartbeat.
- **T-US-041** Diagnose/repair defect (F21/SC-21) — verified resolution or handoff.
- **T-US-043** After-hours + takeover (F22/SC-17) — acknowledged handoff.
- **T-US-045** Semantic search / no-result (F23/SC-11) — evaluation comparison.
- **T-US-047** Recover/rotate/reconcile (F24/SC-18) — offboarding manifest. *(fixture ACCEPTED — recover/rotate/reconcile proof; not sandbox/prod VERIFIED)*
- **T-US-049** Daily owner review (F25/SC-01) — reviewed operating knowledge.
- **T-US-051** Design/release readiness (F26/SC-23) — release acceptance packet.

### Failure / gate cases (evidence: blocking decision, preserved inputs, current state, recovery path)
- **T-US-002** Competing supervisors refused; no duplicate leases. *(fixture ACCEPTED — competing-supervisor / singleton host-lease proof; not sandbox/prod VERIFIED)*
- **T-US-004** Unsafe folders / unresolved facts blocked; safe facts usable.
- **T-US-006** Unbound URL: analysis ok, write blocked.
- **T-US-008** GA4 debug validation ≠ measured receipt.
- **T-US-010** Missing GSC rows ≠ zero demand *(fixture ACCEPTED)*.
- **T-US-012** Google Ads test vs production access separated.
- **T-US-014** ChatGPT Ads key/account identity mismatch refuses bind.
- **T-US-016** Claude runtime vs API eval auth separated.
- **T-US-018** Gemini never used for publish/CRM/customer reply. *(fixture ACCEPTED — EVAL_ONLY operational tool forbidden proof; not sandbox/prod VERIFIED)*
- **T-US-020** Synthetic leads classified; no commerce pollution.
- **T-US-022** Unsupported destination capabilities respected.
- **T-US-024** Agent cannot widen its own grant. *(fixture ACCEPTED — agent cannot widen grant proof; not sandbox/prod VERIFIED)*
- **T-US-026** Missed schedules coalesce; no burst republish.
- **T-US-028** Prefer one useful page update over keyword proliferation.
- **T-US-030** Uncertain post: reconcile before retry.
- **T-US-032** Exact financial boundaries preserved.
- **T-US-034** Provider error ≠ bad answer or pass.
- **T-US-036** Stale approval invalidated on revision change. *(fixture ACCEPTED — approved payload edit invalidated proof; not sandbox/prod VERIFIED)*
- **T-US-038** Double-counted attribution avoided in unique outcomes.
- **T-US-040** Thank-you without Zoho record fails at CRM.
- **T-US-042** Repair cannot weaken protected tests. *(fixture ACCEPTED — repair weaken test rejected proof; not sandbox/prod VERIFIED)*
- **T-US-044** Takeover cancels unsent agent replies. *(fixture ACCEPTED — takeover cancels unsent proof; not sandbox/prod VERIFIED)*
- **T-US-046** Hard search constraints enforced; no invented availability *(fixture ACCEPTED)*.
- **T-US-048** Unknown remote effects reconciled before resume. *(fixture ACCEPTED — soak unknown-remote reconcile proof; not sandbox/prod VERIFIED)*
- **T-US-050** Owner brief groups root cause; actionable.
- **T-US-052** Mocked connector ≠ production-ready.

### Cross-cutting (T-US-053–T-US-060)
- **T-US-053** Secrets never in browser assets.
- **T-US-054** Independent approval enforced (no ordinary self-approval). *(fixture ACCEPTED — self-approval rejected / independent A25 proof; not sandbox/prod VERIFIED)*
- **T-US-055** Complete keyboard journey with reduced motion.
- **T-US-056** Honest outage; durable hosted contact path.
- **T-US-057** Cross-workspace resource substitution rejected. *(fixture ACCEPTED — cross-workspace resource substitution proof; not sandbox/prod VERIFIED)*
- **T-US-058** Synthetic excluded from business denominators *(fixture ACCEPTED)*.
- **T-US-059** Shared briefs redacted; private evidence retained.
- **T-US-060** Emergency stop checked at commit time. *(fixture ACCEPTED — emergency-stop / outbound-stop at commit proof; not sandbox/prod VERIFIED)*

---

## Platform / security / resilience probes (T-X001–T-X073)

Level as labeled | Status: NOT_RUN unless listed under fixture ACCEPTED below | Environment: fixture/integration; live only when separately approved.

**Fixture ACCEPTED (M9 soak evidence, not live VERIFIED):** T-X002, T-X005, T-X006, T-X014, T-X018, T-X019, T-X020, T-X029, T-X033, T-X037, T-X038, T-X039, T-X048, T-X053, T-X057, T-X058, T-X066, T-X069, T-X073.

**T-X066** is fixture ACCEPTED only via the backup / omit-receipt / post-restore reconcile proof (`BACKUP_OMIT_RECEIPT`). Retry-only no-duplicate-effects does **not** satisfy this case. Not sandbox/prod VERIFIED.

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

**T-US-042** / **T-X057** are fixture ACCEPTED only via the repair weaken test rejected proof (`REPAIR_WEAKEN_TEST_REJECTED`). Not sandbox/prod VERIFIED.

**T-US-044** / **T-X053** are fixture ACCEPTED only via the takeover cancels unsent replies proof (`TAKEOVER_CANCELS_UNSENT_REPLIES`). Not sandbox/prod VERIFIED.

**T-US-018** / **T-X037** are fixture ACCEPTED only via the EVAL_ONLY operational tool forbidden proof (`EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN`). Not sandbox/prod VERIFIED.

**T-X058** is fixture ACCEPTED only via the repair attempt limit escalated proof (`REPAIR_ATTEMPT_LIMIT_ESCALATED`). Not sandbox/prod VERIFIED.

**T-X069** is fixture ACCEPTED only via the imported doc quarantined as data proof (`IMPORTED_DOC_QUARANTINED_AS_DATA`). Not sandbox/prod VERIFIED.

**T-X038** is fixture ACCEPTED only via the eval no-grounding fail closed proof (`EVAL_NO_GROUNDING_FAIL_CLOSED`). Not sandbox/prod VERIFIED.

**T-X039** / **T-US-058** are fixture ACCEPTED only via the metric denominators honest proof (`METRIC_DENOMINATORS_HONEST`). Not sandbox/prod VERIFIED.

**T-US-046** / **T-X048** are fixture ACCEPTED only via the hard search constraints no invention proof (`HARD_SEARCH_CONSTRAINTS_NO_INVENTION`). Not sandbox/prod VERIFIED.

**T-US-010** / **T-X033** are fixture ACCEPTED only via the GSC omitted rows unknown not zero proof (`GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO`). Not sandbox/prod VERIFIED.

Shared evidence for each: actual state before/after; instrumented provider call count or read-back; correlated redacted logs/traces; no unauthorized external effect.

| ID | Title | Focus |
|---|---|---|
| T-X001 | Host sleeps during scheduled monitoring | Coverage gap honest; coalesce |
| T-X002 | Two supervisors start together | Single host lease *(fixture ACCEPTED — competing-supervisor lease proof; not sandbox/prod VERIFIED)* |
| T-X003 | Symlink escape after root verification | Write denied outside root |
| T-X004 | Disk full during evidence write | No partial completed manifest |
| T-X005 | Forged browser role | Payload role ignored *(fixture ACCEPTED — forged browser role ignored proof; not sandbox/prod VERIFIED)* |
| T-X006 | Cross-workspace object reference | Deny without leak *(fixture ACCEPTED — cross-workspace reference denied proof; not sandbox/prod VERIFIED)* |
| T-X007 | Wrong CMS environment | No production op |
| T-X008 | Fact changes after review | Stale; no publish |
| T-X009 | CLI error despite exit 0 | Job fails |
| T-X010 | Malicious prompt interpolation | No shell injection |
| T-X011 | Output bomb | Bounded/quarantined |
| T-X012 | Orphan worker on deadline | Process tree stopped |
| T-X013 | Replay historical workflow | No repeated external I/O |
| T-X014 | Approval wait survives restart | Resume wait; no slot hold *(fixture ACCEPTED)* |
| T-X015 | DST recurring schedule | No unintended duplicates |
| T-X016 | Stop before dispatch claim | No adapter mutation |
| T-X017 | Stop after provider dispatch starts | Reconcile; no fake cancel |
| T-X018 | Self-approval | Rejected *(fixture ACCEPTED — self-approval rejected / independent A25 proof; not sandbox/prod VERIFIED)* |
| T-X019 | Approved payload edited | Digest conflict *(fixture ACCEPTED — approved payload edit invalidated proof; not sandbox/prod VERIFIED)* |
| T-X020 | Timeout after provider acceptance | Unknown → reconcile; no resend *(fixture ACCEPTED)* |
| T-X021 | Concurrent idempotent releases | One dispatch |
| T-X022 | Idempotency key payload mismatch | Conflict |
| T-X023 | Eventual consistency false not-found | No unsafe retry |
| T-X024 | Old fence after reassignment | Old worker cannot commit |
| T-X025 | External human edit during staging | Conflict retained |
| T-X026 | Concurrent final budget reservation | Cap enforced |
| T-X027 | Unknown usage on cancelled request | Hold; not zero cost |
| T-X028 | Actual cost exceeds estimate | Overrun visible |
**T-X029** is fixture ACCEPTED only via the explicit different-account rebind proof (`EXPLICIT_ACCOUNT_REBIND`). Same-account local rotate does **not** satisfy this case. Not sandbox/prod VERIFIED.

| T-X029 | Token rotates to different account | Explicit rebind |
| T-X030 | Rate-limit with deadline | Bounded backoff |
| T-X031 | Wrong GA4 property kind | Validation fails |
| T-X032 | GA4 debug validation success only | No delivered-conversion claim |
| T-X033 | Omitted GSC rows | Unknown ≠ zero *(fixture ACCEPTED)* |
| T-X034 | Test-only Ads project vs production | Blocked |
| T-X035 | Shared ad budget changed externally | Proposal invalidated |
| T-X036 | Recent Ads conversion blank | Pending; no false zero |
| T-X037 | Gemini tries operational tool | No effect *(fixture ACCEPTED)* |
| T-X038 | Grounding configured but unused | No grounded pass *(fixture ACCEPTED)* |
| T-X039 | Provider error vs answer failure | Separate denominators *(fixture ACCEPTED)* |
| T-X040 | Low-sample trend spike | Insufficient evidence |
| T-X041 | Incomparable trend indices | Reject/label |
| T-X042 | Schema differs from page | Gate fails |
| T-X043 | Optimization breaks CTA | Journey regression fails |
| T-X044 | Unlicensed venue media | Publish blocked |
| T-X045 | Partial campaign destinations | Per-destination states |
| T-X046 | Unsupported blog destination | No fake publication |
| T-X047 | Layout-specific capacity mismatch | Filter correctly |
| T-X048 | Unknown price or availability | No invention *(fixture ACCEPTED)* |
| T-X049 | Thank-you but no CRM record | Fail at delivery |
| T-X050 | Public synthetic flag abuse | Server grant required |
| T-X051 | Wrong Zoho organization | Identity mismatch blocks |
| T-X052 | Synthetic conversion contamination | Excluded from commerce |
| T-X053 | Takeover races queued reply | Version invalidates send *(fixture ACCEPTED)* |
| T-X054 | Reply sent but CRM fails | CRM reconciles; no resend |
| T-X055 | Unknown policy question | Escalate without promise |
| T-X056 | Automated response loop | Bounded; handoff |
| T-X057 | Repair disables failing test | Rejected *(fixture ACCEPTED)* |
| T-X058 | Third automatic repair attempt | Escalate *(fixture ACCEPTED)* |
| T-X059 | Duplicate platform attribution | One booking; separate claims |
| T-X060 | Currency/timezone mismatch | No silent sum |
| T-X061 | Keyboard review and focus restore | A11y |
| T-X062 | SSE gap after offline UI | Full-state resync |
| T-X063 | Indirect prompt-injection exfiltration | Boundary denies |
| T-X064 | SSRF redirect and DNS rebind | Blocked every hop |
| T-X065 | Worker reads browser auth state | OS deny |
| T-X066 | Backup omits remote receipt | Reconcile; no duplicate *(fixture ACCEPTED — backup/omit-receipt proof; not sandbox/prod VERIFIED)* |
| T-X067 | Incompatible workflow upgrade | Blocked or compatible retained |
| T-X068 | Thirty alerts one outage | Grouped incident |
| T-X069 | Imported document becomes instructions | Quarantined as data *(fixture ACCEPTED)* |
| T-X070 | Validated payload not collected | Separate failure states |
| T-X071 | Local host offline public discovery | Honest unavailability |
| T-X072 | Customer data leaks into evaluation | Redaction blocks |
| T-X073 | Offboarding retains active token | Incomplete until revoked *(fixture ACCEPTED — offboard ACTIVE_TOKEN residual; live revoke NOT_WIRED; not sandbox/prod VERIFIED)* |

## Counts

| Family | Count | Status |
|---|---:|---|
| T-F (full_stack_e2e) | 26 | 25 NOT_RUN + 1 fixture ACCEPTED (T-F24) |
| T-US (behavior_acceptance) | 60 | 46 NOT_RUN + 14 fixture ACCEPTED (T-US-002, T-US-010, T-US-018, T-US-024, T-US-036, T-US-042, T-US-044, T-US-046, T-US-047, T-US-048, T-US-054, T-US-057, T-US-058, T-US-060) |
| T-X (platform/security/resilience) | 73 | 54 NOT_RUN + 19 fixture ACCEPTED (T-X002, T-X005, T-X006, T-X014, T-X018, T-X019, T-X020, T-X029, T-X033, T-X037, T-X038, T-X039, T-X048, T-X053, T-X057, T-X058, T-X066, T-X069, T-X073) |
| **Total** | **159** | **125 NOT_RUN + 34 fixture ACCEPTED** |

Fixture ACCEPTED ≠ sandbox-verified ≠ authorized-production VERIFIED. Never silently VERIFIED for live. External effects for the M9 fixture harness: **NONE**.
