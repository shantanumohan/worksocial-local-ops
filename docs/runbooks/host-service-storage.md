# Host service recovery and safe storage folders

Milestone: M2 / AA-33 (NEXT-11). External effects: **NONE**. Windows AgenticArmyWS bind remains **AA-12 / out of scope**.

## Safe default folders (off the checkout)

Control-plane state no longer defaults under the git repo (`.worksocial/local-state`). That path is unsafe when the checkout lives on OneDrive or another consumer sync folder.

| Platform | Default data home | Default state dir |
|----------|-------------------|-------------------|
| Linux (cloud-friendly) | `$XDG_DATA_HOME/worksocial` or `~/.local/share/worksocial` | `<data-home>/local-state` |
| macOS | `~/Library/Application Support/WorkSocial` | `<data-home>/local-state` |
| Windows | `%LOCALAPPDATA%\WorkSocial` | `<data-home>\local-state` |

Overrides:

- `WORKSOCIAL_DATA_HOME` — parent for state + suggested durable roots
- `WORKSOCIAL_STATE_DIR` — explicit control-plane directory (absolute preferred)

Suggested durable roots (still require registration; never under OneDrive):

- `<data-home>/pgdata`
- `<data-home>/temporal`
- `<data-home>/secrets`

Artifact roots (`source` / `working` / `content` / `reports` / `encrypted_backup`) **may** live under an owner OneDrive workspace such as `AgenticArmyWS`. Live DB, Temporal, secrets, and auth/session state **must not**.

If `WORKSOCIAL_STATE_DIR` resolves under a sync path, supervisor CLI refuses to start/stop/recover/doctor/health.

## Host recovery

Supervisor CLI is not a long-running daemon. Managed slots are **detached** children that renew the host lease by generation after the CLI exits.

| Command | Behavior |
|---------|----------|
| `pnpm local:start` | Stop owned slots → acquire/reclaim lease → start api/console/temporal-worker |
| `pnpm local:recover` | If lease held, api+console healthy, and (when `TEMPORAL_ADDRESS` set) temporal worker live/`temporal-wired` → **adopt**. Else clean restart |
| `pnpm local:stop` | Ownership-verified stop of managed PIDs; release lease |
| `pnpm local:health` | Plane-separated status: host / api / console / temporal |
| `pnpm local:doctor` | Storage, ownership probe, and plane checks |

Lease reclaim: a non-expired lease whose `holderPid` is dead is reclaimable (`isHolderAlive`). Expired leases remain reclaimable as before.

## Ownership probes

| Probe | When | Strength |
|-------|------|----------|
| Same-session spawn map | This supervisor CLI started the child | Safe for that CLI lifetime |
| Linux `/proc/<pid>/{cmdline,environ}` | `/proc` present | Preferred OS identity |
| Heartbeat JSON under state dir | Health/status only | **Never** authorizes SIGTERM/SIGKILL (PID-reuse hazard) |
| Empty probe / no session map | Cross-CLI stop without `/proc` | **Deny kill** (fail-closed) |

Windows full host lifecycle / AgenticArmyWS service bind is **AA-12**, not claimed by this slice.

## Health planes

`health.components` distinguishes:

- **host** — lease held / control plane
- **api** — process slot (+ identity wiring when running)
- **console** — process slot
- **temporal** — `stub` / `NOT_WIRED` until `TEMPORAL_ADDRESS` + reachable frontend (`temporal-wired`)

Host up ≠ Temporal wired. Live CMS / Zoho / GSC remain **NOT_WIRED**.

## Migration from repo-local state

If you previously used `<repo>/.worksocial/local-state`:

1. Set `WORKSOCIAL_STATE_DIR` to the old path **only** if it is not on OneDrive, or
2. Copy the directory to the new platform default, or
3. Accept a fresh local state (fixture/dev only)

## Honesty

- 159 acceptance cases remain **NOT_RUN**
- productionActivated stays **false**
- No live credentials, CMS writes, or prod mTLS in this slice
