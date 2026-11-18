# `@worksocial/api`

Local identity, authority, production-mapping, role-runtime, probes, knowledge/demand, and learning HTTP surface:

- Session login (`POST /auth/login`) with HttpOnly cookie + CSRF
- Authority state, stop switch, operating mode
- Production mapping (`/mapping/*`) — bindings, forms, booking/CRM ownership, journeys, read evidence, labeled outcomes
- Roles (`/roles/state`, `/roles/evaluate-fixture`, `/roles/run`) — thirty-role status, fixture evaluations, mission enqueue
- Probes (`/probes/*`) — HTTP/DOM/canary monitoring
- Knowledge (`/knowledge/status`, `/knowledge/facts`, `/knowledge/demand`, `/knowledge/ingestions`, `/knowledge/seed-fixtures`, `/knowledge/ingest-claim`, `/knowledge/ingest-instruction`, `/knowledge/verify-fact`) — fact registry + demand signals with SUPPORTED/UNKNOWN/HYPOTHESIS labels
- Learning (`/learning/status`, `/learning/models`, `/learning/runs`, `/learning/proposals`, `/learning/train`) — multi-model registry, metrics, proposals under review
- Gateway intent submission resolves mapping gates before authorize → apply/deny stub
- Credential-broker reference listing (opaque only)

Not production-activated. No live Zoho/CMS/SERP mutations or cloud IdP. Claude default is fixture mode. Learning is proposals-only and does not expand authority. Model claims are never facts.

Default local owner: `owner` / `local-owner-change-me` (override `WORKSOCIAL_OWNER_PASSWORD`).
