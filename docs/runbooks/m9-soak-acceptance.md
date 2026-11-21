# M9 / NEXT-20 — soak / acceptance evidence

## What this proves

Fixture (LOCAL_DURABLE) proofs:

1. Crash-restart rehydrates `ACCEPTED_PENDING` and verifies without a second apply
2. Idempotent retry does not create duplicate provider effects
3. Job rows survive process restart via durable idempotency keys
4. Unknown-remote reconcile reads the provider ledger before verify

Acceptance evidence compiler marks selected catalog cases **ACCEPTED** only with redacted fixture artifacts. It never silently marks live **VERIFIED**.

## Commands

```bash
pnpm recovery:rehearse          # soak proofs (must pass)
pnpm release:evidence           # writes tests/acceptance-evidence/fixture/*
pnpm test:acceptance-matrix     # ACCEPTED rows require on-disk evidence
pnpm test:soak                  # unit/contract soak package
```

## 72h pilot gate (owner host)

Short CI soaks leave `pilotGate=NOT_MET`. A real R1 pilot gate requires a continuous ≥72h window with all four proofs still passing.

Suggested owner Windows flow (state off OneDrive):

1. Set `WORKSOCIAL_STATE_DIR` to a local non-synced disk path.
2. Start the stack (`pnpm local:start`) and leave the host available for 72h.
3. At start and end (or via scheduled task), run:

```bash
pnpm recovery:rehearse
```

4. To evaluate the gate with measured timestamps, call `POST /soak/run` with `startedAtIso` / `endedAtIso` spanning ≥72h, or use the soak service with those overrides.
5. Review `/soak` console report — `pilotGate` must be `MET` only when duration and proofs qualify.
6. Live CMS / GSC / GA4 / Zoho / Temporal remain **NOT_WIRED** until separately connected. Do not claim R1-complete from fixture evidence alone.

## Honesty

| Label | Meaning |
|-------|---------|
| fixture ACCEPTED | Offline evidence artifact exists |
| sandbox | Distinct; not claimed by this harness |
| authorized production | Distinct; not claimed by this harness |
| VERIFIED (live) | Forbidden without explicit authorized-production evidence package |
| ChatGPT Ads | Access-blocked without transport + entitlement |
