# unit

Offline unit tests:

- `packages/domain` — reference-core + roles, standing authority, session, connection status, production mapping, agent role contracts + review/recursion/outcome hooks
- `packages/ml` — multi-model registry, feature extraction, offline train/predict, authority non-expansion
- `packages/persistence` — storage/lease + authority store + production mapping store + role-runtime store + **learning store**
- `services/supervisor` — lifecycle restart + selected-folder policy
- `services/action-gateway` — unauthorized-write + stop-switch + acceptance≠verified + read-evidence gates
- `services/credential-broker` — Claude-runner / evaluation / learning-worker isolation
- `services/claude-runner` — fixture evaluations, queue bounds, bypass denial
- `services/workflow-worker` — Temporal NOT_WIRED mission enqueue
- `services/learning-worker` — isolated train loop + proposals under review
- `apps/api` — login-protected authority + mapping + roles + learning HTTP

Run: `pnpm test:unit`

Contract companions: `pnpm test:contract`

These are not production acceptance (`tests/acceptance-matrix-v6.json` remains the product gate).
