# unit

Offline unit tests for R1-01:

- `packages/domain` — reference-core pure logic
- `packages/persistence` — storage-root + sync-path policy + host lease
- `services/supervisor` — lifecycle restart + selected-folder policy

Run: `pnpm test:unit`

These are not production acceptance (`tests/acceptance-matrix-v6.json` remains the product gate).
