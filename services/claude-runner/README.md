# claude-runner

R1-04 thirty-role Claude Code runtime adapter + M3 evidence cycle.

## Real in this slice

- Role job queue with bounded concurrency (default 4)
- Pinned CLI flag allow-list; **permission bypass flags always refused**
- Structured output validation
- Timeouts / budget reservation + settlement hooks
- **Fixture/offline mode** when CLI absent or `WORKSOCIAL_CLAUDE_FIXTURE=1` (default for API)
- Independent review / recursion gates via `@worksocial/domain`
- **M3 input-package compiler path** (`runEvidenceCycle`): trust-labeled evidence, writer citations, separate A25 review binding
- Offline fake adapter (deterministic, zero spend) — never silent fixture SUCCESS when `requireLive=true`

## Stub / NOT_WIRED

- Live Claude Code fleet on a pinned host binary (optional when CLI is installed and fixture forcing is off)
- Temporal cluster activities (LOCAL_DURABLE missions live in `workflow-worker`; Temporal remains NOT_WIRED)

Not production-activated. No blanket `--dangerously-skip-permissions`. External effects: none.
