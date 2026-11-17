# WorkSocial Operations
## End-to-end experience, user flows and design guide - v5

**Product:** Local 30-agent visibility, content and customer-journey operating system.  
**Design date:** November 17, 2026.  
**Deliverables:** Interactive HTML, flow catalog, screen contracts, user stories, integration playbooks and implementation handoff.  
**Execution boundary:** All operational reasoning roles use local Claude Code workers. Gemini and the separate Claude API are test instruments in the Evaluation Lab.  
**Current artifact:** Offline design prototype. Sample facts, providers, metrics, approvals and receipts are not live business records.

## 1. The experience we are building

The owner should be able to establish a trusted workspace, connect the right accounts, define what the agents may do, launch a goal and inspect the result without reading agent transcripts. The product is successful when the owner can answer five questions: What is running? What changed? What evidence supports it? Did the customer journey work? What decision is needed from me?

A connection is not a permission to act. A permission is not proof of execution. A provider acknowledgement is not always proof of a publicly visible result. These distinctions govern onboarding, navigation, buttons, status labels, analytics and acceptance tests.

The interface has two complementary loops. The autonomous loop observes, prioritizes, creates, validates, authorizes, executes and verifies. The owner loop configures, reviews exceptions, understands outcomes and adjusts policy. The owner should not become the manual dispatcher for every routine task. Conversely, the agents cannot become the authority for financial, privacy, business-fact or access decisions.

### Product boundaries

There are exactly 30 operational roles, not 30 continuously busy inference sessions. The local scheduler invokes bounded jobs. HTTP checks, browser assertions, queue leases and arithmetic remain deterministic; Claude handles interpretation, planning, writing, diagnosis and eligible conversations. This follows the distinction between workflows and agentic decisions described by Anthropic. [R29]

VS Code is the workspace and launcher. The actual dashboard, API, workflow supervisor, database, browser pool, credential broker and action gateway are durable local services. Closing an editor is not the same as stopping the services. A sleeping or disconnected host cannot provide continuous coverage. The existing hosted site and durable inquiry intake remain independent of the agent computer.

Google Search Console, Google Analytics 4, Google Ads, ChatGPT Ads, Claude API and Gemini API are distinct integrations. A connected Google identity does not authorize all Google products. A Claude Code session does not establish a separate Claude API test budget. A ChatGPT Ads credential is not an inference key or an organic business-presence connection.

## 2. People, jobs and permissions

| Persona | Job to be done | Default authority | Success evidence |
|---|---|---|---|
| Owner / Shantanu | Set commercial goals and acceptable autonomy | Policies, sensitive exceptions and exact financial approvals | Verified outcomes and an intelligible exception queue |
| Technical administrator | Establish host, adapters, source bindings and recovery | Infrastructure configuration; no assumed financial approval | Diagnostics, capability tests, restore evidence |
| Growth operator | Plan demand coverage, content and channel work | Draft and permitted operational actions | Released assets, valid channel receipts and measured journeys |
| Independent reviewer | Judge a specific candidate against facts and tests | Approve/reject eligible revisions; cannot self-approve authored work | Revision-bound decision with sources and check results |
| Customer-care operator | Resolve customer questions and take over threads | Assigned conversations, qualified leads and permitted handoffs | Delivered message, correct CRM linkage and acknowledged handoff |
| Analyst / observer | Explain what the evidence supports | Read and export appropriately redacted evidence | Saved analysis with definitions, maturity and limitations |

One person may hold multiple roles, but an independent-review requirement still needs a distinct authorized reviewer or approved independent review service. The prototype previews that boundary; it does not implement authentication or enforce organizational separation.

## 3. Experience principles and behavioral design

### Hooked, applied to useful work

Use a relevant trigger: a lost lead, a verified opportunity, a blocked release or the owner's scheduled review. Make the first action small and meaningful: inspect the failed step, approve the exact safe revision, or launch a bounded mission. The reward is verified progress, reduced uncertainty and saved work. The investment is approved knowledge, reusable policies, corrected mappings and well-designed tests. [R22]

Avoid manufactured urgency, streaks, random celebratory rewards, endless notifications and a need to check the dashboard constantly. A quiet system that reliably completes permitted work is a good outcome. The daily brief is a stopping point, not an invitation to scroll forever.

### Contagious, applied to content and shared insight

Use STEPPS as a creative checklist: make a shared brief useful to its recipient; connect topics to real planning moments; use honest human relevance rather than alarm; make externally shareable outcomes visible only after redaction; deliver practical guidance; and structure stories around a problem, evidence, action and result. [R23]

The product does not expose customer identities or credentials to make a story more compelling. It does not equate posting volume with distribution quality. One useful canonical article produces appropriate variants for connected destinations, rather than identical copies submitted indiscriminately.

### Restraint at the surface; depth underneath

The visual language uses generous whitespace, a narrow hierarchy of type sizes and a restrained forest-green accent. Dense evidence belongs in a well-structured table, inspector or review panel, not on every overview card. Apple HIG and Blueprint are references for clarity and structured operational interfaces, not copied brand identities or a claim of affiliation. [R24, R25]

## 4. Information architecture

| Navigation group | Screens | Owner question |
|---|---|---|
| Operate | Overview, Activation guide, Missions, Agent fleet, Review desk | What is happening, and what needs a decision? |
| Grow | Sites, Demand, Content, Distribution, Local/AI presence, Semantic search | What should we improve and publish? |
| Measure | Analysis room, Paid media, AI evaluation lab | What do the observations actually establish? |
| Protect and respond | Journey tests, CRM, Inbox | Are leads arriving and customers being helped? |
| Govern | Connections, Autonomy, Knowledge, Changes, User flows, Design, Outcomes, Workspace | What is allowed, what is known, and how can we recover? |

The 25-screen prototype preserves the original operating surfaces and adds eight new surfaces: Activation guide, Review desk, Analysis room, Paid media, AI evaluation lab, Autonomy and limits, User flows and Design guide. Connections is rebuilt around six provider-specific setup journeys.

Every route has an identifiable title, a primary action, a meaningful empty state, an evidence path and a recovery path. Shared context includes workspace, site, environment, time zone and operating mode. Simulated, staging and production contexts must never rely on color alone.

## 5. The first-time owner path

### Before opening the application

The technical administrator installs and starts the local services, configures the initial owner identity, supplies the provider OAuth application configuration and sets up the protected credential broker. The owner obtains permission to the actual sites, analytics properties, ad accounts, CRM organization and channel profiles. No passwords or private keys should be pasted into a chat, Markdown file or static prototype.

### What the owner does

