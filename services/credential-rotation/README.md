# `@worksocial/credential-rotation`

WP10 / F24 fixture credential revoke, rotate, and offboard honesty:

- Mark connections revoked; deny new leases and send-time effects
- Cancel eligible queued work; retain post-apply for reconcile
- Retain redacted audit history (no secrets)
- Live provider revoke stays **NOT_WIRED**
- External effects: **NONE**; catalog claim: **NOT_RUN**

Run unit tests: `pnpm --filter @worksocial/credential-rotation test`
