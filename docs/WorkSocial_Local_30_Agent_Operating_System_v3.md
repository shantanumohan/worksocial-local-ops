# WorkSocial Local 30-Agent Operating System

Engineering specification v3.0 - visibility, reliability, publishing and customer response

Design date: November 15, 2026
Status: Proposed build requirements. No agents, connections, schedules, website changes or customer replies have been activated by this document.
Owner interface: Login-protected local web dashboard, launched from Visual Studio Code.
Execution host: The owner’s designated always-on local computer.
Agent engine: Claude Code. All 30 reasoning roles run through local Claude Code worker sessions.

## 1. Product decision and precedence

Build an operating system for WorkSocial’s digital presence and inbound revenue operations, not a collection of SEO prompts. It must research demand; optimize authorized sites; create and distribute content; maintain local profiles; test pages, forms and CRM paths; repair eligible defects; integrate data; answer permitted inbound questions after hours; and prove the results.

This v3 specification supersedes the earlier 18-agent organization, mandatory remote/cloud agent hosting, and blanket per-post human approval defaults in the v2 specification and execution brief. Preserve v2’s evidence, validation, source binding, transactional publishing, evaluation and rollback requirements unless v3 explicitly changes them. Existing repository and CMS observations in v2 are historical discovery notes, not proof of the current production architecture.

### Confirmed user requirements

|ID |Requirement                                                   |Build consequence                                                                  |
|---|--------------------------------------------------------------|-----------------------------------------------------------------------------------|
|U01|Work autonomously from the VS Code environment                |All workers execute on the selected local host; no mandatory remote agent platform |
|U02|Save files in owner-selected folders                          |Setup wizard validates and registers explicit storage roots                        |
|U03|Log into a front end and launch workstreams                   |Authenticated dashboard with individual agent controls and operating modes         |
|U04|Use Claude for all agents                                     |Claude Code role runner; no alternative reasoning-model fallback                   |
|U05|Provide logins and page access                                |Secure connection wizard and verified source bindings, not passwords in prompts    |
|U06|Research trending words, FAQs and rankings                    |Demand observatory with provenance, comparability and freshness                    |
|U07|Include ChatGPT business visibility                           |Business Hub/profile workstream plus measured discovery, subject to verified access|
|U08|Google My Business, social posts and blogs across destinations|Google Business Profile and capability-tested distribution adapters                |
|U09|Approximately 30 agents working independently                 |Exactly 30 registered roles with persistent responsibilities and bounded execution |
|U10|Test and update pages around the clock                        |Continuous deterministic probes and event-triggered Claude diagnosis/repair        |
|U11|Test forms, CRM and integrations                              |Correlated end-to-end synthetic journeys and reconciliation                        |
|U12|Respond to messages after hours                               |Unified inbound queue, verified concierge responses, CRM logging and human handoff |

## 2. What local execution means

VS Code is the engineering and operational workspace. The front end, local API, scheduler, database, browser test runners and Claude Code workers are processes on the same host. An IDE tab is not the durable database or scheduler. Claude Code supports non-interactive programmatic runs and project subagents; its session scheduler is not, by itself, the durable production scheduler.

Provide a VS Code task named WorkSocial: Start Local Operations and a corresponding dashboard launch action. These start the same managed local services, not two competing schedulers. Use a singleton host lease. A registered OS service or startup task maintains the local services when unattended operation is enabled. Closing an editor must not silently destroy job state.

The host must remain powered, awake, connected, authenticated and adequately provisioned. A sleeping or offline computer cannot answer customers, test websites or run Claude. The dashboard must show missed-heartbeat and stale-data states, never imply 24/7 coverage during an outage. Local execution is not offline inference: Claude requests still use the configured Anthropic service. Public websites, CRMs and channel platforms remain external services.

The existing production website and form intake must continue operating when the local agent host is unavailable. Do not move essential lead capture onto the local host without a durable fallback. A public chat widget must show an honest unavailable state and an existing hosted contact path when the agent host is down. It must not acknowledge receipt until a durable receiving system has accepted the message.

## 3. Physical architecture

OWNER'S SELECTED LOCAL HOST
  VS Code workspace
    + Login-protected Command Center
    + Local API and identity service
    + Persistent workflow/scheduler service
    + Local PostgreSQL database
    + Claude Code role runner: A01 through A30
    + Deterministic HTTP/DOM/form/CRM test services
    + Browser automation pool
    + Authorization and publication gateway
    + Credential broker and isolated connector adapters
    + Owner-selected evidence, content, report and backup folders

OUTBOUND CONNECTIONS
  Anthropic inference; verified website/CMS; GitHub;
  Google and other discovery platforms; social destinations;
  Zoho CRM; booking provider; supported inbox providers

OPTIONAL INBOUND TRANSPORT
  Narrow HTTPS webhook endpoint through an authenticated tunnel
  or a durable transport relay. No remote agent reasoning.

Default dashboard binding is loopback only. Remote owner access requires an authenticated private connection; do not expose the administrative dashboard, database or workflow console through the public webhook route. Webhook transport is needed only where a provider requires inbound events. Prefer polling where supported and appropriate; localhost is not a public callback address.

### Local service choices

Use TypeScript for the API, worker wrappers, adapters and contracts; React for the dashboard; PostgreSQL for operational records; Playwright for browser tests; and self-hosted Temporal for durable workflows. Run Temporal and its supported persistence locally with pinned, verified versions and persistent storage. Do not treat an ephemeral demonstration server as a production deployment. Temporal self-hosting requires operational maintenance, monitoring and recovery procedures.

Model calls and external I/O belong in workflow activities, not deterministic workflow code. Persist proposed changes, grants and publication receipts in the application database. Preserve a workflow identifier across retries. Local folders hold evidence and human-readable artifacts; they are not a substitute for a transactionally consistent task database.

A later decision to replace Temporal requires an explicit architecture decision and equivalent restart, timer, fencing, cancellation and ambiguous-publication tests. Do not introduce a second orchestration authority merely to simplify one agent.

## 4. Workspace and storage contract