1. Open the local dashboard, sign in and confirm the business time zone and handoff recipients.
2. Run host diagnostics and choose planned output folders. A real local picker validates paths; the HTML only demonstrates that interaction.
3. Register the authorized website and verify the actual editable source, staging environment and deployment route.
4. Confirm authoritative owners for names, addresses, capacities, offers, hours and booking availability. Exclude unresolved facts from pilot work.
5. Connect Search Console and GA4 to establish the baseline. Connect ad accounts and model APIs separately for their selected workstreams.
6. Map a controlled form-to-CRM journey and verify the intended organization, environment, field mapping and notification recipients.
7. Run a no-write rehearsal and inspect the concrete proposed assets, policies, evidence and test results.
8. Enable a read-and-draft pilot. Grant selected public-writing, repair or reply permissions only after reviewing their exact boundaries.

The owner can pause and return without losing progress. A skipped optional connection must be represented as excluded or blocked, not secretly treated as complete. Paid media and model testing do not block basic read-only website monitoring.

### From one successful pilot to standing autonomy

The initial pilot should cover one commercial page, one safe content campaign, one controlled lead journey and one eligible after-hours inquiry. Expand by asset class only after the same end-to-end evidence passes. A successful pilot is not permission to increase an advertising budget, change prices or extend access to a different organization.

## 6. Autonomy modes and stopping behavior

**Observe:** Read, research, test without side effects, and draft. No public publishing, paid-media mutation or automated customer reply.

**Operate within standing policies:** A narrowly scoped grant permits eligible actions after checks. The gateway enforces asset scope, destination, environment, content/source revision, expiration, rate/cost bounds and current stop status immediately before execution.

**Maintenance:** Preserve evidence and permit diagnosis while external effects are disabled. Recovery verifies pending remote outcomes before resuming work.

Three controls remain distinct: Pause new work stops leasing new jobs; Stop outbound effects prevents mutations and sends; Take over conversation revokes queued AI sends for a specific thread. Read-only monitoring can continue under an outbound stop while the host is healthy. Delivered messages and real-world customer interpretations cannot be assumed reversible.

No broad 'optimize everything' command can expand financial or privacy authority. Routine content can run under a standing grant; exact advertising budget changes require a separate owner decision in this release. Model evaluations have no publishing, CRM or customer-message tools.

## 7. Visual and interaction design guide

### Foundations

Use the included design-token files as the implementation baseline. The core palette is deep forest for navigation and primary text, warm off-white for the workspace, clean white for work surfaces and a muted green for a verified positive state. Amber denotes waiting, conflict or incomplete evidence; red denotes a concrete blocking condition. Never use green to mean 'probably okay'.

Use a system sans-serif stack; no external font dependency is required. Main titles are approximately 28-32px on desktop and 24-28px on mobile; body and controls target 14-16px in the production implementation. Dense secondary labels may be smaller only where legible and nonessential. The existing prototype retains some compact desktop micro-labels; final accessibility review must validate legibility rather than treating visual QA as certification.

Use a 4px spacing foundation with 8/12/16/24/32px steps, 1px low-contrast borders, restrained 8-14px radii, and minimal shadows. Monospace is reserved for revision IDs, reference IDs, timestamps and exact values. Do not turn all text into uppercase; eyebrow labels provide structure without becoming the main reading surface.

### Interaction standards

Use explicit verbs: 'Verify read access', 'Approve exact revision', 'Run controlled test', 'Take over conversation'. Avoid vague 'Done' buttons for actions with external effects. One primary action per panel; destructive or financial actions are visually separate. Confirmation text identifies the object, environment, old/new value and effect. Sensitive confirmations are not preselected.

Tables preserve column meaning and use drill-down rather than microscopic text. Charts expose a tabular alternative and their source/time window. An inspector includes evidence freshness, owning agent, revision and next action. A blocked button should explain the failed prerequisite; unavailable capabilities should not disappear silently.

A reviewer's context is stable while they inspect evidence. Source changes invalidate the decision rather than silently replacing the candidate. Non-destructive filters and draft forms should restore their state on return. For a large unsaved draft, warn before navigation; do not warn for every harmless tab change.

### Accessibility and responsive behavior

Target WCAG 2.2 AA; this is a design target, not a certification. Ensure keyboard access, visible focus, semantic labels, meaningful headings, status text, reduced-motion support, error summaries and focus restoration after dialogs. Normal text contrast target is at least 4.5:1, with applicable large-text and non-text rules checked separately. [R26, R28]

Prefer 44px touch targets for important mobile actions. WCAG's minimum target criterion has a 24px rule with exceptions; do not misrepresent 44px as the universal conformance threshold. [R27]

At narrow widths, navigation collapses to a controlled drawer, review columns stack in order, tables scroll inside their containers and long identifiers wrap. Approval or takeover must remain possible without a hover interaction. Preserve labels and evidence caveats when reducing density. Financial approval should not be optimized into an accidental single tap.

### Motion and notifications

Use short transitions to clarify state changes; honor reduced motion. A completed action updates its durable record and shows a concise confirmation. Critical alerts persist until acknowledged or resolved. Group repeated incidents by root cause; do not create thirty notifications for thirty agents observing the same broken connector.

## 8. Review and analysis are separate experiences

The Review desk answers 'May this exact action proceed?' It shows before/after values, sources, checks, author, independent reviewer, current source revision, grant, financial impact, release evidence and recovery path. Decisions are Approve exact revision, Request revision, Reject, or Hold for authoritative evidence. A high score never substitutes for permission.

The Analysis room answers 'What do we know and what should we test next?' It preserves source-specific definitions, observation windows, settled/pending states, currency, time zone, attribution model, consent limits and gaps. It does not sum platform conversions into unique bookings. A shared decision brief must distinguish observation, interpretation, hypothesis, proposed action and future measurement window.

The Evaluation Lab answers 'How well did the selected model behave under these conditions?' It preserves corpus, prompt and schema hashes; actual model IDs; tool configuration; repetitions; per-case outputs; deterministic grades; independent judgment; human adjudication; latency; usage; errors; cancellations; and cost. Fixed-corpus evaluation and open-web observation are separate run types. An API answer is not a consumer-product ranking.

## 9. State vocabulary and honest completion

Connection: Not configured -> Awaiting authorization -> Identity bound -> Capability test -> Read ready / Evaluation ready. Side states are Needs reauthentication, Wrong resource, Unsupported, Degraded and Revoked. Write readiness is an independent permission dimension.

Change: Draft -> Validating -> Needs review -> Approved exact revision -> Applying -> Verifying -> Verified. Side states are Blocked, Revision requested, Rejected, Source stale, Unknown remote outcome and Recovery required.

