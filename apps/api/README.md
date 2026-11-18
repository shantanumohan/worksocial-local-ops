# `@worksocial/api`

Local identity, authority, production-mapping, role-runtime, and learning HTTP surface:

- Session login (`POST /auth/login`) with HttpOnly cookie + CSRF
- Authority state, stop switch, operating mode
- Production mapping (`/mapping/*`) — bindings, forms, booking/CRM ownership, journeys, read evidence, labeled outcomes
- Roles (`/roles/state`, `/roles/evaluate-fixture`, `/roles/run`) — thirty-role status, fixture evaluations, mission enqueue
- Learning (`/learning/status`, `/learning/models`, `/learning/runs`, `/learning/proposals`, `/learning/train`) — multi-model registry, metrics, proposals under review
- Gateway intent submission resolves mapping gates before authorize → apply/deny stub
- Credential-broker reference listing (opaque only)

Not production-activated. No live Zoho/CMS mutations or cloud IdP. Claude default is fixture mode. Learning is proposals-only and does not expand authority.

Default local owner: `owner` / `local-owner-change-me` (override `WORKSOCIAL_OWNER_PASSWORD`).
