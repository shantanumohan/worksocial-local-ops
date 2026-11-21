# WP10 / F24 — credential rotation & offboarding (fixture)

## What this proves (fixture only)

Local honesty for F24 step 3 (rotate) and step 6 (offboard):

| Action | Behavior |
|--------|----------|
| Revoke | Mark connection `REVOKED`, deny new leases and send-time effects |
| Cancel queued | Eligible pre-apply work → `CANCELLED`; post-apply retained for reconcile |
| Audit | Redacted audit entries retained (no secrets) |
| Rotate | Provision new broker reference, switch locally, mark old revoked |
| Offboard | Manifest + residual obligations (provider revoke stays open / NOT_WIRED) |

## What this does **not** claim

- Live provider token revocation — always `LIVE_PROVIDER_REVOKE_NOT_WIRED`
- Catalog T-F24 / T-US-047 / T-X073 as VERIFIED — remain `NOT_RUN`
- Secret export or remote OAuth revoke

External effects: **NONE**.

## Persistence

When `DATABASE_URL` / `WORKSOCIAL_DATABASE_URL` is set, credential/revoke audit persists via `createPgCredentialRotationStore` (migrations `026` + `027`). Otherwise file/memory. PG persistence is not live VERIFIED.

## API / console

- Console: `/credentials`
- `GET /credentials/status` · `/credentials/connections` · `/credentials/audit` · `/credentials/queued-work` · `/credentials/manifests` · `/credentials/rotations`
- `POST /credentials/seed` · `/credentials/lease` · `/credentials/revoke` · `/credentials/rotate` · `/credentials/offboard` · `/credentials/live-revoke` (expect NOT_WIRED)

## Relation to recovery evidence

`/recovery` classifies outages. `/credentials` handles local credential revoke/rotate/offboard honesty. Live provider revoke remains NOT_WIRED on both surfaces.