The setup wizard accepts separate roots for source code, working data, content, reports and encrypted backups. A single selected parent folder may contain all except live database data and secrets when platform constraints require another location. Register the final paths in configuration; never assume a hard-coded drive letter.

```
<selected-workspace>/
  CLAUDE.md
  .claude/agents/                  30 version-controlled role definitions
  .claude/settings.json            reviewed tool restrictions
  .vscode/tasks.json              start, stop, diagnostics, tests
  apps/command-center/
  services/api/
  services/claude-runner/
  services/workflows/
  services/action-gateway/
  services/monitoring/
  services/connectors/
  packages/contracts/
  config/                         non-secret configuration
  instructions/                   approved policy versions
  incoming/                       untrusted uploads awaiting classification
  knowledge/                      approved facts and source indexes
  sites/<site-id>/                 source bindings and snapshots
  worktrees/<change-id>/           isolated code changes
  research/<period>/              trends, questions, rankings and sources
  content/<campaign-id>/           briefs, articles and channel variants
  runs/<run-id>/                   inputs, outcomes and redacted evidence
  tests/                          unit, contract, browser and agent evaluations
  reports/                        owner summaries and exports
  exports/                        portable snapshots
```

Keep active database storage and browser-session state out of consumer file-sync folders. Encrypted export copies can be written to an approved backup folder after a consistent snapshot. Backups include database, schema version, instruction versions, artifact manifest and recovery instructions. Credentials require a separate recovery policy.

Validate free space, permissions, canonical paths, symlinks/junctions, file size and allowed extensions. Prevent path traversal and writes outside authorized roots. Watcher ingestion uses checksums and a durable deduplication key; copying the same file twice must not launch duplicate campaigns. Documents in incoming/ are evidence, not executable instructions. Downloaded Markdown cannot silently become CLAUDE.md or an agent definition.

Every completed run must write a manifest with run ID, role/version, objective, source IDs, policy version, costs, tests, actions, remote receipts, status and next action. Save redacted inputs and actionable decision summaries; do not rely on private model reasoning as an audit artifact.

## 5. Exactly 30 agent roles

These are independent responsibilities, not 30 permanently busy model processes. An agent has a queue, owned assets, triggers, bounded permissions, persistent task state and outcome tests. Deterministic monitoring continues without model calls. Claude runs when interpretation, planning, generation, diagnosis or customer response is needed.

|ID |Role                                              |Responsibility and principal output                                                                                  |
|---|--------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
|A01|Operations Commander                              |Convert owner goals and incidents into dependency-aware plans; prioritize work without granting itself permissions   |
|A02|Instruction and Knowledge Steward                 |Maintain approved playbooks, business facts, evidence freshness, conflicts and instruction versions                  |
|A03|Trends and Keyword Intelligence                   |Detect emerging, seasonal and high-intent demand from connected sources; produce evidence-backed opportunities       |
|A04|FAQ and Customer Question Intelligence            |Cluster genuine customer questions, search questions and unanswered intents; maintain the question-to-page map       |
|A05|Rankings and Competitive Visibility               |Track comparable organic/local observations, competitors and changes; separate measured ranks from estimates         |
|A06|Technical SEO Engineer                            |Diagnose indexing, canonical, sitemap, status, crawl and rendering defects; propose tested technical fixes           |
|A07|On-Page SEO and Internal Linking                  |Improve page intent, metadata, navigation and relevant links without keyword stuffing or constant churn              |
|A08|AEO Specialist                                    |Create supported direct answers and useful answer coverage mapped to genuine questions                               |
|A09|GEO and ChatGPT Presence                          |Maintain AI-discovery readiness, authorized business-profile information and properly labeled visibility observations|
|A10|Schema and Entity Engineer                        |Generate and validate factual structured data and stable business/location/space/service relationships               |
|A11|Semantic Search Engineer                          |Maintain Claude-based query understanding, structured filtering, grounded results and no-result analysis             |
|A12|Editorial Strategist                              |Turn demand evidence and commercial priorities into a content and distribution plan                                  |
|A13|Long-Form Content Writer                          |Write and update substantive source-backed articles, guides and landing-page copy                                    |
|A14|Social and Creative Producer                      |Adapt campaigns into channel-native copy and approved-media layouts, captions and alt text                           |
|A15|Website and CMS Publisher                         |Stage and release authorized content bundles to verified source bindings; verify live results                        |
|A16|Multi-Channel Distribution                        |Publish eligible variants through connected adapters, reconcile ambiguous outcomes and record receipts               |
|A17|Local Presence and Google Business Profile        |Maintain legitimate profile data, approved posts, local consistency and location-specific observations               |
|A18|Reputation and Review Response                    |Monitor authorized review sources, draft/respond within policy and escalate sensitive complaints                     |
|A19|Availability and Performance Reliability          |Investigate uptime, TLS, latency, rendering and resource incidents raised by deterministic probes                    |
|A20|Browser Journey and Accessibility QA              |Test critical desktop/mobile journeys, links, booking handoffs and accessibility regressions                         |
|A21|Forms and Lead Capture QA                         |Verify form validation, backend acceptance, CRM arrival and notifications with controlled synthetic transactions     |
|A22|CRM Quality and Workflow QA                       |Verify Zoho mappings, deduplication, attribution, assignments and lead workflow behavior                             |
|A23|Integration Reliability                           |Monitor tokens, webhooks, API versions, synchronization lag, retries, reconciliation and failed deliveries           |
|A24|Repair and Release Engineer                       |Reproduce defects, create isolated fixes, run tests, stage and release only eligible changes                         |
|A25|Independent Quality, Security and Privacy Reviewer|Reject unsupported facts, unsafe tool use, injection attempts, privacy leaks and releases without evidence           |
|A26|Unified Inbox Triage                              |Classify/deduplicate inbound messages and acquire conversation ownership before a response is prepared               |
|A27|After-Hours Concierge                             |Answer allowed questions using current business facts, identify itself appropriately and escalate exceptions         |
|A28|Lead Qualification and Booking Handoff            |Collect minimum useful details, create/update qualified leads and coordinate verified tour/booking handoffs          |
|A29|Human Handoff and Incident Coordinator            |Route unresolved conversations and incidents to named people; track acknowledgement and morning follow-up            |
|A30|Revenue Analytics and Experimentation             |Reconcile traffic, leads and bookings, analyze changes and propose measurable optimization experiments               |