Measurement: Not configured, No observations, Partial, Thresholded, Pending, Stale, Failed and Available are different states. Missing data must not be rendered as zero. A delayed attributed conversion must not be called a broken tag without additional evidence.

Test: Queued, Running, Pass, Fail, Refusal, Provider error, Not run, Cancelled and Partial are distinct. Report the denominator for any pass rate. Infrastructure errors are not silently graded as wrong answers. A test suite does not authorize an external action.

## 10. Complete journey catalog

Each journey below names the owner actions, deterministic or agent behavior, required completion evidence and exception routes. These are implementation contracts, not claims that the static HTML performs the external operations. Interactive coverage is specified separately in Screen_Specifications_v5.md.

### F01 - Create a trusted local workspace

**Persona:** Owner + technical administrator  
**Entry screen:** `activation`  
**Goal:** Operate from the selected local host without confusing a running browser with a running agent service.  
**Preconditions:** An authorized administrator has installed the application and Claude Code.  
**Agent participation:** A01, A23, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Open the local application and create the owner identity. | Establish a real session in the implemented product; the prototype only previews this experience. | Owner ID, role and session record. |
| 2 | Confirm business name, time zone and notification recipients. | Validate required fields; retain America/New_York with daylight-saving rules. | Workspace configuration revision. |
| 3 | Run host diagnostics. | Check local service identity, Claude executable, network, storage, clock and single-supervisor lease. | Timestamped diagnostic results, not a decorative online badge. |
| 4 | Choose Observe as the initial operating mode. | Permit evidence collection; deny publishing, paid-media mutations and customer replies. | Initial authority decision. |
| 5 | Enable unattended startup after reviewing host requirements. | Register the local startup service only after consent; preserve queues across editor closure. | Startup result and recovery test. |
| 6 | Read the readiness summary. | Distinguish host ready, Claude authenticated, providers ready and workstreams ready. | Explicit blockers and next action for each. |

**Exceptions and recovery:** Offline host: show unavailable coverage and existing hosted contact path. Second scheduler: refuse competing execution. Remote access: require approved private access; do not expose the admin app through public webhooks.

**Done means:** Owner can sign in and see verified local readiness; no public writes have occurred.

### F02 - Choose folders and establish business truth

**Persona:** Owner + content operator  
**Entry screen:** `knowledge`  
**Goal:** Save work in owner-selected roots and prevent unknown facts becoming public claims.  
**Preconditions:** Workspace exists; operator has folder and knowledge permissions.  
**Agent participation:** A02, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select workspace, content, evidence and backup folders. | Use native/local-service picker; validate canonical paths, access and free space. | Registered root IDs and write/read probe. |
| 2 | Review the database and secret-store locations. | Keep live database and authentication state outside ordinary sync/export folders. | Storage-risk checks. |
| 3 | Import approved descriptions, venue media and operating rules. | Quarantine incoming material; record source, owner, rights and checksum. | Ingestion manifest; duplicate detection. |
| 4 | Map authoritative sources for prices, capacity, hours and availability. | Record fact ownership, validity and reference; flag contradictions. | Business fact records and unresolved conflicts. |
| 5 | Resolve or leave each conflict blocked. | Require source-backed value and reviewer; propagate changes only after validation. | Signed fact revision and impacted assets. |
| 6 | Run an export/restore rehearsal. | Create a redacted artifact manifest and verify the configured recovery procedure. | Restore evidence; secrets excluded. |

**Exceptions and recovery:** Unwritable or relative path: retain prior configuration. A document asks to change permissions: quarantine the instruction. Unknown availability: label unknown; never infer from a marketing page.

**Done means:** Content and evidence destinations are valid; every critical pilot claim has an owner and source.

### F03 - Map sites, pages and editable sources

**Persona:** Technical administrator  
**Entry screen:** `sites`  
**Goal:** Know exactly what can be edited and how a change reaches the live site.  
**Preconditions:** Owner has authorized the domain and relevant repositories/CMS.  
**Agent participation:** A06, A15, A20, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Add the domain and allowed URL boundaries. | Discover sitemaps, navigation and authorized CMS URLs; deduplicate canonicals. | Inventory with source counts and exclusions. |
| 2 | Select a pilot page. | Display current rendered page, canonical, forms, CTAs and structured data. | Timestamped HTML and screenshot snapshot. |
| 3 | Bind the page to its actual CMS item or repository source. | Verify source ownership and current revision rather than assuming the historical stack. | Source binding and deployment target. |
| 4 | Map the booking, form and CRM destinations. | Follow controlled handoffs; mark inaccessible dependencies as partial coverage. | Journey graph with owners. |
| 5 | Choose an initial editable subset and exclusions. | Apply asset allowlists; unbound pages remain read-only. | Scope grant draft. |
| 6 | Run baseline checks. | Record technical, factual, performance and conversion behavior before editing. | Baseline ID and passing/failing checks. |

**Exceptions and recovery:** Wrong environment: block publication. Redirect outside allowed domain: stop and request a binding. Discovery is incomplete: expose denominator and gaps, not a 100% claim.

**Done means:** Each pilot page has a proven editable source and release path.

### F04 - Connect Google Analytics 4

**Persona:** Owner + analytics administrator  
**Entry screen:** `connections`  
**Goal:** Read real acquisition and key-event data while keeping configuration and tracking changes separate.  
**Preconditions:** A Google Cloud project, enabled Analytics Data/Admin APIs and property access are available.  
**Agent participation:** A23, A30

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose GA4, then connect through the system browser. | Use supported OAuth with PKCE/state and least-privilege analytics.readonly; store tokens only in the local broker. | Grant scopes and connection identity. |
| 2 | Select the Analytics account, GA4 property and relevant web stream. | List accessible resources and show numeric property ID, measurement ID, stream URL, currency and timezone. | Confirmed property-to-site binding. |
| 3 | Choose the business outcomes to map. | Map existing events to inquiry, qualified lead, booking and revenue; do not create events implicitly. | Versioned event dictionary with owner. |
| 4 | Run a bounded sample report. | Read the requested window; show freshness and metadata limitations. | Provider request ID, dimensions, rows and coverage. |
| 5 | Test measurement separately. | Distinguish schema validation, event receipt and appearance in reporting; avoid treating a debug validation as a production event. | Three distinct test outcomes. |
| 6 | Save the connection as read-only. | Enable reporting jobs; require a separate grant for event/tag or property edits. | Ready-read status and next sync time. |

