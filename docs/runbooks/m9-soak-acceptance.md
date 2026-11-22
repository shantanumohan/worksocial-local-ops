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

Honest fixture ACCEPTED cases: **T-X014**, **T-X020**, **T-US-048**, **T-X066**, **T-F24**, **T-US-047**, **T-US-002**, **T-X002**, **T-X018**, **T-US-054**, **T-X073**, **T-US-060**, **T-X005**, **T-X006**, **T-X019**, **T-US-036**, **T-X029**, **T-US-057**, **T-US-024**, **T-US-042**, **T-X057**, **T-US-044**, **T-X053**, **T-US-018**, **T-X037**, **T-X058**, **T-X069**, **T-X038**, **T-X039**, **T-US-058**, **T-US-046**, **T-X048**, **T-US-010**, **T-X033**, **T-US-008**, **T-X032**, **T-X031**, **T-US-040**, **T-X049**, **T-X017**.

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
