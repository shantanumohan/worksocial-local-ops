# Provider configuration and testing playbook - v5

Reviewed November 17, 2026. This is the implementation and owner-onboarding contract. The interactive HTML uses sample resources and never accepts secrets, contacts providers or creates a real connection. References [R01-R30] are resolved in Sources_v5.md.

## 1. Three separate decisions

**Connect:** Prove the external identity, resource and supported capability. **Authorize:** Decide which application role may perform which action, against which asset and under which limits. **Verify:** Establish the actual effect and retain evidence. A single green connected badge cannot represent all three.

Each provider record contains workspace, provider, authentication method, masked credential reference, verified external organization/account/project/property ID, environment, selected assets, granted provider scopes, tested read/write capabilities, local policy, owner, last successful check, data watermark, token/session expiry where known, API version and revocation state. Never include the credential value in this record or a browser response.

Default state is read-first or evaluation-only. A broader OAuth scope does not imply that the application grants every provider action. The local gateway denies unapproved operations even where the provider credential is technically able to make them.

## 2. Owner path versus administrator path

The administrator configures OAuth clients, callbacks, approved Cloud projects, API access, secret storage, network restrictions and adapter contracts. The owner performs account consent, selects the intended resource, confirms the business mapping, inspects a capability test and enables an appropriate workstream. Do not ask the owner to copy credentials into Claude prompts.

For Google, use a supported external-system-browser flow appropriate to the registered application type. Bind state and PKCE to the initiated connection and verify callback context. Use the configured loopback callback where supported; localhost is not a general public webhook endpoint. Store refresh tokens in the protected local credential broker. An installed-app client secret is not a substitute for PKCE or account verification. [R15]

For API keys, the implemented product opens a dedicated secure local entry mechanism and stores only a broker reference in operational configuration. Mask values, prohibit them in screenshots/logs, redact error responses, restrict account/project privileges and provide rotation and revocation. The prototype intentionally contains no key-entry input.

## 3. Google Analytics 4 - F04

### Administrator preparation

Enable the applicable Analytics Data and Admin APIs in the authorized Cloud project. Configure OAuth using the least privilege required for reporting. The normal user-authorized reporting scope is `https://www.googleapis.com/auth/analytics.readonly`. The consenting identity still needs access to the selected GA4 property. A service-account integration, when appropriate, requires explicit GA4 property permission; possession of a JSON key alone is not access. [R01, R02]

### Owner sequence

1. Open Connections > Google Analytics 4 > Configure. Read the requested reporting scope.
2. Authorize the intended Google identity through the external browser, or select the administrator-provisioned service identity.
3. Select the GA account and **numeric property ID**, then select the correct web stream. Display domain, property time zone and currency alongside the IDs. Do not confuse the property ID with a `G-...` measurement ID or a stream ID.
4. Map the site's inquiry, qualified-lead and booking outcomes to the real event names and CRM/booking events. Mark absent events as unmapped rather than creating them implicitly.
5. Run a bounded property report. Show exact date range, dimensions, metrics, status and returned data limitations.
6. Confirm the binding and enable reporting. Keep tag installation, event editing and consent changes as separate authorized implementation tasks.

### Required evidence

Store the authenticated principal reference, selected account/property/stream IDs, mapping revision, time zone, currency, request dimensions/metrics, result metadata and latest source watermark. An empty report can still be a successful capability read; label it 'No observations' rather than 'Connection failed'. Preserve thresholding, sampling or other data limitations exposed by the response. [R04]

### Tracking verification is a separate ladder

Prove configuration, payload validity, collection/receipt evidence, reporting availability and business reconciliation separately. A GA4 Measurement Protocol debug-validation response validates payload structure; those events do not appear in reports, and the validation endpoint does not validate every secret-related field. Do not label it a delivered or attributed conversion. [R03]

Test tagging with controlled identities and consent states. Do not send private customer fields in event names, URLs or arbitrary analytics parameters. Synthetic records and test events need an approved exclusion strategy. No consent-denial bypass is part of this design.

### Failure and recovery

Wrong property: return to resource selection and retain the previous binding. Missing permission: identify the required property access rather than requesting a broader unrelated scope. Expired token: mark needs reauthentication and pause dependent reads without erasing historical reports. No event receipt: open Journey tests and the measurement-mapping issue; do not claim the reporting OAuth connection is broken.

## 4. Google Search Console - F05

Use `https://www.googleapis.com/auth/webmasters.readonly` for read-only search analytics. Enumerate only properties accessible to the authorized identity and bind the correct domain or URL-prefix property. A `sc-domain:` resource is not interchangeable with a specific HTTPS-prefix property. Record ownership/access, normalized site mapping and the chosen resource exactly. [R05]