**Exceptions and recovery:** No properties: explain missing property permission, not invalid password. Thresholded, partial or empty report: retain its true state. Wrong currency/timezone: block unsafe aggregation. Consent denied: respect it and disclose measurement gaps.

**Done means:** Correct GA4 property is bound, sample reporting works and event-mapping gaps are explicit.

### F05 - Connect Search Console and organic visibility

**Persona:** SEO operator  
**Entry screen:** `connections`  
**Goal:** Measure observed search queries and page visibility for the authorized website.  
**Preconditions:** Verified Search Console access and enabled API are available.  
**Agent participation:** A03, A04, A05, A06

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select Search Console and authorize read-only access. | Request webmasters.readonly separately from Analytics permissions. | Identity, scopes and API readiness. |
| 2 | Choose the exact domain or URL-prefix property. | Display the property string and permission level; validate mapping to the selected site. | Property binding. |
| 3 | Set country, device, search type and comparison window. | Retain filters as a reproducible observation definition. | Comparable-query configuration. |
| 4 | Load query/page observations and sitemap status. | Store raw rows, source timing and missing-data limitations. | Observation batch and coverage notes. |
| 5 | Map high-value intents to pages. | Identify answer gaps and possible cannibalization without fabricating search volume. | Intent-to-page mapping. |
| 6 | Save the daily read schedule. | Run within quota; separate observed average position from independent location-specific rankings. | Scheduled task and source watermark. |

**Exceptions and recovery:** Property mismatch: refuse silent domain substitution. Omitted rows: unknown, not zero. URL inspection permission/quota issue: show partial capability.

**Done means:** Organic observations are comparable and attributable to the right Search Console property.

### F06 - Connect Google Ads for controlled analysis

**Persona:** Ads owner + technical administrator  
**Entry screen:** `connections`  
**Goal:** Analyze campaigns without allowing account connection to authorize spend.  
**Preconditions:** Google Cloud API access and the appropriate Ads account role exist.  
**Agent participation:** A23, A30, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose Google Ads and review the current access requirements. | Validate Cloud-project API access; the current path does not require a new developer token. | Project and access-tier evidence. |
| 2 | Authorize the Google identity. | Use supported OAuth; explain that the adwords scope is broad and local policy will enforce read-only use. | Consent plus application-level deny-write rule. |
| 3 | Select the client customer and manager context when applicable. | Verify customer ID, account role, environment, currency and timezone. | Account binding; test versus production badge. |
| 4 | Fetch campaigns and conversion-action definitions. | Read status, spend and configured outcomes; do not change campaign settings. | Read receipt and source watermark. |
| 5 | Map conversion actions to the business event dictionary. | Separate platform attribution from CRM-verified outcomes. | Mapping and discrepancy tasks. |
| 6 | Choose Analyze only as the initial capability. | Block create, pause, activate, bid and budget mutations until a separate exact-change or bounded policy approval. | Read-ready connection and disabled write capability. |

**Exceptions and recovery:** Test-only project against production: show API access blocker. Manager/client confusion: require explicit customer selection. Broad OAuth scope: never imply provider-enforced read-only permission.

**Done means:** Ads reporting works for the chosen account; spending authority remains disabled.

### F07 - Connect ChatGPT Ads

**Persona:** Ads owner  
**Entry screen:** `connections`  
**Goal:** Read and govern ChatGPT ad performance through the proper ad-account credential.  
**Preconditions:** An eligible Ads Manager account and authorized Ads API access/key are available.  
**Agent participation:** A23, A30, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose ChatGPT Ads, not ChatGPT organic presence. | Explain the distinction between Ads API, model API and business-profile management. | Selected integration type. |
| 2 | Create or obtain the authorized account-scoped Ads key outside the prototype. | Accept it only in the implemented protected local credential flow; never in Markdown or browser storage. | Masked broker reference, no raw key in UI. |
| 3 | Run an account identity read. | Use the documented ad-account lookup and verify account, timezone, currency and available actions. | Account binding receipt. |
| 4 | Inspect conversion sources and campaign associations. | Read exposed settings; do not equate configured goals with working pixel/server instrumentation. | Measurement-readiness checklist. |
| 5 | Import a bounded performance window. | Expose different freshness for clicks, spend and attributed conversions. | Source watermarks and pending-data labels. |
| 6 | Save Analyze only and choose an escalation owner. | Enable read jobs; gate ad changes and new spend independently. | Read-ready status and explicit write denial. |

**Exceptions and recovery:** Wrong account key: refuse use for another account. Feature not entitled: blocked, not connected/live. Pixel or server events need engineering: create an implementation task. No general sandbox presumed: use supported validation and authorized controlled tests.

**Done means:** Identity and reads are verified; reporting delays and measurement gaps remain visible.

### F08 - Connect Claude Code and the Claude test API

**Persona:** Technical administrator  
**Entry screen:** `connections`  
**Goal:** Keep operational Claude workers separate from the evaluation API configuration.  
**Preconditions:** Claude Code is installed; an authorized Claude API workspace credential is available for testing.  
**Agent participation:** A01, A23, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Validate the local Claude Code installation and authentication. | Record executable version, supported flags, sandbox capability and bounded output contract. | Runtime diagnostic receipt. |
| 2 | Select a broker-held credential reference for Claude API tests. | Keep API credentials separate from browser sessions and local CLI authentication. | Test-provider binding. |
| 3 | Discover accessible models. | Read the model catalog and capture exact model IDs/capabilities; do not hard-code an evergreen latest model. | Dated model catalog. |
| 4 | Choose the evaluation model and maximum cost. | Separate operational budget, test budget and actual consumption. | Budget policy revision. |
| 5 | Run a small consented smoke test with synthetic data. | Validate response parsing, errors, timing and usage. | Smoke-test artifact and usage ledger. |
| 6 | Enable the test adapter. | Expose evaluation only; no publishing or CRM tools in the test context. | EVAL_ONLY capability. |

**Exceptions and recovery:** API billing or model access unavailable: show blocked test capability without disabling a healthy CLI. Quota failure: bounded retry; no silent model/provider substitution. Unsupported structured output: fail the contract test.

**Done means:** CLI readiness and API evaluation readiness are separately visible and testable.

### F09 - Connect Gemini for independent testing

