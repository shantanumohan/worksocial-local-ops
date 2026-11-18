# Multi-model learning from outcomes (owner requirement)

In-repo pointer for the owner requirement. Full project-store text may be richer; this file keeps the engineering constraint visible in the monorepo.

## Requirement (summary)

- Local multi-model learning from **verified successes and failures**, not model self-report.
- Multiple open-source ML models; train/infer on the owner’s local host.
- Labels come from durable evidence (gateway receipts, journey verification, owner decisions, stop-switch, etc.).
- ML must not silently expand authority (spend, privacy, CRM write, publishing).

## Implemented slice

| Piece | Location |
|-------|----------|
| Model registry (≥2 OSS pins) | `packages/ml` — `outcome-nb-bernoulli@1.0.0`, `outcome-logreg-l2@1.0.0` (BSD-3-Clause sklearn-compatible) |
| Feature extraction | `packages/ml` — excludes `fixtureOnly` / fixture execution by default; rejects unverified model claims |
| Train / proposals | `services/learning-worker` + `packages/ml` — versioned playbook/ranking/risk **proposals under review** |
| Persistence | file-backed learning store + SQL `006_learning.sql` |
| Console / API | `/learning` + `/learning/status|models|runs|proposals|train` |
| Isolation | `learning-worker` principal; credential-broker denies mint/reveal; no action-gateway write principal |

## Honest limits

- Offline/fixture metrics ≠ production-canary-verified learning.
- No Hugging Face / ONNX weight download required (or claimed) in CI.
- Probe/CRM canary labels remain stubbed until R1-05.
- Proposals never auto-expand grants/spend/CRM/publish authority.

## Prior hooks (still consumed)

- R1-03: `writePathOutcomes` / `listWritePathOutcomesForLearning`
- R1-04: role-run outcomes / `listRoleOutcomesForLearning`
