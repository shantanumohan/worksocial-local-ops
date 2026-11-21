# `@worksocial/soak` — M9 / NEXT-20

Fixture soak / recovery harness and acceptance evidence compiler.

| Concern | Status |
|---------|--------|
| Crash-restart / no duplicate effects | **real** (file-durable LOCAL_DURABLE) |
| Acceptance evidence compiler | **real** (fixture ACCEPTED for T-X014 / T-X020 / T-US-048 / T-X066 / T-F24 / T-US-047 / T-US-002 / T-X002 / T-X018 / T-US-054 / T-X073 with complete proof sets) |
| T-X066 backup/omit-receipt | Fixture **ACCEPTED** via `BACKUP_OMIT_RECEIPT` (not retry-only no-dup; not live VERIFIED) |
| T-F24 / T-US-047 recover/rotate/reconcile | Fixture **ACCEPTED** via `RECOVER_ROTATE_RECONCILE` (complete F24 evidence; live revoke NOT_WIRED; not live VERIFIED) |
| T-US-002 / T-X002 competing-supervisor lease | Fixture **ACCEPTED** via `COMPETING_SUPERVISOR_LEASE` (singleton host lease; not live VERIFIED) |
| T-X018 / T-US-054 self-approval rejected | Fixture **ACCEPTED** via `SELF_APPROVAL_REJECTED` (independent A25; not live VERIFIED) |
| T-X073 offboard ACTIVE_TOKEN residual | Fixture **ACCEPTED** via `OFFBOARD_ACTIVE_TOKEN_RESIDUAL` (incomplete until live revoke; not live VERIFIED) |
| 72h pilot gate | server-recorded start/heartbeat/end only — short CI soaks stay **NOT_MET**; client claim dates rejected |
| Live CMS / GSC / GA4 / Zoho / Temporal | **NOT_WIRED** |
| ChatGPT Ads | **access-blocked** |
| R1-complete | **not claimed** |
| External effects | **none** |