**Persona:** Technical administrator + reviewer  
**Entry screen:** `connections`  
**Goal:** Test answer quality and grounded discoverability without replacing the 30 Claude operational roles.  
**Preconditions:** A permitted Gemini project credential and a bounded testing budget exist.  
**Agent participation:** A09, A11, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select Gemini Evaluation and review data policy. | Explain that de-identified prompts leave the local host for the provider; keep customer records excluded by default. | Data-use decision. |
| 2 | Bind an approved restricted credential through the local broker. | Validate project identity where available, credential type, API restrictions and quota. | Masked credential reference. |
| 3 | Discover available models and supported tools. | Pin model, API version and search-grounding capability for each run. | Model/capability snapshot. |
| 4 | Choose either fixed-corpus or open-web test mode. | Keep the modes separate; fixed corpus compares answers against identical evidence, open web records time-varying retrieval. | Evaluation condition definition. |
| 5 | Run a minimal test under the displayed cap. | Return answer, citations where supplied, latency and billable usage; label failures. | Provider response and test receipt. |
| 6 | Save Evaluation only. | Exclude Gemini from production action authority and operational fallback. | EVAL_ONLY connection state. |

**Exceptions and recovery:** Search grounding unavailable on the selected model: disable that option. Safety refusal or error: distinct outcome, not zero-quality content. API result is not consumer Gemini or ChatGPT rank: preserve the surface label.

**Done means:** Gemini can be selected for controlled evaluation; it cannot publish or respond to customers.

### F10 - Map CRM, forms and booking truth

**Persona:** CRM administrator + QA operator  
**Entry screen:** `crm`  
**Goal:** Prove a lead arrives correctly and distinguish inquiry from confirmed booking.  
**Preconditions:** Authorized Zoho environment, controlled test identities and booking-system access exist.  
**Agent participation:** A21, A22, A23, A28

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Connect the exact Zoho organization, region and environment. | Validate identity and read access before any mutation. | Environment binding. |
| 2 | Map every pilot form field and assignment rule. | Version required fields, consent, deduplication keys, source/UTMs and notifications. | Form-to-CRM contract. |
| 3 | Set controlled test recipients and synthetic-record rules. | Exclude test records from revenue, marketing audiences and paid conversion imports. | Canary grant and retention policy. |
| 4 | Map the booking inventory and receipt source. | Separate availability lookup, tour request, booking handoff and authoritative confirmation. | Booking capability matrix. |
| 5 | Run one authorized end-to-end canary. | Trace form acceptance to exactly one expected CRM record and controlled notification. | Correlated journey evidence. |
| 6 | Review failure injection and retry behavior. | Show missing fields or receipts; reconcile before retrying ambiguous writes. | Passing failure/recovery scenario. |

**Exceptions and recovery:** Client thank-you without CRM receipt: fail the journey. Unknown availability: inquiry only. Timeout after acceptance: reconcile, do not duplicate.

**Done means:** A known pilot journey is proven, including correct mapping and safe synthetic-data handling.

### F11 - Connect local, social and inbox channels

**Persona:** Channel owner + customer-service lead  
**Entry screen:** `connections`  
**Goal:** Publish suitable formats and receive supported messages with separate permissions.  
**Preconditions:** Ownership, eligible account types and supported provider access exist.  
**Agent participation:** A16, A17, A18, A23, A26, A27

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select a provider and exact page/profile/location. | Verify ownership, environment and provider eligibility. | Account and asset IDs. |
| 2 | Complete provider sign-in and any human verification. | Use supported OAuth or permitted dedicated browser session; never bypass MFA/CAPTCHA. | Authentication result. |
| 3 | Inspect post, review, message and read-back capabilities separately. | Do not infer messaging access from public-post access. | Capability matrix per action. |
| 4 | Choose approved content formats and location boundaries. | Reject full-blog distribution to destinations that only support short updates. | Destination contract. |
| 5 | Set support hours and human escalation recipients. | Configure timezone, platform message windows and conversation ownership rules. | Support policy. |
| 6 | Perform a specifically authorized test. | Verify delivery and remote receipt where supported; otherwise label limitations. | Test artifact and ready capability. |

**Exceptions and recovery:** Expired token: pause only dependent destinations. Unsupported action: offer a prepared task, not a fabricated API. No legacy Google native inbox: use the actual supported underlying channel.

**Done means:** Every enabled destination has verified capabilities and its own authority.

### F12 - Grant standing autonomy safely

**Persona:** Owner  
**Entry screen:** `autonomy`  
**Goal:** Authorize routine work without approving every low-risk task or granting unlimited control.  
**Preconditions:** Relevant connection tests, business facts and asset bindings have passed.  
**Agent participation:** A01, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose the workstream and scope. | List sites, channels, action classes and delegated agents affected. | Scope snapshot. |
| 2 | Select Observe, Draft, Review required or Bounded automatic. | Explain what changes in each mode; evaluate dependencies. | Versioned authority draft. |
| 3 | Set limits, expiry, notification rules and excluded actions. | Separate inference budget from advertising spend; reserve incident/customer capacity. | Policy constraints. |
| 4 | Preview allowed and blocked examples. | Evaluate the exact policy against representative actions. | Policy test matrix. |
| 5 | Approve the policy with owner identity. | Activate only the reviewed version; require application gateway enforcement at every write. | Signed grant and audit event. |
| 6 | Try pause, stop writes and pause replies. | Differentiate no-new-work, immediate pre-send denial and conversation-level takeover. | Control tests with receipts. |

**Exceptions and recovery:** Agent requests broader authority: owner-only exception. Expired or revoked grant: fail closed. A live ad budget increase: exact review, never a side effect of an SEO mission.

**Done means:** Routine eligible actions may proceed; material exceptions and spending remain explicit.

### F13 - Launch a workstream and recurring schedule

**Persona:** Owner or authorized operator  
**Entry screen:** `activation`  
**Goal:** Move from configuration to one measured autonomous workflow.  
**Preconditions:** Required connections, facts, tests and policy are ready for the chosen workstream.  
**Agent participation:** A01, A25, A30

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose an objective and pilot scope. | Translate the objective into bounded tasks and dependencies. | Plan, affected assets and estimated cost. |
| 2 | Review the required readiness gates. | Show missing prerequisites by capability, not a single misleading connected badge. | Workstream readiness checklist. |
| 3 | Run a dry rehearsal. | Read and stage proposals without external effects; prove contract and permission checks. | Dry-run evidence bundle. |
| 4 | Select frequency, timezone and change cooldown. | Coalesce missed work; preview next runs including daylight-saving transitions. | Schedule definition. |
| 5 | Enable the reviewed workstream. | Queue typed jobs with limits and cancellation; no unbounded self-delegation. | Launch receipt. |
| 6 | Follow the mission to verified completion. | Show observed result, failures, artifacts and measurement window. | Mission outcome and next action. |

