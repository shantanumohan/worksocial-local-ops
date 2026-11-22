# Reference-core tests ≠ production acceptance

**Status:** documentation note for M0 baseline / WP01–WP02 (see also `v6-wp-sequencing.md` for WP01–WP16 band alignment)  
**Spec:** WorkSocial Operations v6.0 (17 November 2026)

## Validation boundary

- Offline **reference-core** / domain unit tests and implemented CI suites (`check`, `test:unit`, `test:contract`, `test:e2e`) prove pure policy and fixture behavior without network or credentials.
- Passing those suites **does not** constitute production acceptance, sandbox verification, or canary verification. **R1 is not claimed complete** by this baseline.
- Product acceptance is defined in `docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md` and indexed by `tests/acceptance-matrix-v6.json` (**159** cases: T-F01–T-F26, T-US-001–T-US-060, T-X001–T-X073). Cases remain `NOT_RUN` until executed in their declared environment with redacted evidence; M9 currently marks **71** cases fixture **ACCEPTED** (T-F24, T-US-002, T-US-008, T-US-010, T-US-018, T-US-024, T-US-036, T-US-040, T-US-042, T-US-044, T-US-046, T-US-047, T-US-048, T-US-054, T-US-057, T-US-058, T-US-060, T-X001, T-X002, T-X003, T-X004, T-X005, T-X006, T-X007, T-X008, T-X009, T-X010, T-X011, T-X012, T-X013, T-X014, T-X015, T-X016, T-X017, T-X018, T-X019, T-X020, T-X021, T-X022, T-X024, T-X025, T-X026, T-X027, T-X028, T-X044, T-X029, T-X031, T-X032, T-X033, T-X037, T-X038, T-X039, T-X043, T-X048, T-X049, T-X050, T-X052, T-X053, T-X054, T-X055, T-X056, T-X057, T-X058, T-X059, T-X060, T-X063, T-X065, T-X066, T-X069, T-X070, T-X073). **T-X066** via backup/omit-receipt; **T-F24/T-US-047** via recover/rotate/reconcile; **T-US-002/T-X002** via competing-supervisor lease; **T-X018/T-US-054** via self-approval rejected; **T-X073** via offboard ACTIVE_TOKEN residual; **T-US-060** via emergency stop at commit; **T-X005** via forged browser role ignored; **T-X006** via cross-workspace reference denied; **T-X019/T-US-036** via approved payload edit invalidated; **T-X029** via explicit rebind; **T-US-057** via cross-workspace resource substitution; **T-US-024** via agent cannot widen grant; **T-US-042/T-X057** via repair weaken rejected; **T-US-044/T-X053** via takeover cancel unsent; **T-US-018/T-X037** via EVAL_ONLY operational tool forbidden; **T-X058** via repair attempt limit escalate; **T-X069** via imported doc quarantined; **T-X038** via eval no-grounding; **T-X039/T-US-058** via metric denominators honest; **T-US-046/T-X048** via hard search constraints; **T-US-010/T-X033** via GSC omitted rows; **T-US-008/T-X032** via GA4 debug not delivered; **T-X031** via wrong property kind; **T-US-040/T-X049** via thank-you without CRM; **T-X024** via old fence after reassignment; **T-X011** via output bomb bounded/quarantined; **T-X003** via symlink escape after root verification; **T-X050** via public synthetic flag requires server grant; **T-X010** via malicious prompt no shell injection; **T-X017** via stop-after-dispatch reconcile; **T-X015** via DST recurring schedule no duplicates — never silently `VERIFIED` for live.
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
