# evaluation-worker

AA-20 / M8 / NEXT-19 isolated evaluation path for Claude and Gemini.

Library worker hosted by the API (same shape as learning-worker) — **not** a supervised fleet process. Fixture adjudication only; no live provider network I/O.

## Isolation (hard)

- Principal: `evaluation-worker` only
- **No** action-gateway write principal
- **No** production effect credentials (credential-broker denies mint/reveal)
- Learning cannot expand effects (`learningCannotExpandEffects: true`)
- Capability: **EVAL_ONLY** — no publish, CRM, or customer-message tools
- Budget: separate fixture eval account (not operational Claude)

## Real vs stub

| Capability | Status |
|------------|--------|
| Fixture golden suite adjudication | **real** |
| Forbidden tool gates (T-X037) | **real** |
| Grounding unused → NO_GROUNDING (T-X038) | **real** |
| Separate eval budget + exhaust path | **real** |
| Live Claude/Gemini fleet | **NOT_WIRED** (`LIVE_NOT_WIRED`) |
| ChatGPT Ads | **NOT_WIRED** / access-blocked |
| Temporal eval activities | **NOT_WIRED** |
| Persistence | **Postgres** when `DATABASE_URL` set (`createPgEvaluationStore`); file/memory fallback otherwise |
| Acceptance catalog cases | remain **NOT_RUN** |
| Supervisor fleet process slot | **not claimed** (API-hosted library) |

Seed fixtures, run the golden suite, and inspect blocked-tool / no-grounding verdicts via `/eval/*` APIs and the `/eval` console page. External effects: **NONE**. Fixture persistence ≠ live VERIFIED.