**Exceptions and recovery:** Missing optional provider: partial scope with explicit exclusion. Host offline: queue safely, never imply active coverage. Duplicate launch: reuse idempotency key.

**Done means:** One authorized workflow finishes with evidence and a visible recurring schedule.

### F14 - Turn demand into a page improvement

**Persona:** SEO operator  
**Entry screen:** `demand`  
**Goal:** Translate supported search demand into a useful, testable page change.  
**Preconditions:** Read observations and a verified editable page exist.  
**Agent participation:** A03, A04, A06, A07, A08, A10, A15, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Open a trend or recurring question. | Show source, geography, period, sample size and hypothesis/measured classification. | Observation IDs. |
| 2 | Confirm the target intent and page. | Check overlap with existing pages and actual inventory fit. | Intent-to-page match. |
| 3 | Create a visibility mission. | Delegate SEO, AEO and schema work using approved facts. | Task plan and content brief. |
| 4 | Review the proposed answer, metadata and internal links. | Preserve substantive content and show sources for claims. | Exact revision diff. |
| 5 | Run quality and customer-journey tests. | Reject unsupported claims, invalid markup and broken booking paths. | Independent QA bundle. |
| 6 | Release under the applicable policy and observe. | Verify the live page; set a cooldown and measurement baseline. | Release receipt and experiment window. |

**Exceptions and recovery:** Unverified keyword spike: research task, not publish trigger. Factual conflict: block affected claims. Schema cannot guarantee AI citation or rich results.

**Done means:** A source-backed change is live and measurable, or blocked with a clear reason.

### F15 - Create and distribute an original campaign

**Persona:** Content operator  
**Entry screen:** `studio`  
**Goal:** Publish one useful factual core as appropriate channel-specific assets.  
**Preconditions:** Approved facts, actual venue media and authorized destination capabilities exist.  
**Agent participation:** A12, A13, A14, A15, A16, A25, A30

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose a brief and audience need. | Identify the practical value, authentic story and intended action. | Brief with source IDs and outcome. |
| 2 | Draft the canonical article. | Use evidence; distinguish claims, advice and unknowns. | Editable versioned draft. |
| 3 | Review utility, brand, sources and accessibility. | Check originality, links, media rights, alt text and claim consistency. | QA findings and revision hash. |
| 4 | Preview the destination variants. | Adapt format, length, CTA and location relevance; do not duplicate everywhere blindly. | Per-destination preview. |
| 5 | Publish the canonical page and eligible variants. | Wait for verified canonical URL before dependent posts; honor channel grants and schedules. | Independent provider outcomes. |
| 6 | Review distribution and outcome collection. | Reconcile uncertain writes; measure clicks/leads with attribution limits. | Campaign manifest and measurement state. |

**Exceptions and recovery:** One destination fails: partial completion, not all-or-nothing fiction. Remote timeout: unknown outcome, reconcile before retry. Article changed after approval: invalidate approval.

**Done means:** Eligible content has receipts; blocked channels have visible recovery actions.

### F16 - Review Google and ChatGPT paid-media recommendations

**Persona:** Ads owner + analyst  
**Entry screen:** `paid`  
**Goal:** Make evidence-based campaign decisions without automated uncontrolled spending.  
**Preconditions:** Selected accounts are read-ready; comparable settled data and conversion context exist.  
**Agent participation:** A01, A23, A25, A30

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select platform, account, dates and attribution basis. | Display native currency/timezone, conversion windows and data maturity. | Reproducible analysis definition. |
| 2 | Inspect delivery before diagnosing conversion. | Separate no impressions, low clicks, missing events and delayed attribution. | Evidence-backed diagnosis. |
| 3 | Request a recommendation. | State hypothesis, exact proposed change, risk and alternative; do not infer causality from short samples. | Typed change proposal. |
| 4 | Inspect the exact before/after and affected shared budgets. | Show daily/lifetime semantics, total account impact and dependencies. | Revision-bound financial diff. |
| 5 | Approve or decline the specific action. | Require owner or delegated Ads Approver; validate current policy and account state again. | Authorization record. |
| 6 | Execute and verify only when authorized. | Read back changed entities; preserve provider receipts and stop at uncertain outcomes. | Verified mutation or explicit failure. |

**Exceptions and recovery:** Fresh spend incomplete: no budget recommendation from partial same-day totals. CPC undefined at zero clicks: show N/A. Shared budget impact unknown: block. Campaign creation and active serving are different states.

**Done means:** A precisely scoped decision is recorded and any permitted mutation is verified.

### F17 - Run Claude and Gemini evaluation suites

**Persona:** QA reviewer + SEO analyst  
**Entry screen:** `evals`  
**Goal:** Compare grounded answer quality and sampled discoverability with reproducible conditions.  
**Preconditions:** Evaluation-only provider connections, curated cases and budget consent exist.  
**Agent participation:** A09, A11, A25, A30

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select the suite and purpose. | Separate fixed-corpus quality, open-web discovery, and manual consumer-product observations. | Versioned suite ID and surface label. |
| 2 | Choose models, evidence version, repetitions and tool mode. | Pin exact returned model IDs and settings; calculate call count and estimated cap. | Condition manifest. |
| 3 | Review prompts and privacy. | Remove customer identifiers; retain expected facts, constraints and no-answer cases. | Redaction and fixture check. |
| 4 | Approve the bounded test run. | Reserve evaluation budget; stop on cap or credential failure without switching providers. | Run authorization. |
| 5 | Inspect case-level outcomes. | Show outputs, citations, retrieval condition, latency, errors and deterministic claim checks. | Case result artifacts. |
| 6 | Adjudicate failures and create remediation tasks. | Keep human verdict separate from model grading; never let a favorable model answer authorize a release. | Adjudication plus linked backlog item. |

**Exceptions and recovery:** Grounding not invoked: label the actual condition. API observations are not consumer ChatGPT/Gemini rankings. Disagreement: inspect evidence, not majority vote. No provider result: error, not score zero.

**Done means:** Reproducible test results identify specific content/search gaps without production writes.

### F18 - Review, revise and release a change

**Persona:** Independent reviewer + owner when required  
**Entry screen:** `review`  
**Goal:** Make a clear decision on exact evidence, content and authority.  
**Preconditions:** A proposed revision, source evidence and applicable checks exist.  
**Agent participation:** A25, A15, A24

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Open the review queue and select an item. | Group by impact, risk, age and blocked reason; identify the author and reviewer. | Review item and current revision. |
| 2 | Read why the change is proposed. | Present observation, hypothesis, affected assets and expected measure. | Evidence summary. |
| 3 | Compare before/after and supporting sources. | Highlight factual changes, code/markup impacts and content freshness. | Human-readable diff and source drawer. |
| 4 | Inspect technical, factual and policy gates. | Separate pass, fail, not run and not applicable; reveal artifacts. | QA bundle. |
| 5 | Approve exact revision, request revision or reject. | Require a reason for negative decisions; disallow self-approval and stale approvals. | Decision record bound to revision and policy. |
| 6 | Track release and verify. | Recheck scope before send, read back result and preserve rollback/compensation options. | Release receipt or blocked exception. |