A14 does not require another generative model. Use approved actual venue media and deterministic layout tools. Do not invent venue photographs. Adding a non-Claude generative image or video provider is a separate owner decision.

### Role contract

Each role requires: ID; version; mission; subscribed events; asset scope; input/output schema; approved tools; resource limits; policy checks; artifact destinations; failure modes; escalation owner; and a passing evaluation suite. Model self-confidence is never a substitute for authorization or factual support.

Example job envelope:

```json
{
  "jobId": "generated-uuid",
  "roleId": "A21",
  "workflowId": "generated-workflow-id",
  "siteId": "worksocial",
  "assetId": "verified-form-id",
  "trigger": "scheduled_form_canary",
  "policyVersion": "owner-approved-policy-version",
  "inputArtifactIds": ["verified-form-spec", "synthetic-persona-ref"],
  "capabilityGrantId": "scoped-test-grant-ref",
  "sourceRevision": "observed-revision",
  "maxAttempts": 2,
  "deadlineSeconds": 180,
  "idempotencyKey": "site/form/scheduled-window",
  "expectedOutcome": "exactly-one-labelled-test-record-and-receipt"
}
```

Values above illustrate the contract; they are not real credentials, records or live grants.

## 6. Claude Code runtime adapter

The local runner invokes the installed Claude Code executable non-interactively and records the executable version and selected model identifier. Load approved project role definitions explicitly. Use structured output and schema validation; process exit code alone is not business success.

Do not use unbounded interactive terminals as queues. Do not run a perpetual free-text ‘keep improving everything’ prompt. A single job has a concrete input, bounded tools, deadline, success predicate and artifact result. On completion it exits, checkpoints or enters an explicit waiting state.

Do not use shell interpolation to construct a command from website text, incoming messages or owner-entered page titles. Spawn a fixed executable with validated arguments and pass prompt content separately. Validate all installed CLI flags against that pinned version. Never solve permission failures by enabling unrestricted permission bypass.

The policy service injects only the task’s permitted tool endpoints. Publishing credentials remain in a separate broker, unavailable to the reasoning worker. Read-only roles cannot open arbitrary shells, query the credentials store or contact write endpoints. Code-editing workers receive an isolated worktree and restricted network access. Local sandbox enforcement must be tested on the actual operating system; do not assume an IDE permission dialog creates a security boundary.

If a role proposes work for another role, it emits a typed task request. The scheduler validates scope and enqueues it. Recursive free-form delegation is disabled for this application’s release 1 regardless of whether the installed CLI supports nested subagents. The same specialist cannot author a change and issue its independent approval.

## 7. Scheduling, concurrency and durable state

Default proposed concurrency is four Claude jobs after a host benchmark, including one reserved customer-response slot; browser tests have a separate bounded pool. Tune from measurements and actual Claude account limits, not the number of role files. Prevent bulk writing from starving customer replies or incident triage.

Use priority classes: P0 lost lead/booking outage/security incident; P1 inbound customer; P2 publishing deadline or broken commercial page; P3 content/research; P4 bulk audits. Daily budgets reserve capacity for P0/P1. When budget is exhausted, research pauses before critical monitoring; a documented template response may be used when live Claude reasoning is unavailable and the channel permits it.

Workflows are at-least-once. External exactly-once effects cannot be promised universally. Use database uniqueness, provider idempotency where available, correlation IDs, transactional outboxes and read-back reconciliation. A timeout after a remote write enters UNKNOWN_REMOTE_OUTCOME; inspect remote state before retrying. If no safe reconciliation is possible, pause that job and escalate rather than risk a duplicate publication or reply.

### Job states

QUEUED -> LEASED -> RUNNING -> VALIDATING -> AUTHORIZED -> APPLYING -> VERIFYING -> COMPLETE

Side states: WAITING_DEPENDENCY, WAITING_AUTHENTICATION, WAITING_HUMAN, FAILED_RETRYABLE, UNKNOWN_REMOTE_OUTCOME, CANCELLED, QUARANTINED.

Lock editable resources by site + source binding + revision, and conversations by provider + thread ID. Use lease expiry and fencing tokens so an old crashed worker cannot publish after another worker takes over. A changed source revision requires regeneration or merge and revalidation. Multiple agents may analyze one page simultaneously; only one release owns its mutation transaction.

On host recovery, resume resumable tasks, reconcile unconfirmed writes, coalesce repetitive probes and cancel expired offers or stale response attempts. Do not publish every missed social post in a burst. Schedules use the configured business timezone, initially America/New_York, with explicit daylight-saving handling.

## 8. Authenticated front end

### Required screens

|Screen                     |Required actions and information                                                                             |
|---------------------------|-------------------------------------------------------------------------------------------------------------|
|Operations Home            |Current business health, active incidents, leads at risk, last heartbeat, system mode and next scheduled jobs|
|Agent Fleet                |All 30 roles, enabled status, owned queue, current task, last outcome, errors, costs, run/pause controls     |
|Site Explorer              |Discovered URLs, editable bindings, facts, defects, revision history and exclusions                          |
|Demand Observatory         |Trends, FAQs, query clusters, ranks, sources, freshness and content gaps                                     |
|Content and Distribution   |Canonical article, destination variants, schedules, publication outcomes and links                           |
|Local and AI Presence      |GBP/location registry, other profiles, ChatGPT profile tasks, visibility observations and access limitations |
|Journey Test Lab           |Browser traces, form-to-CRM transaction graph, synthetic results and last verified receipt                   |
|Unified Inbox              |Conversation ownership, evidence-backed draft/reply, takeover, escalation and CRM link                       |
|Connections and Permissions|OAuth/browser-session setup, capability tests, limits, expiry and granted actions                            |
|Files and Knowledge        |Folder mappings, incoming documents, approved facts, source conflicts and artifacts                          |
|Incidents and Changes      |Evidence, bounded repair plan, release diffs, read-back, rollback and acknowledgement                        |
|Outcomes and Costs         |Traffic/lead/booking measures, attribution limits, experiment windows and model/provider spend               |

