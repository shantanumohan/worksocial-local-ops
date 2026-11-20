# Reference-core tests ≠ production acceptance

**Status:** documentation note for Release 1 / WP01–WP02  
**Spec:** WorkSocial Operations v6.0 (17 November 2026)

## Validation boundary

- Offline **reference-core** / domain unit tests (target order of magnitude ~130 in the full v6 suite) prove pure policy, state-machine, takeover, ledger, budget, and missingness logic without network or credentials.
- Passing reference-core tests **does not** constitute production acceptance, sandbox verification, or canary verification.
- Product acceptance is tracked separately in `tests/acceptance-matrix-v6.json` (**159** cases: T-F01–T-F26, T-US-001–T-US-060, T-X001–T-X073). At bootstrap every case is `NOT_RUN`.

## Experience contracts preserved from v5

Release 1 preserves the v5 experience baseline:

- **25 screens** and **26 journeys/flows** (see `docs/v5/`)
- Owner/product handbook and UX flows design guide remain authoritative for UX until a later ADR supersedes them

Feature status labels (v6) remain the only honest completion vocabulary:

`implemented-contract-tested` | `sandbox-verified` | `production-canary-verified` | `blocked-external-access` | `excluded-by-owner`

## Related artifacts

- Condensed v6 baseline: `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- Acceptance catalog (narrative): `docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md`
- Acceptance matrix stub: `tests/acceptance-matrix-v6.json`
- v5 package: `docs/v5/`