**Exceptions and recovery:** Author edits after approval: invalidate it. Missing evidence: request evidence, no green score override. Irreversible effect: correction workflow, not universal undo.

**Done means:** The decision and any external effect are traceable to a reviewed revision.

### F19 - Analyze performance and test a hypothesis

**Persona:** Owner + analyst  
**Entry screen:** `analysis`  
**Goal:** Understand channel outcomes without mixing incompatible measures or attribution.  
**Preconditions:** Data sources and business event definitions have mapped identities and freshness.  
**Agent participation:** A30, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose site, period, comparison and reporting timezone. | Apply compatible filters and show native-source time boundaries. | Saved analysis definition. |
| 2 | Select acquisition, journey or revenue view. | Separate Search Console clicks, GA sessions, ad conversions and CRM-verified bookings. | Metric definitions and denominators. |
| 3 | Inspect a channel or page. | Show source evidence, missing/thresholded values, settled window and recent releases. | Drill-through and annotations. |
| 4 | Investigate a discrepancy. | Compare consent, tracking, timing, currency and attribution before declaring a defect. | Reconciliation worksheet. |
| 5 | Save a hypothesis and measurement plan. | Require primary outcome, baseline, comparison and adequate observation window. | Experiment record. |
| 6 | Export or share a redacted decision brief. | Preserve sources, caveats, filters and proposed actions; do not expose customer records. | Portable analysis artifact. |

**Exceptions and recovery:** Multiple channels claim one booking: do not sum into unique revenue. Different currencies: separate unless an explicit FX policy exists. Small sample: mark inconclusive.

**Done means:** A reproducible analysis produces a supported decision, not a vanity score.

### F20 - Verify a form-to-CRM journey continuously

**Persona:** QA operator  
**Entry screen:** `tests`  
**Goal:** Prove the real lead path and reveal exactly where it fails.  
**Preconditions:** Controlled canary identity, target environment and test permission exist.  
**Agent participation:** A19, A20, A21, A22, A23

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Select a declared journey and device. | Show form, handler, CRM mapping and notification contract. | Journey specification. |
| 2 | Review synthetic-data protections. | Validate recipient sinks, test tags, budgets and exclusion from commercial reports. | Safety gate. |
| 3 | Run the canary. | Exercise visible behavior, backend acceptance, CRM record, assignment and notification. | Step timestamps and correlation ID. |
| 4 | Inspect each step, not just the page status. | Show screenshots/traces and provider read-back; distinguish partial coverage. | Journey graph. |
| 5 | Create an incident for reproducible failure. | Group duplicates and assign severity by business impact. | Incident and owner. |
| 6 | Set recurring cadence within allowed load. | Persist schedule and last verified success; mark coverage gaps when host is offline. | Cadence and heartbeat history. |

**Exceptions and recovery:** CAPTCHA blocks automation: honest partial coverage; no bypass. Real inventory/payment: no incidental transaction. Missing CRM receipt: fail even if the UI says success.

**Done means:** The journey either passes end to end or names the failed/unverified stage.

### F21 - Diagnose and repair a permitted defect

**Persona:** Technical operator + independent reviewer  
**Entry screen:** `changes`  
**Goal:** Restore the customer journey without unbounded production experimentation.  
**Preconditions:** A reproduced incident, source binding and bounded repair policy exist.  
**Agent participation:** A19, A21, A23, A24, A25, A29

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Open the incident and business-impact evidence. | Show affected journeys, first/last failure and related releases. | Incident bundle. |
| 2 | Review the proposed repair scope. | Limit one asset/change set, isolate a worktree and acquire a lease. | Repair plan and source revision. |
| 3 | Run the patch and regression tests. | Protect policy code and critical tests; stop after the allowed attempts. | Diff, test results and attempt ledger. |
| 4 | Obtain independent approval or verify standing authority. | Do not let the author approve or weaken its own gates. | Review plus policy decision. |
| 5 | Release to a canary and re-run the original failing journey. | Check real observable recovery before any broader rollout. | Read-back and repeated test. |
| 6 | Close, roll back or escalate. | Use operation-specific compensation; preserve irreversible effects. | Verified resolution or human handoff. |

**Exceptions and recovery:** Two failed attempts: escalate. Human edited source: regenerate/revalidate. Repair disables test: reject.

**Done means:** The original failing journey is recovered or safely escalated with evidence.

### F22 - Handle after-hours messages and take over

**Persona:** Customer-service lead  
**Entry screen:** `inbox`  
**Goal:** Provide accurate support while preserving customer choice and human control.  
**Preconditions:** Supported inbox connection, approved facts and response policy exist.  
**Agent participation:** A26, A27, A28, A29

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Set coverage hours, allowed questions and escalation owner. | Validate timezone, provider windows and unknown-answer behavior. | Response policy. |
| 2 | Receive an inbound conversation. | Authenticate ingestion, deduplicate and acquire exclusive thread ownership. | Message and conversation versions. |
| 3 | Inspect or allow the proposed response. | Retrieve current facts, avoid invented prices/availability and collect minimum useful details. | Sources and allowed-action evaluation. |
| 4 | Send within policy and log the lead. | Check ownership/window again immediately before send; record delivery and CRM outcome independently. | Message receipt and CRM link. |
| 5 | Choose Take over when needed. | Atomically cancel queued replies and prevent stale agents from sending. | Ownership audit event. |
| 6 | Review the morning handoff. | Show actual request, answered facts, open promises and the next responsible person. | Acknowledged handoff. |

**Exceptions and recovery:** Customer asks for human: stop automatic handling. Refund, legal dispute or access emergency: escalate. Host offline: existing hosted intake remains available; no pretend instant response.

**Done means:** Customer receives a supported answer or a clear handoff; no competing replies occur.

### F23 - Test semantic search and improve no-result cases

