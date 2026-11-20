# `@worksocial/api`

Local identity, authority, production-mapping, role-runtime, probes, knowledge/demand, SEO/search, content/distribution, after-hours inbox, and learning HTTP surface:

- Session login (`POST /auth/login`) with HttpOnly cookie + CSRF
- Authority state, stop switch, operating mode
- Production mapping (`/mapping/*`) — bindings, forms, booking/CRM ownership, journeys, read evidence, labeled outcomes
- Roles (`/roles/state`, `/roles/evaluate-fixture`, `/roles/run`) — thirty-role status, fixture evaluations, mission enqueue
- Probes (`/probes/*`) — HTTP/DOM/canary monitoring
- Knowledge (`/knowledge/status`, `/knowledge/facts`, `/knowledge/demand`, `/knowledge/ingestions`, `/knowledge/seed-fixtures`, `/knowledge/ingest-claim`, `/knowledge/ingest-instruction`, `/knowledge/verify-fact`) — fact registry + demand signals with SUPPORTED/UNKNOWN/HYPOTHESIS labels
- SEO (`/seo/status`, `/seo/audits`, `/seo/proposals`, `/seo/validate-schema`, `/seo/search`, `/seo/release-pilot`, …) — page audits, proposal gates, schema validation, fixture semantic search, gateway-gated pilot page release
- Content (`/content/status`, `/content/campaigns`, `/content/articles`, `/content/variants`, `/content/receipts`, `/content/release-canonical`, `/content/release-variant`, …) — article pipeline, destination variants, gateway-gated fixture CMS/GBP/social receipts
- Inbox (`/inbox/status`, `/inbox/conversations`, `/inbox/draft-reply`, `/inbox/queue-reply`, `/inbox/send-reply`, `/inbox/takeover`, `/inbox/log-lead`, `/inbox/handoff`, …) — after-hours concierge, takeover, fixture Zoho lead, handoff
- Learning (`/learning/status`, `/learning/models`, `/learning/runs`, `/learning/proposals`, `/learning/train`) — multi-model registry, metrics, proposals under review
- Gateway intent submission resolves mapping gates before authorize → apply/deny stub
- Credential-broker reference listing (opaque only)

Not production-activated. No live Zoho/CMS/GBP/social/SERP/inbox mutations or cloud IdP. Live CMS/GBP/social/inbox remain NOT_WIRED; ACCEPTED_PENDING ≠ VERIFIED. Claude default is fixture mode. Learning is proposals-only and does not expand authority. Model claims / HYPOTHESIS are never published truth. Takeover increments conversation version and cancels queued agent replies.

Default local owner: `owner` / `local-owner-change-me` (override `WORKSOCIAL_OWNER_PASSWORD`).
