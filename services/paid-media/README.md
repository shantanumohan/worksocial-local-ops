# `@worksocial/paid-media`

AA-19 / WP13–14 fixture analysis + paid-media proposal decision support.

| Concern | Status |
|--------|--------|
| Analysis definitions / hypotheses / redacted briefs (F19) | **Real** (fixture) |
| Google Ads typed proposals + financial diff + approve/decline (F16) | **Real** (fixture Analyze-only) |
| ChatGPT Ads recommendations | **ACCESS_BLOCKED** without verified local transport + entitlement |
| Live Ads mutations / spend | **NOT_WIRED** |
| External effects | **NONE** |
| Acceptance catalog VERIFIED | **No** — T-X034 fixture ACCEPTED only (test Ads ≠ production); other related cases remain NOT_RUN |

## Hard rules

1. ChatGPT Ads stays access-blocked until local transport and entitlement are verified.
2. Approve/decline records a decision; execute never performs provider mutations in this slice.
3. Shared-budget-unknown and partial same-day spend block budget recommendations.
4. Fixture ≠ sandbox ≠ live. Do not invent live KPIs or mark catalog cases VERIFIED.
