# security

Offline **security gate** suite for ownership / auth / lease gates already implemented in host + authority.

`pnpm test:security` runs Vitest via `scripts/run-security-tests.ts` and must exit **0** when regressions pass. It is a required CI check.

## Coverage

| Gate | Source |
|------|--------|
| Process ownership fail-closed / PID reuse | `@worksocial/persistence` |
| Host lease singleton + dead-holder reclaim | `@worksocial/persistence` |
| Session CSRF / origin / expiry + role privileges | `@worksocial/domain` |
| Standing authority stop-switch / actor-role / grant | `@worksocial/domain` |
| HTTP 401 / CSRF / outbound stop | `@worksocial/api` |

## Honesty

- Not a penetration test or production security certification
- Does not claim credential-rotation (AA-48), Windows AgenticArmyWS host bind (AA-12), or 159 catalog VERIFIED
- External effects: **NONE**
- `productionActivated: false` / `releaseGateEligible: false` in the suite report JSON
