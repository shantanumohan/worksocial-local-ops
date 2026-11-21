# Toolchain pin (M0 baseline)

Pinned versions for reproducible local and CI runs. Declared in-repo; CI must use these pins.

| Tool | Pin | Declared in |
|------|-----|-------------|
| Node.js | `20.18.1` (engines: `>=20.0.0`) | `.nvmrc`, `package.json` `engines.node` |
| pnpm | `9.15.0` | `package.json` `packageManager` |
| TypeScript | `5.7.2` | root `devDependencies` |
| Vitest | `2.1.8` | root `devDependencies` |
| tsx | `4.19.2` | root `devDependencies` |

## Install

```bash
# Node via nvm / fnm / asdf reading .nvmrc
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
```

## Required CI checks (implemented suites only)

GitHub Actions workflow `.github/workflows/ci.yml` runs:

1. `pnpm test:acceptance-matrix` — catalog ↔ matrix ID alignment (159 cases; fixture ACCEPTED only with on-disk evidence)
2. `pnpm check` — TypeScript project references
3. `pnpm test:unit` — offline domain/services
4. `pnpm test:contract` — offline contracts
5. `pnpm test:e2e` — fixture e2e-lite (not browser product acceptance)
6. `pnpm db:migrate` + `pnpm test:database` — Postgres durable execution (M2; service container)
7. `pnpm test:workflow` — LOCAL_DURABLE mission + Temporal binding probe + Temporal local test-server crash/restart/replay
8. `pnpm test:temporal-compose` — CI Docker `temporalio/auto-setup` + API→Temporal→PG e2e (honest skip locally without Temporal)
9. `pnpm recovery:rehearse` + `pnpm release:evidence` — M9 fixture soak + evidence (must exit 0)
10. `pnpm test:eval` — AA-20 offline EVAL_ONLY isolation suite (must exit 0; fixture ≠ live fleet; not catalog VERIFIED)
11. `pnpm test:security` — offline ownership / auth / lease gate suite (must exit 0; not a pen-test or catalog VERIFIED)

`pnpm test:security` is implemented for gates already in host+authority and **must exit 0** in CI. Passing it does **not** mean credential-rotation (AA-48), Windows host bind, live penetration testing, or the 159 acceptance cases are VERIFIED. `pnpm test:eval` is isolation-only — same honesty boundary for live fleet / Ads / catalog. Product acceptance cases remain `NOT_RUN` until executed with redacted evidence in their declared environment (fixture ≠ sandbox ≠ authorized production). M9 currently marks **14** cases fixture **ACCEPTED** (T-X014, T-X020, T-US-048, T-X066, T-F24, T-US-047, T-US-002, T-X002, T-X018, T-US-054, T-X073, T-US-060, T-X005, T-X006).

ChatGPT Ads (`T-F07` / `T-US-013` / `T-US-014`) stays access-blocked without verified local transport and entitlement.

External effects in this baseline: **NONE**.
