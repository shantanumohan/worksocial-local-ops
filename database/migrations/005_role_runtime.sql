-- R1-04 thirty-role Claude runtime: role status, run evidence, outcome hooks.
-- Not production-activated. Schema only; file-backed role-runtime store is used until Postgres is bound.
-- No live Claude fleet or Temporal cluster is implied by this migration.

CREATE TABLE IF NOT EXISTS core.agent_roles (
  role_id              text PRIMARY KEY
    CHECK (role_id ~ '^A(0[1-9]|[12][0-9]|30)$'),
  version              text NOT NULL,
  name                 text NOT NULL,
  role_group           text NOT NULL,
  evaluation_suite_id  text NOT NULL,
  contract_json        jsonb NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.role_runs (
  run_id                 text PRIMARY KEY,
  job_id                 text NOT NULL,
  role_id                text NOT NULL REFERENCES core.agent_roles (role_id),
  workflow_id            text NOT NULL,
  status                 text NOT NULL,
  execution_mode         text NOT NULL
    CHECK (execution_mode IN ('live_cli', 'fixture')),
  summary                text NOT NULL,
  artifact_ids_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  cli_version            text,
  model_id               text,
  permission_bypass_used boolean NOT NULL DEFAULT false
    CHECK (permission_bypass_used = false),
  started_at             timestamptz NOT NULL,
  finished_at            timestamptz NOT NULL,
  cost_minor             integer NOT NULL DEFAULT 0,
  budget_reservation_id  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_runs_role_finished_idx
  ON core.role_runs (role_id, finished_at DESC);

CREATE TABLE IF NOT EXISTS measure.role_run_outcomes (
  outcome_id         text PRIMARY KEY,
  role_id            text NOT NULL REFERENCES core.agent_roles (role_id),
  job_id             text NOT NULL,
  run_id             text NOT NULL REFERENCES core.role_runs (run_id),
  label              text NOT NULL
    CHECK (label IN ('SUCCESS', 'FAILURE')),
  status             text NOT NULL,
  execution_mode     text NOT NULL,
  reason             text NOT NULL,
  artifact_ids_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_minor         integer NOT NULL DEFAULT 0,
  feature_hints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        timestamptz NOT NULL,
  -- Learning-worker hook only; no ML training in R1-04.
  learning_exported  boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS role_run_outcomes_label_idx
  ON measure.role_run_outcomes (label, recorded_at DESC);