The owner authorizes, selects the property, confirms the site's canonical domain/protocol, sets default country/device/search-type filters and runs a bounded query/page sample. Save the response conditions, covered dates and completeness limitations. URL inspection or other capability tests must be gated separately if required; a successful Search Analytics read does not prove every API capability.

Use search clicks, impressions, CTR and average position with their definitions. Missing query rows can reflect reporting limits; they do not establish zero demand. Search Console average position is not a deterministic live rank for every location or device. Do not compare unlike result surfaces or fabricate 'ChatGPT rank' from this integration. [R06]

A property mismatch blocks downstream claims about site coverage. Unavailable data becomes a source gap with a recovery instruction. Do not silently substitute a different property because it contains more rows.

## 5. Google Ads - F06 and F16

### Current onboarding requirement

The current Google Ads API migration documentation states that developer tokens were sunset on September 9, 2026. API access is determined by the Google Cloud project associated with the OAuth credentials or service account. New onboarding should verify that project's access level, not require a newly issued developer token. The main article text and access-level guidance take precedence over stale historical summary wording on the migration page. Recheck this at implementation. [R07, R08]

### Administrator preparation

Enable the Google Ads API for the intended Cloud project, configure supported OAuth, and verify approved access for the target environment. Test-only access is not production permission. Choose a supported API version and preserve it in capability evidence. Use official test accounts for non-serving integration tests where appropriate. [R08-R10]

The OAuth `adwords` scope is broader than this application's default reporting permission. Label the connection 'Application-enforced read-only' rather than implying that the provider has granted a special read-only scope. Prevent mutation requests at the credential broker/action gateway. [R09]

### Owner sequence

1. Select Google Ads in Connections and inspect the Cloud-project readiness result.
2. Authorize the correct Google identity.
3. Select the **client customer ID**, not merely a manager. Show the optional manager/login context separately. Display account name, environment, time zone and currency.
4. Map campaigns and conversion actions to actual business objectives. Preserve the account's conversion definitions; do not edit them during reporting onboarding.
5. Run an identity and campaign-report read against the selected customer. A test-access/production mismatch remains blocked with the precise next step.
6. Save read access and open Paid media. Draft recommendations are permitted, but campaign activation, budget, bid, targeting and ad changes require a separately reviewed exact proposal.

### Financial change contract

The proposal states account and campaign identifiers, affected entity type, current and proposed values, currency, daily versus lifetime budget, any shared-budget impact, objective, evidence window, hypothesis, conditions, approver and expiration. Approval binds to the exact entity and revision. Re-read current provider state before mutation; if it changed, stop and request a new decision.

Application budget alerts and delayed-spend reports are not a guaranteed hard billing ceiling. Pair local policy with verified provider-side controls where supported; clearly explain any gap. Do not claim a paused agent instantly stops all already-serving advertising or unsettled charges.

## 6. ChatGPT Ads - F07 and F16

### Credential and resource boundary

The Ads API is distinct from the model API. Current documentation uses an account-scoped Ads API key with the Ads API base `https://api.ads.openai.com/v1`. The implementation verifies the account through the documented account endpoint and binds that returned identity to the chosen WorkSocial ad account. Do not accept a normal model API key or a ChatGPT subscription as proof of Ads API access. Eligibility and actual account capabilities must be tested. [R11, R12]

### Owner sequence

1. Open ChatGPT Ads > Configure and identify the intended Ads Manager account.
2. Use the protected broker flow to provision the eligible account's Ads key. Keep its value out of the browser and artifacts.
3. Verify the returned account identity, currency and available actions. If the resource differs, stop instead of binding automatically.
4. Map supported conversion events and source configuration. Separate configured goal, incoming event evidence, eligible attribution and reconciled booking.
5. Fetch a bounded reporting window. Display each metric's source cutoff and whether recent values may still process.
6. Save a read-first connection. Route any campaign/ad-group/ad change to the owning exact-change review and separate financial authority where applicable.

### Reporting semantics

Current Help Center guidance describes different reporting refresh periods: impressions/clicks/CTR typically refresh around 15 minutes, spend can trail by about 7-8 hours, and attributed conversions can take 24-48 hours. These are approximate provider behaviors, not service guarantees. The UI retains per-metric freshness and reporting windows instead of judging a recent blank as zero or failure. [R13]

Do not add ChatGPT-attributed conversions to Google-attributed conversions and call the sum unique bookings. Keep the platform claims and authoritative CRM/booking outcomes as separate measures. Attribution-window choices are report context, not automatic evidence of causal incrementality.

### Measurement implementation boundary