### Owner controls

Provide Start operations, Pause new work, Stop all outbound writes, Pause customer replies, Run selected workstream, and Take over conversation. A stop flag is enforced by the action gateway before every external effect, not just in the next model prompt.

Provide three modes: Observe; Operate within standing permissions; Maintenance/incident. Initial connection setup is Observe. The owner explicitly enables standing policies by channel and action class. Routine permitted work then runs without individual approval requests. Sensitive exceptions go to the exception queue.

Local login must have real access control, not a cosmetic login screen. Include administrator and operator roles, secure session handling, CSRF protection, origin/host validation, audit events and MFA for privileged access. Mask secrets and customer-sensitive evidence. The dashboard does not reveal raw passwords after entry.

## 9. Autonomy and standing authority

Permission is a versioned record with actor, target account, allowed operations, allowed asset scope, claim constraints, time window, rate/cost limits, expiry and emergency-stop applicability.

|Class                   |Examples                                                                                                |Default once owner enables operations                                                |
|------------------------|--------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
|Observe                 |Crawl, compare facts, fetch permitted analytics, validate forms without submitting                      |Autonomous                                                                           |
|Create                  |Research briefs, article drafts, code patches, social variants                                          |Autonomous                                                                           |
|Routine publish         |Verified articles, selected social/GBP updates, permitted FAQ/metadata edits                            |Autonomous within channel and asset grants after tests                               |
|Routine customer service|Answer approved questions, log a lead, request a tour, send a supported booking link                    |Autonomous within conversation policy                                                |
|Bounded repair          |Restore a proven broken CTA, fix known field mapping, roll back the agent’s failed release              |Autonomous only under an explicit repair/rollback grant                              |
|Material change         |Prices, capacities, addresses, refunds, discounts, legal wording, booking commitments, broad CRM changes|Named owner decision or a narrowly approved authoritative-data synchronization policy|
|Access or policy change |New scopes, credentials, authorization rules, critical tests, deployment gates                          |Never self-approved by a task agent                                                  |

A passing language-model quality score cannot authorize a release. Every write also needs current facts, a validated destination, permitted scope, passing deterministic checks and a content/revision-bound grant. Agents cannot edit the gateway or weaken tests to approve their own work.

## 10. Connections and credential onboarding

The owner connects websites, CMS, CRM, social/local profiles and inboxes through a guided wizard. Prefer OAuth and scoped API credentials. When only a supported browser workflow exists, provide a dedicated browser profile and an explicit human sign-in step. MFA, CAPTCHA, account recovery, identity verification and platform consent remain human checkpoints; do not bypass them.

Separate account connection from permission to act. Each adapter reports NOT_CONNECTED, READ_ONLY, STAGING_READY, WRITE_READY, NEEDS_REAUTH, UNSUPPORTED_ACTION or DEGRADED. A password supplied for a local directory does not establish that automated publishing is supported or permitted.

Store secrets in an OS-backed vault or equivalent managed local secret service. Browser storage state is a credential and requires the same protection.

Onboarding tests verify account identity, location/page ownership, environment, scopes, accessible assets, read-back and rate limits. Mark write readiness separately for posts, reviews, profile edits and direct messages. Refresh sessions and tokens only through supported flows. Never put secrets in source control, prompt files, screenshots, logs or ordinary output folders.

## 11. Demand intelligence: words, FAQs and rankings

Use three distinct classes of evidence: measured first-party data; licensed or platform-provided research; and clearly labeled hypotheses. A plausible Claude-generated question is not a measured trend.

### Inputs

Import connected Search Console queries/pages, on-site search and no-results events, de-identified inquiries, CRM lost reasons, review themes, approved competitor observations, Google Trends data when accessible, and permitted search-result research. Google Trends’ current API is access-controlled alpha; do not assume credentials automatically provide access. Approved exports or a properly licensed provider can be used when API access is unavailable. Its measures describe interest, not absolute search volume.

### Observation schema

Store source, collection method, query/topic, normalized intent, geography, device, language, search surface, observation time, covered period, value/unit, sample size, missing-data state and comparability group. Record raw and normalized values separately. Maintain seasonality and source-specific scaling; never divide arbitrary indices from different incomparable data extracts.

### Trend algorithm

Compute short-window versus matched baseline changes only when there is enough valid evidence. Compare same weekdays and relevant seasonality where possible. Require a configured minimum sample; a rise from one observation to two is not a proven commercial trend. Attach uncertainty and source disagreement. Rank proposed actions by business fit, verified demand, coverage gap, inventory fit and effort, not just growth percentage.

The output is a cluster with intent, supporting questions, mapped page, source facts, proposed action and measurement plan. A trend may justify improving an existing page rather than creating a new one. Maintain one canonical commercial intent mapping to reduce self-competition.

### Rankings

Separate Search Console average position, a location/device-specific result observation, local-map visibility, AI mentions, citations and referral conversion. Search Console API results have completeness limits; an omitted query is not necessarily zero demand. Rank tracking requires comparable geography/device/time and a permitted data source. Repeated manual chatbot questions are labeled samples, not a universal ‘ChatGPT rank’.

## 12. SEO, AEO, GEO and ChatGPT business visibility

The full-page model covers crawlability, canonical/indexing, metadata, HTML/DOM rendering, useful page content, factual accuracy, internal linking, media, structured data, accessibility, mobile behavior and conversion destinations. Schema is generated from approved entity records and must agree with visible content. Preserve real locations and ownership distinctions; do not invent a location because a keyword mentions a city.

Google’s current guidance favors ordinary SEO fundamentals and useful original content for its AI search features; special AI markup is not required. Its current documentation also describes a generative-AI inclusion control and a Generative AI performance report in Search Console. Verify the target account’s available controls and data access; do not assume a public API exposes every UI report.

### ChatGPT-specific scope

Businesses in ChatGPT launched in beta on November 10, 2026. Eligible businesses can claim a presence and access aggregate engagement insights. Profile verification and feature eligibility must be checked for WorkSocial rather than presumed.

