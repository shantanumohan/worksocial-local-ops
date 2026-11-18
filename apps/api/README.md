# `@worksocial/api`

R1-02 local identity and authority HTTP surface:

- Session login (`POST /auth/login`) with HttpOnly cookie + CSRF
- Authority state, stop switch, operating mode
- Gateway intent submission (authorize → apply/deny stub)
- Credential-broker reference listing (opaque only)

Not production-activated. No live providers or cloud IdP.

Default local owner: `owner` / `local-owner-change-me` (override `WORKSOCIAL_OWNER_PASSWORD`).
