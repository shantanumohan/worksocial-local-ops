-- R1-05 monitoring: HTTP/DOM probes, form-to-CRM canaries, reconciliation evidence.
-- Not production-activated. Schema only; file-backed probe store is used until Postgres is bound.
-- Live Zoho remains NOT_WIRED without owner credentials.

CREATE TABLE IF NOT EXISTS core.probe_runs (
  run_id               text PRIMARY KEY,
  kind                 text NOT NULL
    CHECK (kind IN (
      'http',
      'dom_journey',
      'form_presence',
      'form_to_crm_canary',
      'integration_health'
    )),
  mode                 text NOT NULL
    CHECK (mode IN ('fixture', 'live')),
  target_id            text NOT NULL,
  verdict              text NOT NULL
    CHECK (verdict IN ('SUCCESS', 'FAILURE', 'UNKNOWN', 'NOT_WIRED')),
  started_at           timestamptz NOT NULL,
  finished_at          timestamptz NOT NULL,
  evidence_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciliation_json  jsonb,
  outcome_id           text,
  write_path_id        text,
  operation_id         text,
  gateway_decision_id  text,
  acceptance_case_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS probe_runs_kind_finished_idx
  ON core.probe_runs (kind, finished_at DESC);

CREATE TABLE IF NOT EXISTS core.canary_receipts (
  receipt_id           text PRIMARY KEY,
  correlation_id       text NOT NULL,
  module_id            text NOT NULL,
  record_id            text,
  synthetic            boolean NOT NULL DEFAULT true,
  source               text NOT NULL
    CHECK (source IN ('fixture_crm', 'live_zoho')),
  field_snapshot_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at          timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canary_receipts_correlation_idx
  ON core.canary_receipts (correlation_id);

CREATE TABLE IF NOT EXISTS core.monitoring_meta (
  meta_key             text PRIMARY KEY,
  meta_value           text NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO core.monitoring_meta (meta_key, meta_value)
VALUES
  ('live_zoho_wiring', 'NOT_WIRED'),
  ('playwright_wiring', 'FIXTURE')
ON CONFLICT (meta_key) DO NOTHING;
