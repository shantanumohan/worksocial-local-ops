# v6 WP01–WP16 sequencing (honesty index)

**Status:** documentation alignment (AA-14)  
**Spec:** WorkSocial Operations v6.0 — banded work-package sequence  
**Main pin when written:** post-#37 AA-19 (`afee565…` or newer)

## Canonical bands

| Band | Scope |
|------|--------|
| WP01–05 | sources, contracts, local lifecycle, authority, durable Claude execution |
| WP06–09 | provider identity, governed facts, demand/visibility/search, content + distribution |
| WP10–12 | form-to-CRM, concierge/takeover, bounded repairs |
| WP13–14 | review/analysis, paid-media proposals, isolated evaluation |
| WP15–16 | security/recovery/soak, integrated owner acceptance |

v6 does not publish sixteen separate titles. Tracker tasks may still use historical “R1-0N / Work package N” labels — those are **not** the same integers as WP0N. Prefer the band map above for sequencing.

## Landed vs open (fixture honesty)

| Band | Fixture code on main | Still open / NOT_WIRED |
|------|----------------------|-------------------------|
| WP01–05 | Bootstrap, local host, authority, roles, PG + Temporal **bindable** (#29–#33, #18–#19) | Default Temporal unbound = `NOT_WIRED`; Windows host (AA-12); live Claude fleet optional |
| WP06–09 | Mapping, knowledge, SEO/search, content/distribution | Live CMS / GBP / social / SERP / Trends / GSC-GA4 query |
| WP10–12 | Probes/canary, inbox/takeover, bounded repair | Live Zoho / inbox / CMS repair |
| WP13–14 | Paid-media + analysis fixtures (**AA-19** #37); EVAL_ONLY worker + PG eval store (#35–#36) | Live ads execute **NOT_WIRED**; ChatGPT Ads ACCESS_BLOCKED without local transport+entitlement |
| WP15–16 | Soak harness, recovery evidence (#27–#28, #34); offline security gate suite (`pnpm test:security` — ownership/auth/lease) | Pen-test / AA-48 credential-rotation / Windows host still open; live recovery NOT_RUN; 72h soak NOT_MET; **101/159** catalog cases NOT_RUN |

## Acceptance matrix (do not invent VERIFIED)

- Machine index: `tests/acceptance-matrix-v6.json`
- Typical counts on current main: **36 NOT_RUN**, **123 fixture ACCEPTED** (`T-F01, T-F02, T-F03, T-F04, T-F05, T-F06, T-F08, T-F09, T-F10, T-F11, T-F12, T-F13, T-F14, T-F15, T-F16, T-F18, T-F19, T-F19, T-F20, T-F22, T-F23, T-F24, T-F26, T-US-002, T-US-006, T-US-008, T-US-010, T-US-012, T-US-015, T-US-017, T-US-018, T-US-019, T-US-020, T-US-021, T-US-022, T-US-023, T-US-024, T-US-025, T-US-026, T-US-027, T-US-028, T-US-029, T-US-030, T-US-031, T-US-033, T-US-034, T-US-035, T-US-036, T-US-038, T-US-040, T-US-042, T-US-044, T-US-046, T-US-047, T-US-048, T-US-049, T-US-050, T-US-051, T-US-052, T-US-053, T-US-054, T-US-055, T-US-057, T-US-058, T-US-059, T-US-060, T-X001, T-X002, T-X003, T-X004, T-X005, T-X006, T-X007, T-X008, T-X009, T-X010, T-X011, T-X012, T-X013, T-X014, T-X015, T-X016, T-X017, T-X018, T-X019, T-X020, T-X021, T-X022, T-X023, T-X024, T-X025, T-X026, T-X027, T-X028, T-X029, T-X030, T-X031, T-X032, T-X033, T-X037, T-X038, T-X039, T-X040, T-X043, T-X044, T-X045, T-X048, T-X049, T-X050, T-X052, T-X053, T-X054, T-X055, T-X056, T-X057, T-X058, T-X059, T-X060, T-X063, T-X065, T-X066, T-X069, T-X070, T-X073`), **0 VERIFIED**
- Fixture ACCEPTED ≠ sandbox-verified ≠ production-canary-verified
- Catalog: `WorkSocial_Acceptance_Test_Catalog_v6.md`

## Temporal honesty pointer

See `temporal-binding.md`. Summary:

- Unreachable / unset frontend → API enqueue label **`NOT_WIRED`** (in-process Claude path; not the separate `LOCAL_DURABLE` store path)
- Reachable frontend → label **`TEMPORAL`** means **frontend reachability only** (probe does not certify a polling worker). CI compose separately proves API → Temporal → PG with a worker + fixture effects
- Production mTLS namespace and Windows Temporal service remain **NOT_WIRED**

## Related

- Condensed baseline: `WorkSocial_Operations_v6_implementation_baseline.md`
- Reference-core ≠ acceptance: `reference-core-vs-acceptance.md`
- Runbooks: `../runbooks/m9-soak-acceptance.md`, `../runbooks/recovery-evidence.md`, `../runbooks/host-service-storage.md`
