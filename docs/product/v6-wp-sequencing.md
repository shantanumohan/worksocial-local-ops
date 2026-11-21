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
| WP15–16 | Soak harness, recovery evidence (#27–#28, #34) | Live recovery NOT_RUN; 72h soak NOT_MET; **156/159** catalog cases NOT_RUN |

## Acceptance matrix (do not invent VERIFIED)

- Machine index: `tests/acceptance-matrix-v6.json`
- Typical counts on current main: **156 NOT_RUN**, **3 fixture ACCEPTED** (`T-US-048`, `T-X014`, `T-X020`), **0 VERIFIED**
- Fixture ACCEPTED ≠ sandbox-verified ≠ production-canary-verified
- Catalog: `WorkSocial_Acceptance_Test_Catalog_v6.md`

## Temporal honesty pointer

See `temporal-binding.md`. Summary:

- Unreachable / unset frontend → runtime label **`NOT_WIRED`** (in-process / LOCAL_DURABLE paths)
- Reachable frontend + worker → **`TEMPORAL`** (CI compose job proves API → Temporal → PG with fixture effects)
- Production mTLS namespace and Windows Temporal service remain **NOT_WIRED**

## Related

- Condensed baseline: `WorkSocial_Operations_v6_implementation_baseline.md`
- Reference-core ≠ acceptance: `reference-core-vs-acceptance.md`
- Runbooks: `../runbooks/m9-soak-acceptance.md`, `../runbooks/recovery-evidence.md`, `../runbooks/host-service-storage.md`
