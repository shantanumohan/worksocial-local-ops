# `@worksocial/action-gateway`

R1-02 sole mutation authority stub:

- Durable intent recorded before authorize/apply
- Standing grants + stop switch enforced via `@worksocial/domain`
- Stub apply yields `ACCEPTED_PENDING` — never auto-`VERIFIED`
- No live providers; independent of Claude runner credentials

Run unit tests: `pnpm --filter @worksocial/action-gateway test`
