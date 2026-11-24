# e2e / e2e-lite

Offline end-to-end-lite journeys for Release 1 monitoring (R1-05).

- Fixture HTTP + DOM + form-to-CRM canary with correlated receipt
- No live Zoho, Playwright browsers, or production network
- Product acceptance catalog cases remain `NOT_RUN`
- `keyboard-focus-restore.e2e-lite.test.ts` — T-X061 soak proof ACCEPTED path; external effects NONE; never VERIFIED
- `indirect-prompt-injection-exfil.e2e-lite.test.ts` — T-X063 soak proof ACCEPTED path; external effects NONE; never VERIFIED
- `unknown-usage-cancel.e2e-lite.test.ts` — T-X027 unknown-usage hold residual; liveBudgetProvider NOT_WIRED; never VERIFIED

```bash
pnpm test:e2e
```
- `unknown-policy-question.e2e-lite.test.ts` — T-X055 soak proof ACCEPTED path; external effects NONE; never VERIFIED
- `partial-campaign-destinations.e2e-lite.test.ts` — T-X045 soak proof ACCEPTED path; external effects NONE; never VERIFIED
