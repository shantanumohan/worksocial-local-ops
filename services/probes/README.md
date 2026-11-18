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

## Acceptance case IDs (catalog references — not VERIFIED)

`T-F11`, `T-F12`, `T-US-032`, `T-X040` — exercised offline; product catalog stays `NOT_RUN` without live evidence.
