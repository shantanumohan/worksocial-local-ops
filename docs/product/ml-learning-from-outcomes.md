# Multi-model learning from outcomes (owner requirement)

In-repo pointer for the owner requirement. Full project-store text may be richer; this file keeps the engineering constraint visible in the monorepo.

## Requirement (summary)

- Local multi-model learning from **verified successes and failures**, not model self-report.
- Multiple open-source ML models; train/infer on the owner’s local host.
- Labels come from durable evidence (gateway receipts, journey verification, owner decisions, stop-switch, etc.).
- ML must not silently expand authority (spend, privacy, CRM write, publishing).

## R1-03 scope

Production mapping stores labeled write-path outcomes (`core.write_path_outcomes` / `writePathOutcomes`) and exposes `listWritePathOutcomesForLearning`.

## R1-04 scope

Role runtime stores labeled role-run outcomes (`measure.role_run_outcomes` / file-backed `role-runtime.json` outcomes) via `createRoleRunOutcome` / `listRoleOutcomesForLearning`.

**Not in R1-03/R1-04:** ML frameworks, `services/learning-worker`, training jobs, or authority expansion from scores.
