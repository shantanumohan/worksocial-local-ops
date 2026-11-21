# WP10 / F24 — recovery evidence

## What this proves (fixture only)

Honest classification of host/provider outage and queued work:

| Class | Meaning |
|-------|---------|
| `STALE_OBSERVATION` | Aged or missing signal **without** confirmed outage — not an incident |
| `ACTIVE_INCIDENT` | Confirmed host or provider outage with current evidence |
| `UNKNOWN_REMOTE_OUTCOME` | Post-apply ambiguous remote write — reconcile before retry |

Also exercises:

- Queued work inventory during host outage (no duplicate external apply)
- Capability-level outbound stop (unrelated healthy workstreams remain allowed)
- Fixture unknown-remote reconcile path

## What this does **not** claim

- Live recovery **VERIFIED** — forbidden; claim stays `NOT_RUN`
- Live provider token revocation — `NOT_WIRED` (local fixture revoke/rotate/offboard live under `/credentials`)
- Host OS service packaging (see host-service runbook / AA-33)
- 159 catalog cases as live VERIFIED — T-F24 / T-US-047 remain product NOT_RUN

External effects: **NONE**.

## Persistence

When `DATABASE_URL` / `WORKSOCIAL_DATABASE_URL` is set, recovery classifications persist via `createPgRecoveryStore` (migrations `024` + `027`). Otherwise file/memory. PG persistence is not live VERIFIED.

## API / console

- Console: `/recovery` · credential honesty: `/credentials`
- `GET /recovery/status` · `/recovery/inspect` · `/recovery/timeline` · `/queued-work` · `/capability-stops` · `/runs`
- `POST /recovery/run` — optional `{ "scenarioId": "…" }`; rejects live `VERIFIED` claims

Scenarios: `host_outage_queued_work`, `provider_outage_capability_stop`, `stale_heartbeat_not_incident`, `unknown_remote_reconcile`.

## Relation to M9 soak

M9 (`pnpm recovery:rehearse`) proves durable crash-restart / no-dup / URO reconcile against the effect ledger. This WP10 surface proves **operator-facing classification** of outage vs stale vs URO plus capability stops. They are complementary; neither alone closes T-F24 product acceptance.

See also: `docs/runbooks/credential-rotation.md` for local revoke → cancel queued → audit retained (live provider revoke stays NOT_WIRED).
