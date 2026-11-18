# claude-runner

R1-04 thirty-role Claude Code runtime adapter.

## Real in this slice

- Role job queue with bounded concurrency (default 4)
- Pinned CLI flag allow-list; **permission bypass flags always refused**
- Structured output validation
- Timeouts / budget reservation + settlement hooks
- **Fixture/offline mode** when CLI absent or `WORKSOCIAL_CLAUDE_FIXTURE=1` (default for API)
- Independent review / recursion gates via `@worksocial/domain`

## Stub / NOT_WIRED

- Live Claude Code fleet on a pinned host binary (optional when CLI is installed and fixture forcing is off)
- Temporal-durable workflow activities (see `workflow-worker`)

Not production-activated. No blanket `--dangerously-skip-permissions`.