A09 maintains claim/verification tasks, approved profile facts, available aggregate observations, destination links and a clearly labeled AI-query test set. Business Hub does not expose individual consumer prompts or Business Agent chats to businesses; missing insight metrics are not automatically zero. Consequently, A04 must not promise access to every customer’s ChatGPT question and A27 cannot treat those private conversations as an inbox.

All 30 WorkSocial agents remain Claude-based. A ChatGPT-native Business Agent is a separate OpenAI-hosted product, not a local Claude worker. It is outside this system’s default execution scope. Managing approved presence information does not require adding a non-Claude worker or automatically launching a ChatGPT-native agent.

## 13. On-site semantic search

Release 1 includes a real searchable space/service catalog. Claude interprets intent; deterministic structured filters enforce geography, capacity, service, verified amenities and availability constraints; lexical/entity retrieval supplies candidates; Claude can rerank and explain those candidates from evidence. This is the strict Claude-only reasoning path and does not require an external embedding model.

The storage interface may later support embeddings, but adding a separate model is an explicit configuration decision, not an unannounced dependency. Unsupported prices or availability are omitted, not inferred. Answers must identify source pages and useful booking/inquiry actions. Customer-specific records never enter the public search index.

Create a curated test set including synonyms, misspellings, multiple constraints, ambiguous time/date, unknown budgets, inaccessible spaces, stale prices and no matching inventory. Critical constraints must pass deterministic checks. Return an honest no-match or partial-match explanation rather than recommending an ineligible room.

## 14. Content production and publish-everywhere behavior

A campaign has one factual core, one canonical owned-site asset when appropriate, and a separate destination variant for each supported channel. The destination registry controls allowed formats, eligibility, identity, limits, links, location relevance and publication timing. ‘Everywhere’ means every connected, authorized and suitable destination, not mass publication to unrelated sites.

Workflow:

Evidence -> Topic cluster -> Brief -> Facts -> Draft -> Independent QA -> Canonical release -> Destination variants -> Policy check -> Publication -> Read-back -> Outcome collection

Publish substantive owned-site material first when a campaign depends on its URL. Later channel jobs depend on the verified destination page, not merely a scheduled draft. Adapt full articles, short updates, image captions and offers to their destinations. Use canonical controls where the destination supports them and they match the publication strategy; do not assume canonical tags force search engines to ignore copies.

Do not automatically rewrite the same page every day. Establish observation windows and cooldowns after content changes, while allowing immediate fixes for verified factual or technical defects. Each change has a hypothesis and measurement window. Google prohibits scaled content and other spam practices aimed at manipulating search rather than helping users.

### Destination matrix

|Destination                        |Release 1 behavior                                                                                           |Gate                                                                         |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
|WorkSocial’s actual CMS/blog       |Full article, landing-page improvement, FAQ and metadata where mapped                                        |Verify the live CMS/repository and editable source first                     |
|Google Business Profile            |Supported location-specific updates, events/offers, approved review responses and factual profile maintenance|Verify ownership, API approval, endpoint support and scope                   |
|LinkedIn organization              |Supported organic posts and links to articles                                                                |Organization role, product access and publishing permission                  |
|Facebook/Instagram                 |Supported post/media variants and inbound responses where separately authorized                              |Correct account type, app review/scopes and channel rules                    |
|Additional owned blogs/publications|Adapted article or permitted syndication                                                                     |Test actual publish/read-back capabilities; do not assume a public API exists|
|Bing/Apple/local directories       |Profile or listing accuracy, and only update formats the service supports                                    |Ownership, eligibility and official/permitted access                         |
|ChatGPT Business Hub               |Verified profile/presence management and available insights                                                  |Account verification and feature availability; no invented blog-post API     |

Save per-destination outcome independently: PUBLISHED_VERIFIED, ACCEPTED_PENDING, FAILED, UNKNOWN_REMOTE_OUTCOME, NEEDS_REAUTH, UNSUPPORTED_ACTION. Show partial success honestly. A provider acknowledgement is not necessarily proof that a public post is visible.

## 15. Continuous website and journey testing

Proposed starting cadences below are load-limited operating defaults, not externally guaranteed service levels. Validate them against host resources, provider quotas and authorized test budgets.

|Probe                                               |Starting cadence                                   |Claude invocation                            |
|----------------------------------------------------|---------------------------------------------------|---------------------------------------------|
|Host/service heartbeat and essential HTTP/TLS checks|Every 1-5 minutes                                  |Only anomalous or repeated failures          |
|Critical page render and CTA checks                 |Every 15 minutes, staggered                        |Diagnosis on reproducible failures           |
|Form presence and validation without submission     |Every 15-30 minutes                                |Failure or changed behavior                  |
|Authorized end-to-end form-to-CRM canary            |Hourly for pilot path; rotate remaining forms daily|Failure, drift or missing downstream evidence|
|CRM/token/synchronization health                    |Every 5-15 minutes or supported event              |Anomaly classification and repair proposal   |
|Selected performance probes                         |Hourly sample; deeper daily audit                  |Sustained regression                         |
|Whole-site crawl and desktop/mobile sampling        |Nightly, with priority subsets after releases      |New material findings                        |
|Demand/FAQ refresh and comparable rank observations |Daily, subject to data freshness                   |Opportunity generation                       |
|Editorial and commercial experiment review          |Weekly                                             |Planning and interpretation                  |
|Inbox                                               |Event-driven or supported bounded polling          |Each actionable inbound turn                 |

Tests must exercise visible user behavior, isolate browser sessions and keep unstable third-party integrations separate from deterministic contract tests. Use controlled real integration canaries in addition to mocked adapter tests; a mocked CRM success does not prove production delivery.

Inventory and coverage: every discovered page, form, CTA, integration and channel gets a stable identity and owner. Report discovery-source counts, unreachable assets and unbound pages. ‘100% coverage’ always states the denominator and exclusions. Every customer-facing form gets a test specification; never say the entire site works because the homepage loads.

## 16. Forms and CRM: definition of a passing transaction

For each form, record: page/source binding; selectors and labels; required fields; client/server validation; consent behavior; handler endpoint; success/failure UI; spam-control mode; CRM module/field mapping; deduplication policy; assignment rule; notification destination; analytics event; and timeout.

