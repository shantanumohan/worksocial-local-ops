# WP10 / F24 — credential rotation, rebind & offboarding (fixture)

## What this proves (fixture only)

Local honesty for F24 step 3 (rotate), T-X029 (different-account rebind), and step 6 (offboard):

| Action | Behavior |
|--------|----------|
| Revoke | Mark connection `REVOKED`, deny new leases and send-time effects |
| Cancel queued | Eligible pre-apply work → `CANCELLED`; post-apply retained for reconcile |
| Audit | Redacted audit entries retained (no secrets) |
| Rotate | Same-account local reference switch only; different-account identity → `REBIND_REQUIRED` |
| Rebind | Explicit different-account bind (T-X029): old → `ROTATED_AWAY`, new connection; silent refresh denied |
| Offboard | Manifest + residual obligations (provider revoke stays open / NOT_WIRED) |

## What this does **not** claim

- Live provider token revocation — always `LIVE_PROVIDER_REVOKE_NOT_WIRED`
- Catalog T-F24 / T-US-047 / T-X073 as VERIFIED — remain `NOT_RUN`
- Secret export or remote OAuth revoke
- Same-account rotate as T-X029 proof — T-X029 requires `EXPLICIT_ACCOUNT_REBIND`

External effects: **NONE**. T-X029 may be fixture **ACCEPTED** via the evidence compiler; never silently **VERIFIED** for live.

## Persistence

When `DATABASE_URL` / `WORKSOCIAL_DATABASE_URL` is set, credential/revoke audit persists via `createPgCredentialRotationStore` (migrations `026` + `027`). Otherwise file/memory. PG persistence is not live VERIFIED.

## API / console

- Console: `/credentials`
- `GET /credentials/status` · `/credentials/connections` · `/credentials/audit` · `/credentials/queued-work` · `/credentials/manifests` · `/credentials/rotations` · `/credentials/rebinds`
- `POST /credentials/seed` · `/credentials/lease` · `/credentials/revoke` · `/credentials/rotate` · `/credentials/rebind` · `/credentials/offboard` · `/credentials/live-revoke` (expect NOT_WIRED)

## Relation to recovery evidence

`/recovery` classifies outages. `/credentials` handles local credential revoke/rotate/rebind/offboard honesty. Live provider revoke remains NOT_WIRED on both surfaces.
