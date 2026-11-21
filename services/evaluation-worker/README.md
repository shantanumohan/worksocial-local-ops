# evaluation-worker

M8 / NEXT-19 isolated evaluation path for Claude and Gemini.

| Concern | Status |
|---------|--------|
| Capability | **EVAL_ONLY** — no publish, CRM, or customer-message tools |
| Budget | Separate fixture eval budget (not operational Claude) |
| Live model fleet | **NOT_WIRED** — fixture adjudication only |
| ChatGPT Ads | **NOT_WIRED** / access-blocked without verified transport + entitlement |
| Temporal | **NOT_WIRED** |
| Acceptance catalog | Related IDs remain **NOT_RUN** |

Seed fixtures, run the golden suite, and inspect blocked-tool / no-grounding verdicts via `/eval/*` APIs and the `/eval` console page.