A successful API read or configured conversion goal does not prove browser/server tracking. Pixel or Conversions API instrumentation is separate website/backend engineering with consent, correct IDs, deduplication and controlled end-to-end verification. Retain the supported click identifier only according to current provider documentation; do not invent reserved query parameters. [R14]

Do not assume a general sandbox or identical capabilities across all accounts. Use harmless bounded reads for onboarding and explicitly authorized demonstration assets for any later write test.

## 7. Claude Code and separate Claude API tests - F08

### Operational runtime

The local administrator verifies the installed Claude Code version, actual runtime authentication, supported permissions, sandboxing, worker executable, source roots and structured-output contract. This powers all 30 operational roles. The dashboard reports runtime readiness separately from every provider connection. Record the real engine/model identifier used for each job and never hard-code an inferred future model name.

### API evaluation connection

The owner or technical administrator provisions a separate API evaluation credential through the broker. Select the intended API workspace, discover accessible models using the supported Models API, choose one explicitly, set allowed tools and run a small synthetic smoke test. API credential, accessible model, output schema and usage readiness must pass independently. A working CLI session does not itself prove that the API evaluation credential or budget is ready. [R16-R18]

The evaluation worker cannot use publishing, CRM mutation or customer-message tools. Evaluation costs are tracked separately from operational worker costs. Set request token limits, bounded concurrency, cancellation and a reservation estimate before launch. A UI dollar cap without backend enforcement is not a spending control.

## 8. Gemini API for testing only - F09 and F17

The developer API connection uses a restricted project credential through the local broker. Restrict it to the necessary service and avoid exposing it in client code. Select a supported model discovered from the current catalog; record model ID and configured version/capabilities. Do not assume a generic Google OAuth login supplies Gemini API entitlement or billing readiness. [R19, R21]

The owner chooses one of two distinct run types:

**Fixed-corpus quality:** Claude and Gemini receive the same approved facts, de-identified cases, output schema and grading contract. Open-web tools are disabled. Deterministic assertions check critical facts, constraints, citations to the supplied corpus and schema. Independent judgment assesses usefulness and clarity; disagreements require adjudication rather than a simple model majority.

**Open-web observation:** Each model uses only actually supported retrieval/grounding tools. Preserve prompt, observation time, location/language when available, tool configuration, tool use and cited URLs. Search grounding does not transform a model API response into a measurement of a consumer ChatGPT or Gemini interface's rank. Models may retrieve different evidence, so this run is not mixed into fixed-corpus accuracy. [R20]

The suite has explicit cost/time/token limits and a tested cancellation path. Rate-limit or authentication errors are separate from wrong answers. Capture pass/fail/refusal/error/not-run/cancelled and denominators per provider. The Gemini adapter cannot become a production fallback if Claude operational work is unavailable.

## 9. Shared provider recovery journeys

**Reauthentication:** Pause affected jobs, preserve source snapshots, request owner consent, recheck identity and scopes, then resume only valid work. Do not treat a new token for a different account as a transparent refresh.

**Rotation:** Provision a new broker reference, verify harmless capability, atomically switch authorized adapters and revoke the old credential through the appropriate provider process. Record who approved rotation. Never export either secret.

**Rate limit:** Respect provider retry guidance, apply bounded backoff and preserve deadline. Surface delayed data. Do not spawn more agents to bypass quotas.

**Revocation:** Mark the connection revoked, deny new leases and send-time effects, cancel eligible queued work and retain appropriate audit history. Revoke provider access separately where required; removing a UI card alone does not revoke a token.

**Unknown mutation outcome:** Record an uncertain state, use a stable operation/correlation ID and inspect remote state before retry. If the provider cannot safely reconcile, escalate rather than risk a duplicate post, budget edit or reply.

## 10. Connector acceptance matrix

| Provider | Identity proof | Harmless first test | Forbidden inference |
|---|---|---|---|
| GA4 | Account/property/stream mapping | Bounded report with metadata | Reporting login means tracking is installed |
| Search Console | Correct domain or prefix property | Query/page read with conditions | Missing rows mean zero demand |
| Google Ads | OAuth project + exact client/environment | Identity and bounded campaign report | OAuth automatically grants spend authority |
| ChatGPT Ads | Account returned for Ads key | Account read + bounded report | Any OpenAI key is an Ads credential |
| Claude API | API workspace and discovered model | Capped synthetic structured response | Claude Code login proves API test readiness |
| Gemini API | Restricted project and actual model capability | Capped fixed-corpus test | API answer is consumer ranking or production fallback |

Required negative tests: wrong identity, wrong environment, expired access, denied scope, unsupported operation, quota failure, malformed response, partial data, privacy-sensitive payload, cancellation and capability change. Every test records whether it was mocked, sandbox, or a specifically authorized production canary.
