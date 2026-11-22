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
| WP15–16 | Soak harness, recovery evidence (#27–#28, #34); offline security gate suite (`pnpm test:security` — ownership/auth/lease) | Pen-test / AA-48 credential-rotation / Windows host still open; live recovery NOT_RUN; 72h soak NOT_MET; **115/159** catalog cases NOT_RUN |

## Acceptance matrix (do not invent VERIFIED)

- Machine index: `tests/acceptance-matrix-v6.json`
- Typical counts on current main: **102 NOT_RUN**, **57 fixture ACCEPTED** (`T-F24, T-US-002, T-US-008, T-US-010, T-US-018, T-US-024, T-US-036, T-US-040, T-US-042, T-US-044, T-US-046, T-US-047, T-US-048, T-US-054, T-US-057, T-US-058, T-US-060, T-X001, T-X002, T-X003, T-X005, T-X006, T-X009, T-X010, T-X011, T-X012, T-X014, T-X015, T-X016, T-X017, T-X018, T-X019, T-X020, T-X021, T-X022, T-X024, T-X029, T-X031, T-X032, T-X033, T-X037, T-X038, T-X039, T-X048, T-X049, T-X050, T-X053, T-X057, T-X058, T-X013, T-X063, T-X065, T-X066, T-X069, T-X073`), **0 VERIFIED**
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