An authorized canary must prove:

1. The intended page renders and the form accepts a valid synthetic submission.
2. Invalid inputs are rejected appropriately; tests do not weaken production security.
3. The server records durable acceptance with a correlation ID, not just an HTTP 200 wrapper.
4. Exactly one expected test lead/contact appears in the correct Zoho organization/module within the defined eventual-consistency window.
5. Service, location, date, source/UTMs, consent and test classification map correctly.
6. The appropriate assignment/notification path executes to controlled internal recipients.
7. Retrying the same authorized transaction does not create a duplicate.
8. Test data is excluded from business revenue, conversion reporting and marketing audiences and is cleaned up or retained under the approved test-data policy.

Use dedicated test identities, controlled email/phone sinks, designated test ownership and explicit synthetic budgets. Prefer sandbox/developer environments for destructive or expansive tests. Zoho has environment-specific token/API boundaries; the adapter must validate organization and environment before any write.

Do not trust a public client-side is_test=true flag to bypass rules. The server-side canary authorization must be authenticated and narrowly scoped. Production CAPTCHA must not be bypassed; test test-key configurations in staging and use only approved real production flows. Never reserve real inventory, charge a card, send a marketing blast or delete live customer records as an incidental form test.

## 17. Integration reliability and reconciliation

Treat each integration as a stateful adapter with identity, scopes, environment, supported actions, token expiry, rate budget, last successful event, delivery watermark and reconciliation schedule. Zoho notifications can signal record changes and have configurable expiry; renew subscriptions and verify delivery rather than assuming webhooks last forever.

Use durable inbox/outbox records, stable event IDs and bounded retries with jitter. Enforce source-of-truth ownership per field to prevent a website-to-CRM-to-website update loop. Serialize token refresh per credential. Encrypt sensitive payloads and redact traces. Failed events go to a visible quarantine queue with reprocessing instructions.

Authenticate incoming events using the provider-supported mechanism; reject malformed, replayed or unauthorized payloads. A channel identifier alone must not be treated as proof of authenticity. When a provider lacks an adequate signed webhook mechanism, use its supported verification controls and authenticated record read-back, or fall back to polling.

Reconciliation checks detect missing CRM records, out-of-order updates, incorrect assignments, broken URLs, expired sessions and drift after API-version changes. Do not create a new lead merely because an eventual-consistency read is temporarily empty. Bound the wait and inspect correlated receipts first.

## 18. After-hours customer-response workflow

Workflow:

Message received -> Authenticated ingestion -> Deduplicate -> Conversation lease -> Classify -> Retrieve current facts -> Check allowed action -> Reply/send -> Provider receipt -> CRM update -> Handoff or close

Supported channels are established during onboarding. Candidate channels include the website chat/form, connected business email and eligible social/business messaging accounts. Never promise that a platform exposes a direct-message API merely because it supports public posts.

The concierge identifies itself as WorkSocial’s virtual assistant where appropriate, answers from approved facts, asks only necessary qualification questions and records the conversation outcome. It can give verified room details, explain documented policies, collect location/date/size needs, send a working booking link and create a qualified lead under standing permission.

Availability must come from a current booking-system response. A recommendation is not a reservation; a tour request is not a confirmed appointment. Confirm only after the relevant system returns an authoritative receipt. Paid bookings, cancellations, refunds, concessions and contractual changes are outside the default release 1 scope.

Escalate sensitive disputes, legal questions, payment problems, emergency/access issues, unknown claims and requests to bypass policy. Do not promise a human response time that staffing cannot support. A morning handoff contains the lead, actual customer questions, verified answer, requested action, urgency and next owner.

An atomic human-takeover switch stops AI sending for that conversation, including queued messages. The gateway compares the current conversation version before send. Reject stale responses prepared before a human reply. Add message-count limits, duplicate suppression and auto-responder loop detection.

### Platform constraints

Google’s former Business Profile native chat/call-history feature ended on July 31, 2024. Eligible profiles may offer text-message or WhatsApp contact; integrate the supported underlying channel, not a nonexistent legacy Google inbox.

Enforce current platform messaging windows, account permissions and consent constraints at send time. Instagram documentation describes the standard messaging window and a distinct human-agent mechanism; automated AI responses must not use a human-only exception to evade those rules.

No cold-message campaign is implicitly authorized by after-hours support. Do not merge identities across channels without verified linking. Email address knowledge alone is not authentication for changing a customer’s booking or disclosing account details.

## 19. Autonomous repair and release loop

Detect -> Reproduce -> Collect evidence -> Classify risk -> Acquire asset lease -> Patch isolated source -> Run regression tests -> Independent review -> Authorize -> Stage -> Release -> Read back -> Monitor -> Close or compensate

Preapproved low-risk repair classes can execute without waking the owner. Examples: restore a known correct CTA, repair a verified content formatting defect, refresh allowed metadata from authoritative facts, or retry an idempotent integration delivery. Price changes, credentials, authentication, legal policies, payment logic and broad CRM automation are not silently classified as low risk.

Default maximum is two repair attempts for the same incident before escalation. A failed repair cannot respond by disabling the failing test. Protect test baselines, policy files and gateway code from the repairing worker. Require a change-set size limit and one-site/asset blast radius; larger changes need a technical review.

Each release records prior state, source revision, proposed diff, facts, tests, reviewer verdict, grant, provider acknowledgement and live read-back. Revalidate if a human changed the same content after the proposal. One early canary asset is verified before fan-out to similar pages.

Rollback means an operation-specific recovery: reverting a CMS revision or code commit may be possible; unsending email or undoing a customer’s interpretation is not guaranteed. Record irreversible effects and use an approved correction/escalation rather than claiming every external action is reversible.

## 20. State, data models and API boundaries

Minimum additions to the v2 schema:

