# `@worksocial/api`

Local identity, authority, production-mapping, and role-runtime HTTP surface (R1-02 → R1-04):

- Session login (`POST /auth/login`) with HttpOnly cookie + CSRF
- Authority state, stop switch, operating mode
- Production mapping (`/mapping/*`) — bindings, forms, booking/CRM ownership, journeys, read evidence, labeled outcomes
- Roles (`/roles/state`, `/roles/evaluate-fixture`, `/roles/run`) — thirty-role status, fixture evaluations, mission enqueue
- Gateway intent submission resolves mapping gates before authorize → apply/deny stub
- Credential-broker reference listing (opaque only)

Not production-activated. No live Zoho/CMS mutations or cloud IdP. Claude default is fixture mode.

Default local owner: `owner` / `local-owner-change-me` (override `WORKSOCIAL_OWNER_PASSWORD`).
