# unit

Offline unit tests for R1-01 + R1-02:

- `packages/domain` — reference-core + roles, standing authority, session, connection status
- `packages/persistence` — storage/lease + authority store
- `services/supervisor` — lifecycle restart + selected-folder policy
- `services/action-gateway` — unauthorized-write + stop-switch + acceptance≠verified
- `services/credential-broker` — Claude-runner isolation
- `apps/api` — login-protected authority + stop-switch HTTP

Run: `pnpm test:unit`

Contract companions: `pnpm test:contract`

These are not production acceptance (`tests/acceptance-matrix-v6.json` remains the product gate).