**Persona:** SEO operator + product reviewer  
**Entry screen:** `search`  
**Goal:** Return actual eligible spaces and useful source-grounded answers.  
**Preconditions:** Approved catalog and authoritative field ownership exist.  
**Agent participation:** A11, A02, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Enter a representative customer need. | Parse intent, location, capacity, date and amenity constraints. | Parsed intent with ambiguities. |
| 2 | Inspect candidate eligibility. | Apply hard constraints before ranking; distinguish unknown from false. | Filter trace. |
| 3 | Review the answer and booking handoff. | Ground statements in source facts; confirm availability only from a current provider response. | Citations and destination links. |
| 4 | Mark relevant, wrong or no-match. | Capture reviewer feedback against the exact index and fact version. | Judgment record. |
| 5 | Create a content or retrieval correction. | Map missing data to its owner rather than inventing a suitable room. | Remediation task. |
| 6 | Re-run the golden set. | Check regression in constrained cases before releasing ranking changes. | Evaluation comparison. |

**Exceptions and recovery:** No eligible inventory: honest no-match. Price absent: unknown, not free. Personal CRM data: excluded from public retrieval.

**Done means:** Search answers satisfy hard constraints and have verified facts or explicit uncertainty.

### F24 - Recover, rotate access and reconcile

**Persona:** Technical administrator  
**Entry screen:** `connections`  
**Goal:** Resume safely after outages and credential changes.  
**Preconditions:** A recovery policy, backups and authorized provider access exist.  
**Agent participation:** A23, A25, A29

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Inspect host/provider outage and queued work. | Separate stale observations from active incidents and unknown remote outcomes. | Health timeline. |
| 2 | Pause affected outbound capabilities. | Do not disable unrelated healthy workstreams; enforce stop before every write. | Capability-level stop. |
| 3 | Reconnect or rotate credentials through the secure broker. | Validate account identity and scope before revoking old access when rotation permits. | Rotation record without secrets. |
| 4 | Reconcile unconfirmed publications and replies. | Read provider state first; avoid duplicate effects after restart. | Reconciliation receipts. |
| 5 | Resume with a controlled canary. | Coalesce missed monitoring and discard expired posts or replies. | Recovery test. |
| 6 | Export or offboard when needed. | Revoke grants/tokens, disable schedules, apply retention and export redacted records. | Offboarding manifest and residual obligations. |

**Exceptions and recovery:** Backup restore loses latest provider receipt: reconcile before send. Revoked account: mark blocked, never choose another silently. Privacy deletion: include traces, derived copies and documented backup handling.

**Done means:** Recovery preserves state and does not duplicate external actions.

### F25 - Operate the daily owner review

**Persona:** Owner  
**Entry screen:** `overview`  
**Goal:** Use a short decision session to keep autonomous work aligned with business results.  
**Preconditions:** Scheduled work has accumulated actual outcomes and exceptions.  
**Agent participation:** A01, A29, A30

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Open the morning brief. | Prioritize lost-lead incidents, unanswered conversations and material decisions ahead of activity counts. | Evidence-backed summary. |
| 2 | Inspect what changed overnight. | Link changes to revision, authority, receipt and measured effect or pending observation. | Completed-work ledger. |
| 3 | Resolve the few exceptions needing authority. | Show clear approve, revise, reject or assign actions with consequences. | Decision records. |
| 4 | Review qualified demand and costs. | Separate actual spend, estimates, pending attribution and synthetic exclusions. | Outcome and cost view. |
| 5 | Choose the next commercial objective. | Reuse approved scopes and facts; preview task and cost impacts. | New bounded mission. |
| 6 | Save the useful learning. | Propose a versioned playbook update; never silently expand authority. | Reviewed operating knowledge. |

**Exceptions and recovery:** No new material findings: calm empty state, no manufactured urgency. Pending data: schedule observation rather than celebrate lift.

**Done means:** Owner leaves with clear decisions and fewer unresolved business risks.

### F26 - Calibrate the design and release readiness

**Persona:** Product designer + QA lead  
**Entry screen:** `design`  
**Goal:** Validate the interface as an operating product rather than a gallery of screens.  
**Preconditions:** Working prototype or implementation and agreed acceptance cases exist.  
**Agent participation:** A20, A25

| Step | User action | System behavior | Completion evidence |
|---|---|---|---|
| 1 | Choose role, viewport, keyboard and theme. | Apply the same state model across desktop/mobile and access roles. | Test context. |
| 2 | Walk one complete configure-to-outcome path. | Ensure every primary control has a real destination, feedback and recovery path. | Interaction trace. |
| 3 | Check accessible states and dangerous actions. | Test focus order, labels, contrast, non-color states, stop and takeover behavior. | Accessibility findings. |
| 4 | Review empty, loading, stale, partial and failed examples. | Prevent fake green defaults and preserve user edits on error. | State coverage matrix. |
| 5 | Compare handoff requirements to implemented behavior. | Mark implemented/simulated/blocked explicitly for each capability. | Coverage register. |
| 6 | Approve a release only with outcome evidence. | Retain reproducible tests and screenshots; route remaining gaps to backlog. | Release acceptance packet. |

**Exceptions and recovery:** A prototype login is not authentication. An API fixture is not a live integration. A green badge without read-back is not success.

**Done means:** The interface supports the required journeys and honestly represents its implementation state.

## 11. Definition of a complete first-release experience

Configuration is complete only when actual identity, resource, scope and a capability test are recorded. Execution is complete only when the intended external effect is verified or a provider limitation is explicitly documented. Analysis is complete when source definitions and uncertainty are preserved. Autonomy is complete when permitted work survives restart without losing authority or duplicating effects.

The acceptance demonstration must include a read-only onboarding rehearsal; a source-backed page change; a canonical article and eligible channel variants; a form-to-CRM canary; an after-hours conversation with takeover; a bounded defect repair; a financial recommendation that does not auto-apply; a paired model evaluation; and restart/reconciliation. Every scenario uses specifically authorized assets or controlled fixtures and names which one was used.

The HTML supports review of these experiences using fixtures. The local backend, real authentication, secret vault, provider adapters, persistent workflow runner, source verification and production deployment remain implementation work. Browser test results establish UI behavior only.

## 12. Handoff package and traceability

Use `data/user-flows.json` as the flow source of truth, `User_Stories_and_Acceptance_v5.md` for the backlog, `Screen_Specifications_v5.md` for screen-level contracts and `Provider_Configuration_and_Testing_v5.md` for account onboarding. `Claude_Code_Implementation_Handoff_v5.md` defines implementation boundaries, APIs and release gates. The prototype demonstrates expected states; its in-browser checks must not be mistaken for security enforcement.

Primary sources and dated platform notes are in `Sources_v5.md`. Proposed numbers such as worker concurrency, monitoring cadence, model-run caps and review windows are configurable design defaults, not service-level promises or vendor guarantees.
