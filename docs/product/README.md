# Product docs

- `WorkSocial_Operations_v6_implementation_baseline.md` — condensed v6.0 product/engineering/verification baseline (17 Nov 2026)
- `WorkSocial_Acceptance_Test_Catalog_v6.md` — **full** product acceptance catalog (159 cases: T-F01–26, T-US-001–060, T-X001–073; all `NOT_RUN` until evidence)
- `reference-core-vs-acceptance.md` — reference-core / offline suites ≠ production acceptance
- `toolchain.md` — pinned Node/pnpm/TypeScript/Vitest and required CI checks
- Machine-readable matrix: `tests/acceptance-matrix-v6.json` (aligned to catalog; every ID resolves; validate with `pnpm test:acceptance-matrix`)

Invariants: fixture ≠ sandbox ≠ authorized production; ChatGPT Ads access-blocked without verified local transport/entitlement; placeholder suites cannot satisfy release gates.

v5 experience contracts live under `docs/v5/` (UX flows, provider testing, experience HTML, owner handbook).
