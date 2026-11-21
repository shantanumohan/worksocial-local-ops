# Reference-core tests ≠ production acceptance

**Status:** documentation note for M0 baseline / WP01–WP02 (see also `v6-wp-sequencing.md` for WP01–WP16 band alignment)  
**Spec:** WorkSocial Operations v6.0 (17 November 2026)

## Validation boundary

- Offline **reference-core** / domain unit tests and implemented CI suites (`check`, `test:unit`, `test:contract`, `test:e2e`) prove pure policy and fixture behavior without network or credentials.
- Passing those suites **does not** constitute production acceptance, sandbox verification, or canary verification. **R1 is not claimed complete** by this baseline.
- Product acceptance is defined in `docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md` and indexed by `tests/acceptance-matrix-v6.json` (**159** cases: T-F01–T-F26, T-US-001–T-US-060, T-X001–T-X073). Cases remain `NOT_RUN` until executed in their declared environment with redacted evidence; M9 fixture soak currently marks **12** cases `ACCEPTED` (T-X014, T-X020, T-US-048, T-X066, T-F24, T-US-047, T-US-002, T-X002, T-X018, T-US-054, T-X073, T-US-060). **T-X066** via backup/omit-receipt; **T-F24/T-US-047** via recover/rotate/reconcile; **T-US-002/T-X002** via competing-supervisor lease; **T-X018/T-US-054** via self-approval rejected; **T-X073** via offboard ACTIVE_TOKEN residual; **T-US-060** via emergency stop at commit — never silently `VERIFIED` for live.
- Fixture, sandbox, and specifically authorized production results must remain distinguishable.
- ChatGPT Ads (`T-F07` / `T-US-013` / `T-US-014`) stays access-blocked unless supported local transport, entitlement, and auth are verified.
- Implemented M9 scripts (`pnpm recovery:rehearse`, `pnpm release:evidence`) exit **0** when fixture proofs and evidence compile honestly. `pnpm test:eval` (AA-20) exits **0** for offline EVAL_ONLY isolation only — not live fleet or catalog VERIFIED. `pnpm test:security` exits **0** for offline ownership/auth/lease gate regressions only — not a pen-test, credential-rotation completion, or catalog VERIFIED.

## Experience contracts preserved from v5

Release 1 preserves the v5 experience baseline:

- **25 screens** and **26 journeys/flows** (see `docs/v5/`)
- Owner/product handbook and UX flows design guide remain authoritative for UX until a later ADR supersedes them

Feature status labels (v6) remain the only honest completion vocabulary:

`implemented-contract-tested` | `sandbox-verified` | `production-canary-verified` | `blocked-external-access` | `excluded-by-owner`

## Related artifacts

- Condensed v6 baseline: `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- Acceptance catalog (full definitions): `docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md`
- Acceptance matrix (machine-readable): `tests/acceptance-matrix-v6.json`
- Toolchain pin + CI: `docs/product/toolchain.md`
- v5 package: `docs/v5/`