|Records                                                               |Purpose                                                |
|----------------------------------------------------------------------|-------------------------------------------------------|
|`hosts`, `service_heartbeats`, `storage_roots`                        |Local execution readiness and selected paths           |
|`agent_definitions`, `agent_subscriptions`, `agent_runs`              |Exactly 30 versioned roles and their executions        |
|`standing_policies`, `capability_grants`, `policy_decisions`          |Owner authority and per-action enforcement             |
|`asset_bindings`, `asset_leases`, `change_sets`, `release_receipts`   |Controlled edits with conflict detection               |
|`observations`, `intent_clusters`, `question_clusters`, `rank_samples`|Evidence-backed demand and visibility                  |
|`channel_accounts`, `adapter_capabilities`, `publication_jobs`        |Destination-specific publishing readiness and results  |
|`form_specs`, `synthetic_identities`, `journey_runs`, `journey_steps` |Reproducible, correlated form/CRM tests                |
|`integration_events`, `inbox_events`, `outbox_events`, `sync_cursors` |Reliable synchronization and deduplication             |
|`conversations`, `messages`, `conversation_leases`, `handoffs`        |Controlled customer-response state                     |
|`crm_links`, `lead_events`, `booking_receipts`                        |Business outcomes without inventing transaction success|
|`incidents`, `repair_attempts`, `test_evidence`, `exceptions`         |Repair limits and independent verification             |
|`cost_ledgers`, `daily_budgets`, `measurement_windows`                |Resource control and outcome tracking                  |

Customer data is segregated from public content facts. Grant access by role and purpose. Define retention and deletion procedures for message content, test records, browser traces and backups. Conversation data is not automatically repurposed into public blog content; use de-identified themes and permissions.

Expose narrow application endpoints for workstream launch, role control, standing-policy changes, artifact views, takeover and status. Connector write endpoints are service-internal and require scoped grants. The web UI never passes a raw shell command or unvalidated filesystem path to the runner.

## 21. Observability and performance contracts

Every action has workflow ID, job ID, role/version, asset/channel ID, source version, policy/grant, trace ID and outcome. A dashboard event must link to evidence. Record queue latency, role latency, tool failures, rework, tokens/cost, duplicate-prevention counts, stale data, publication outcomes, unresolved conversations and CRM canary results.

Separate a technical alert from a business-impact incident. A lead pipeline failure deserves higher priority than a missing descriptive alt attribute on a rarely visited image. Group duplicate incidents so ten failing checks on the same broken dependency do not spawn ten conflicting repairs.

### Proposed release 1 targets, to be measured in the controlled test environment

- Critical probes scheduled within the configured five-minute interval while the host is healthy.
- Eligible inbound messages begin handling within 60 seconds under tested normal load; mark provider/host outages separately.
- Every successful public write has a grant, receipt and read-back or explicitly documented provider limitation.
- No duplicate send or publication in the injected retry/restart test suite.
- No unsupported critical price, capacity, address or availability claim in the release evaluation suite.
- All known forms have a declared coverage state and owner.
- Local restart restores queues and settings without re-executing already reconciled external effects.

These are acceptance targets, not claims of implemented performance or guarantees of internet/platform uptime.

## 22. Evaluation and adversarial tests

Role files alone are not agents that work. Require meaningful deterministic checks for every role and repeated model trials for judgment-heavy roles. Anthropic’s evaluation guidance emphasizes verifying actual environment outcomes rather than trusting an agent’s statement of success.

### Minimum release suites

|Suite           |Required cases                                                                                                                 |
|----------------|-------------------------------------------------------------------------------------------------------------------------------|
|Runtime         |Clean boot, editor close, host restart, machine sleep, lost connection, quota exhaustion, expired auth, full disk              |
|Authority       |Wrong site/account, expired grant, revoked policy, stale content hash, emergency stop during send, malicious policy edit       |
|Concurrency     |Two agents edit one page, old lease holder returns, human edits while staged, duplicate scheduler start                        |
|Publishing      |Provider 429/5xx, accepted-but-hidden post, timeout after acceptance, partial campaign, unsupported format, expired offer      |
|Content         |Conflicting price, fabricated capacity, no evidence for claim, near-duplicate city pages, rights-missing photo                 |
|Research        |Incomparable Trends indices, missing GSC rows, low-sample spike, synthetic question labeled as observed, stale rank observation|
|Browser         |Mobile layout, keyboard journey, JS failure, missing CTA, broken third-party handoff, hidden placeholder false positive        |
|Forms           |Invalid input, timeout, double-submit, wrong CRM module, dropped field, wrong owner, notification missing, event not excluded  |
|Integrations    |Expired tokens, replayed webhook, reordered event, duplicate identity, cross-environment token, subscription expiry            |
|Customer service|Unknown availability, refund request, user demands human, stale reply, opt-out, window closed, auto-reply loop                 |
|Security        |Web/email prompt injection, secret exfiltration, malicious file path, cross-customer leakage, unsafe attachment                |
|Recovery        |Database restore, artifact restore, ambiguous remote outcome, failed rollback, no hosted intake fallback                       |

The core semantic-search corpus starts at 100 curated scenarios. Add at least 60 customer-service cases spanning known answers, ambiguity, timezones, privacy and escalation. Every agent has at least a valid task, a missing-permission task and a malicious/unsupported-input task. Counts are proposed minimums; useful coverage matters more than passing shallow examples.

## 23. Release 1 implementation work packages

All packages below belong to release 1. Build them sequentially to reduce risk; do not defer CRM testing, after-hours response or the local runtime to a vague later phase.

