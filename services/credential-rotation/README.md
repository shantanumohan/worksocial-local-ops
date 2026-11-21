# `@worksocial/credential-rotation`

WP10 / F24 fixture credential revoke, rotate, rebind, and offboard honesty:

- Mark connections revoked; deny new leases and send-time effects
- Cancel eligible queued work; retain post-apply for reconcile
- Retain redacted audit history (no secrets)
- Same-account local rotate; different-account identity → `REBIND_REQUIRED` (T-X029)
- Explicit rebind: old → `ROTATED_AWAY`, new connection; silent refresh denied
- Live provider revoke stays **NOT_WIRED**
- External effects: **NONE**; broader catalog (T-F24 / T-US-047 / T-X073): **NOT_RUN**
- T-X029 fixture **ACCEPTED** only via evidence compiler (`EXPLICIT_ACCOUNT_REBIND`)

Run unit tests: `pnpm --filter @worksocial/credential-rotation test`
