-- M2 / NEXT-10 durable mission workflows (local durable runtime).
-- Temporal self-host remains NOT_WIRED until TEMPORAL_ADDRESS binds a cluster.
-- This table provides enqueue-before-ack, leases, retry categories, and review wait
-- with crash/restart at effect boundaries via Postgres (simulator effects only).

CREATE TABLE IF NOT EXISTS core.mission_workflows (
  workflow_id           text PRIMARY KEY,
  job_id                text NOT NULL REFERENCES core.jobs (job_id),
  operation_id          text,
  phase                 text NOT NULL DEFAULT 'enqueued'
    CHECK (phase IN (
      'enqueued',
      'leased',
      'effect_pending',
      'review_wait',
      'succeeded',
      'failed',
      'cancelled'
    )),
  retry_category        text
    CHECK (retry_category IS NULL OR retry_category IN (
      'transient',
      'policy',
      'unknown_remote',
      'fatal',
      'none'
    )),
  attempt_count         integer NOT NULL DEFAULT 0,
  lease_holder          text,
  lease_expires_at      timestamptz,
  review_required       boolean NOT NULL DEFAULT false,
  review_token          text,
  last_error            text,
  temporal_wiring       text NOT NULL DEFAULT 'NOT_WIRED'
    CHECK (temporal_wiring IN ('NOT_WIRED', 'LOCAL_DURABLE', 'FIXTURE')),
  temporal_run_id       text,
  envelope_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_workflows_phase_idx
  ON core.mission_workflows (phase);

CREATE INDEX IF NOT EXISTS mission_workflows_lease_idx
  ON core.mission_workflows (lease_expires_at)
  WHERE phase IN ('leased', 'effect_pending', 'review_wait');

COMMENT ON TABLE core.mission_workflows IS
  'Local durable mission workflow state. Temporal cluster binding remains NOT_WIRED without TEMPORAL_ADDRESS.';