|Package                       |Deliverables                                                                            |Acceptance evidence                                              |
|------------------------------|----------------------------------------------------------------------------------------|-----------------------------------------------------------------|
|R1-01 Local bootstrap         |VS Code tasks, local service lifecycle, folder wizard, health checks, persistent storage|Restart and selected-folder tests                                |
|R1-02 Identity and authority  |Login, roles, standing grants, independent write gateway, secret broker                 |Unauthorized-write and stop-switch tests                         |
|R1-03 Production mapping      |Site/CMS/repo bindings, forms, booking and CRM ownership                                |Read evidence for every pilot write path                         |
|R1-04 Thirty-role runner      |Role contracts, CLI adapter, queues, budgets, independent review                        |All 30 role evaluations; no uncontrolled recursion               |
|R1-05 Monitoring and tests    |HTTP/browser probes, form-to-CRM canaries, integration reconciliation                   |Real controlled canary with correlated receipt                   |
|R1-06 Knowledge and research  |Fact registry, instruction ingestion, trends/FAQ/rank data model                        |Supported/unknown/hypothesis labeling                            |
|R1-07 SEO and search          |Page optimization, schema validation, semantic search                                   |Golden tests and verified pilot page release                     |
|R1-08 Content and distribution|Article pipeline, destination variants, supported live adapters                         |Canonical article plus GBP and social receipts where authorized  |
|R1-09 Customer response       |Inbox, concierge, lead logging, takeover, handoff                                       |Controlled after-hours exchange and Zoho record                  |
|R1-10 Bounded repair          |Isolated patches, canary release, rollback, attempt limits                              |Injected defect -> detected -> repaired -> independently verified|
|R1-11 Business measurement    |Funnel joins, cost ledger, test-data exclusions, reports                                |Reconciled observation without overstated attribution            |
|R1-12 Recovery and security   |Backups, restore drill, outage behavior, red-team fixtures                              |Signed-off evidence bundle and outstanding gaps                  |

An external capability can be implemented and contract-tested yet blocked by missing credentials or provider approval. Label it blocked, not live. The overall release is not complete for a required live channel until the actual authorized end-to-end demonstration passes or the owner explicitly accepts that channel as an excluded dependency.

## 24. Required acceptance demonstration

Run one connected scenario on deliberately selected, authorized assets:

1. The owner logs in, selects folders, connects verified accounts and enables scoped standing permissions.
2. All 30 role cards show real contracts, schedules/triggers and test evidence, not invented activity.
3. Demand research identifies a supported customer question and maps it to an actual WorkSocial offering.
4. Agents improve a page, publish a useful owned-site article and release relevant channel variants within standing permissions.
5. The publication dashboard displays actual remote identifiers and verified outcomes, including blocked destinations.
6. A synthetic customer journey passes from page to form to the correct Zoho test record and controlled notification.
7. An injected safe integration defect causes failure; diagnosis and bounded repair restore the same canary.
8. An after-hours inquiry receives a supported answer, creates a qualified test lead and hands off when a human is requested.
9. Human takeover stops an already queued agent reply.
10. The host restarts midway through a staged job; pending work resumes and no publication or reply duplicates.
11. A supplied malicious webpage cannot change instructions, read secrets or authorize posting.
12. The owner receives a report showing real changes, inquiries, evidence, costs, failures and next actions.

Run the demonstration with controlled test recipients; do not use unsolicited real-customer traffic as a test harness.

## 25. Business metrics and learning

The operating goal is qualified demand converted into actual inquiries, tours, bookings and revenue, not output volume. Measure owned-page visibility, profile engagement, real publishing success, customer response quality, lead delivery, booking handoff and attributable outcomes. Distinguish observed association from causal lift; respect seasonality and sufficient observation windows.

The analytics role proposes changes to strategy and playbooks. It cannot silently change authority, spend, source facts or test thresholds. Approved learning becomes a versioned instruction change with regression tests. Keep the system from optimizing for cosmetic health scores while bookings fail.

## 26. Source register and verification notes

Primary documentation reviewed November 15, 2026. Platform entitlements, quotas and APIs must be checked again during implementation. Most architectural requirements above are proposed engineering decisions, not vendor guarantees.

- [S01] Claude Code, Run programmatically: https://code.claude.com/docs/en/headless
- [S02] Claude Code, Custom subagents: https://code.claude.com/docs/en/sub-agents
- [S03] Claude Code, VS Code integration: https://code.claude.com/docs/en/vs-code
- [S04] Claude Code, Scheduled tasks: https://code.claude.com/docs/en/scheduled-tasks
- [S05] Temporal, Self-hosted guide and production checklist: https://docs.temporal.io/self-hosted-guide and https://docs.temporal.io/self-hosted-guide/production-checklist
- [S06] Anthropic, Building effective agents: https://www.anthropic.com/research/building-effective-agents
- [S07] Claude Code, Permissions: https://code.claude.com/docs/en/permissions
- [S08] Claude Code, Sandboxing: https://code.claude.com/docs/en/sandboxing
- [S09] Playwright, Authentication: https://playwright.dev/docs/auth
- [S10] Google Trends API alpha and methodology: https://developers.google.com/search/apis/trends and https://developers.google.com/search/blog/2025/07/trends-api
- [S11] Search Console Search Analytics API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- [S12] Google, Generative AI optimization guidance: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- [S13] Google, Generative AI performance report: https://support.google.com/webmasters/answer/16984139
- [S14] OpenAI, Introducing Businesses in ChatGPT, November 10, 2026: https://openai.com/index/introducing-businesses-chatgpt/
- [S15] OpenAI, Setting up your business on ChatGPT: https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt
- [S16] Google Search spam policies: https://developers.google.com/search/docs/essentials/spam-policies
- [S17] Google Business Profile API setup: https://developers.google.com/my-business/content/basic-setup
- [S18] Google Business Profile posts: https://developers.google.com/my-business/content/posts-data
- [S19] LinkedIn Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-07
- [S20] Playwright, Best practices: https://playwright.dev/docs/best-practices
- [S21] Zoho CRM V8, Environment-specific authentication: https://www.zoho.com/crm/developer/docs/api/v8/access-refresh.html
- [S22] Zoho CRM V8, Notifications: https://www.zoho.com/crm/developer/docs/api/v8/notifications/overview.html
- [S23] Google Business Profile chat changes: https://support.google.com/business/answer/14919056
- [S24] Meta, Instagram message sending and changelog: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message and https://developers.facebook.com/documentation/business-messaging/instagram-messaging/changelog/
- [S25] Anthropic, Demystifying evals for AI agents: https://www.anthropic.com/research/demystifying-evals-for-ai-agents

## Final implementation rule

Thirty roles share verified knowledge, durable task state and explicit authority. They do not share unrestricted credentials or a license to change anything. The owner operates the system from a local dashboard; Claude Code does the reasoning and engineering; deterministic services keep work running; verified outcomes, not agent assurances, establish completion.
