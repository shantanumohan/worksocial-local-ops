# probes

R1-05 monitoring: deterministic HTTP/DOM probes, form-to-CRM canaries, and integration reconciliation.

**Not production-activated.** Live Zoho writes remain `NOT_WIRED` until owner credentials exist.

## Real vs stub

| Capability | Status |
|------------|--------|
| Fixture HTTP probes | **real** (offline catalog) |
| Fixture DOM/journey checks | **real** (HTML fixture; Playwright optional) |
| Form-to-CRM canary (fixture CRM ledger) | **real** — synthetic lead + gateway grant + correlated receipt |
| Reconciliation (fail closed on ambiguous) | **real** |
| Learning ledger hooks (`fixtureOnly`) | **real** |
| Live Zoho CRM | **NOT_WIRED** |
| Live Playwright browser sessions | **NOT_WIRED** unless `WORKSOCIAL_PLAYWRIGHT=1` + URL binding |
| Live HTTP probes | Allowlisted https only (`WORKSOCIAL_PROBE_ALLOWED_HOSTS`); SSRF/timeout guarded |

## Acceptance case IDs (catalog references — not VERIFIED)

`T-F20`, `T-US-039`, `T-US-040`, `T-X049` — exercised offline; product catalog stays `NOT_RUN` without live evidence.
