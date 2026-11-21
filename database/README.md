# Database migrations

Ordered SQL under `migrations/` (`001_…` … `028_…`).

```bash
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial
pnpm db:migrate
pnpm test:database
```

`013_durable_execution.sql` is the M2 first slice: jobs, effect intents/attempts,
gateway decisions, execution receipts, budget accounts/reservations, outbox,
and the independent fake-provider ledger. `014_mission_workflows.sql` adds LOCAL_DURABLE
mission rows. `015_artifacts.sql` is the M3 schema companion for immutable artifact
revisions and A25 review bindings (file-backed store until Postgres cutover).
`016_owner_staging.sql` is the M4 companion for owner activation, collectors,
missions, and staging CMS read-back (file-backed until Postgres cutover).
`017_lead_capture.sql` is the M5 companion for lead-capture journeys, synthetic
cleanup events, and commerce projection checks (file-backed until Postgres cutover).
`018_inbox_m7.sql` is the M7 companion for delivered status, webhook coalesce
events, ownership versioning, and lead coalesce keys (file-backed until Postgres cutover).
`019_canonical_publish.sql` is the M6 companion for claim/source records,
content review bindings, and multi-destination distribution runs (file-backed
until Postgres cutover).
`020_m8_search_analytics_eval.sql` is the M8 companion for search judgments,
EVAL_ONLY runs, and analytics observation provenance.
`025_eval_state_budget.sql` adds singleton eval budget/meta for `createPgEvaluationStore`
(used when `DATABASE_URL` is set; file/memory fallback otherwise). Live fleet + Ads stay NOT_WIRED.
`021_m9_soak_acceptance.sql` is the M9 companion for soak runs/proofs,
redacted acceptance evidence artifacts, and the case ledger (file-backed until Postgres cutover).
`022_m9_pilot_observations.sql` records server-clock pilot start/heartbeat/end
observations used for the 72h gate (client claim dates rejected).
`024_recovery_evidence.sql` is the WP10 companion for recovery timeline/queued work
(used by `createPgRecoveryStore` when `DATABASE_URL` is set; file/memory fallback otherwise).
`025_paid_media_proposals.sql` is the AA-19 companion for analysis/paid-media proposals.
`026_credential_rotation.sql` is the WP10 companion for local credential revoke/rotate/offboard
(used by `createPgCredentialRotationStore` when `DATABASE_URL` is set; live provider revoke NOT_WIRED).
`027_credential_recovery_state.sql` adds singleton meta rows for credential/recovery PG cutover.
`028_credential_rebind.sql` adds the T-X029 explicit different-account rebind table
(used by `createPgCredentialRotationStore` when `DATABASE_URL` is set; fixture ACCEPTED only — live VERIFIED forbidden).
Runner: `pnpm db:migrate` (`packages/persistence` `runMigrations`).
External effects: none (simulator only).
