# `@worksocial/credential-broker`

R1-02 local credential boundary:

- Stores opaque vault references; list APIs never return raw secrets
- `action-gateway` / `provider-adapter` may mint narrow scoped handles
- `claude-runner` and `evaluation-worker` are denied mint and reveal
- No live OAuth or provider vault wiring in this slice

Run unit tests: `pnpm --filter @worksocial/credential-broker test`
