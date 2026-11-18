-- Local multi-model learning from verified outcomes.
-- Not production-activated. Schema companion to file-backed learning-state store.
-- Proposals only — no grants/spend/CRM/publish authority expansion.

CREATE TABLE IF NOT EXISTS measure.learning_models (
  model_id                      text PRIMARY KEY,
  display_name                  text NOT NULL,
  family                        text NOT NULL
    CHECK (family IN ('classifier', 'ranker', 'risk')),
  algorithm                     text NOT NULL,
  version                       text NOT NULL,
  license                       text NOT NULL,
  source_url                    text NOT NULL,
  requires_downloaded_weights   boolean NOT NULL DEFAULT false
    CHECK (requires_downloaded_weights = false),
  default_runtime_mode          text NOT NULL
    CHECK (default_runtime_mode IN ('offline_fixture', 'local_trained')),
  notes                         text NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS measure.learning_training_runs (
  run_id                 text PRIMARY KEY,
  started_at             timestamptz NOT NULL,
  finished_at            timestamptz NOT NULL,
  runtime_mode           text NOT NULL
    CHECK (runtime_mode IN ('offline_fixture', 'local_trained')),
  sample_count           integer NOT NULL DEFAULT 0,
  held_out_count         integer NOT NULL DEFAULT 0,
  accuracy               double precision,
  success_rate           double precision,
  mean_score             double precision,
  fixture_excluded_count integer NOT NULL DEFAULT 0,
  model_ids_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
  weights_json           jsonb NOT NULL DEFAULT '[]'::jsonb,
  note                   text NOT NULL,
  -- Isolation invariant: learning-worker never holds gateway write / effect creds.
  principal              text NOT NULL DEFAULT 'learning-worker'
    CHECK (principal = 'learning-worker'),
  has_action_gateway_write_principal boolean NOT NULL DEFAULT false
    CHECK (has_action_gateway_write_principal = false),
  has_production_effect_credentials boolean NOT NULL DEFAULT false
    CHECK (has_production_effect_credentials = false)
);

CREATE TABLE IF NOT EXISTS measure.learning_proposals (
  proposal_id            text PRIMARY KEY,
  artifact_version       text NOT NULL UNIQUE,
  kind                   text NOT NULL
    CHECK (kind IN ('playbook', 'ranking', 'risk')),
  status                 text NOT NULL
    CHECK (status IN ('awaiting_review', 'accepted', 'rejected')),
  training_run_id        text NOT NULL REFERENCES measure.learning_training_runs (run_id),
  model_ids_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary                text NOT NULL,
  metrics_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  expands_grants         boolean NOT NULL DEFAULT false
    CHECK (expands_grants = false),
  expands_spend          boolean NOT NULL DEFAULT false
    CHECK (expands_spend = false),
  expands_crm_write      boolean NOT NULL DEFAULT false
    CHECK (expands_crm_write = false),
  expands_publish        boolean NOT NULL DEFAULT false
    CHECK (expands_publish = false),
  created_at             timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_proposals_status_idx
  ON measure.learning_proposals (status, created_at DESC);

COMMENT ON TABLE measure.learning_proposals IS
  'Versioned ML playbook/ranking/risk proposals under review; cannot expand authority.';
