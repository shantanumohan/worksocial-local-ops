# e2e / e2e-lite

Offline end-to-end-lite journeys for Release 1 monitoring (R1-05).

- Fixture HTTP + DOM + form-to-CRM canary with correlated receipt
- No live Zoho, Playwright browsers, or production network
- Product acceptance catalog cases remain `NOT_RUN`
- `keyboard-focus-restore.e2e-lite.test.ts` — T-X061 soak proof ACCEPTED path; external effects NONE; never VERIFIED

```bash
pnpm test:e2e
```
