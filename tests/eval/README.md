# eval isolation suite (AA-20)

Offline **EVAL_ONLY** isolation proofs for the isolated evaluation worker.

`pnpm test:eval` builds the workspace and runs this suite via `scripts/run-eval-tests.ts`. Exit **0** means isolation invariants hold offline — it does **not** mean live fleet, ChatGPT Ads, or the 159 acceptance catalog are VERIFIED.

| Concern | Status |
|---------|--------|
| Fixture golden suite | exercised |
| Live fleet | **NOT_WIRED** (`LIVE_NOT_WIRED`) |
| ChatGPT Ads | **NOT_WIRED** / access-blocked |
| Learning → effects | cannot expand |
| External effects | **NONE** |
| Catalog cases | remain **NOT_RUN** |

Not production-activated. `releaseGateEligible: false` for product acceptance.
