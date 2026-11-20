-- M2 / NEXT-08–09 durable local execution (first slice)
-- Jobs, effect intents/attempts, gateway decisions, receipts, budget
-- reservations, outbox, and independent fake-provider ledger.
-- External effects: none (simulator only). ACCEPTED ≠ VERIFIED.

CREATE TABLE IF NOT EXISTS core.schema_migrations (
  filename          text PRIMARY KEY,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  checksum          text NOT NULL
);

CREATE TABLE IF NOT EXISTS core.jobs (
  job_id              text PRIMARY KEY,
  role_id             text NOT NULL,
  workflow_id         text NOT NULL,
  site_id             text NOT NULL,
  asset_id            text NOT NULL,
  trigger             text NOT NULL,
  policy_version      text NOT NULL,
  input_artifact_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  capability_grant_id text NOT NULL,
  source_revision     text NOT NULL,
  max_attempts        integer NOT NULL DEFAULT 2,
  deadline_seconds    integer NOT NULL,
  idempotency_key     text NOT NULL,
  expected_outcome    text NOT NULL,
  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'leased', 'running', 'succeeded', 'failed', 'cancelled'
    )),
  lease_holder        text,
  lease_expires_at    timestamptz,
  attempt_count       integer NOT NULL DEFAULT 0,
  envelope_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON core.jobs (status);
CREATE INDEX IF NOT EXISTS jobs_workflow_idx ON core.jobs (workflow_id);

CREATE TABLE IF NOT EXISTS core.effect_intents (
  operation_id        text PRIMARY KEY,
  job_id              text REFERENCES core.jobs (job_id),
  payload_digest      text NOT NULL,
  outcome             text NOT NULL DEFAULT 'INTENDED'
    CHECK (outcome IN (
      'INTENDED',
      'ACCEPTED_PENDING',
      'VERIFIED',
      'FAILED',
      'UNKNOWN_REMOTE_OUTCOME',
      'RECONCILED_SKIPPED'
    )),
  effect_state        text NOT NULL DEFAULT 'QUEUED',
  business_idempotency_key text,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS effect_intents_business_idem_uidx
  ON core.effect_intents (business_idempotency_key)
  WHERE business_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS core.effect_attempts (
  attempt_id          text PRIMARY KEY,
  operation_id        text NOT NULL REFERENCES core.effect_intents (operation_id),
  attempt_number      integer NOT NULL,
  phase               text NOT NULL
    CHECK (phase IN (
      'record', 'authorize', 'apply', 'ack', 'verify', 'reconcile'
    )),
  status              text NOT NULL
    CHECK (status IN ('started', 'succeeded', 'failed', 'skipped')),
  detail              text NOT NULL DEFAULT '',
  provider_receipt_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, attempt_number, phase)
);

CREATE INDEX IF NOT EXISTS effect_attempts_operation_idx
  ON core.effect_attempts (operation_id);

CREATE TABLE IF NOT EXISTS core.gateway_decisions (
  operation_id        text PRIMARY KEY,
  decision_id         text NOT NULL UNIQUE,
  payload_digest      text NOT NULL,
  allowed             boolean NOT NULL,
  code                text,
  reason              text NOT NULL,
  grant_id            text,
  policy_id           text,
  decided_at          timestamptz NOT NULL,
  effect_state        text NOT NULL,
  outcome             text NOT NULL
    CHECK (outcome IN (
      'DENIED', 'INTENDED', 'ACCEPTED_PENDING', 'VERIFIED', 'FAILED'
    )),
  write_path_id       text,
  gate_details_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.execution_receipts (
  receipt_id          text PRIMARY KEY,
  operation_id        text NOT NULL REFERENCES core.effect_intents (operation_id),
  kind                text NOT NULL
    CHECK (kind IN (
      'provider_ack',
      'independent_read',
      'verification',
      'reconcile'
    )),
  observed_digest     text,
  observed_payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  verdict             text NOT NULL
    CHECK (verdict IN (
      'ACCEPTED_PENDING', 'MATCH', 'MISMATCH', 'UNKNOWN', 'SKIPPED'
    )),
  detail              text NOT NULL DEFAULT '',
  recorded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS execution_receipts_operation_idx
  ON core.execution_receipts (operation_id);

CREATE TABLE IF NOT EXISTS measure.budget_accounts (
  account_id          text PRIMARY KEY,
  day_key             text NOT NULL,
  currency            text NOT NULL DEFAULT 'USD',
  limit_minor         bigint NOT NULL,
  reserved_minor      bigint NOT NULL DEFAULT 0,
  settled_minor       bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_key, currency)
);

CREATE TABLE IF NOT EXISTS measure.budget_reservations (
  reservation_id      text PRIMARY KEY,
  account_id          text NOT NULL REFERENCES measure.budget_accounts (account_id),
  amount_minor        bigint NOT NULL CHECK (amount_minor > 0),
  status              text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'settled', 'released')),
  actual_minor        bigint,
  job_id              text REFERENCES core.jobs (job_id),
  operation_id        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  settled_at          timestamptz
);

CREATE INDEX IF NOT EXISTS budget_reservations_account_idx
  ON measure.budget_reservations (account_id, status);

CREATE TABLE IF NOT EXISTS core.outbox_events (
  outbox_id           text PRIMARY KEY,
  aggregate_type      text NOT NULL,
  aggregate_id        text NOT NULL,
  event_type          text NOT NULL,
  payload_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz
);

CREATE INDEX IF NOT EXISTS outbox_events_unpublished_idx
  ON core.outbox_events (created_at)
  WHERE published_at IS NULL;

-- Independent fake-provider store: applies are recorded once per business key.
-- Gateway ack ≠ verified; read-back uses this ledger without a second apply.
CREATE TABLE IF NOT EXISTS core.fake_provider_effects (
  provider_effect_id  text PRIMARY KEY,
  business_idempotency_key text NOT NULL UNIQUE,
  operation_id        text NOT NULL,
  payload_digest      text NOT NULL,
  apply_count         integer NOT NULL DEFAULT 1 CHECK (apply_count >= 1),
  remote_ref          text NOT NULL,
  applied_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fake_provider_effects_operation_idx
  ON core.fake_provider_effects (operation_id);

COMMENT ON TABLE core.jobs IS
  'Durable mission jobs with unique business idempotency keys (M2 first slice).';
COMMENT ON TABLE core.effect_intents IS
  'Durable effect intents; ACCEPTED_PENDING survives process restart.';
COMMENT ON TABLE core.effect_attempts IS
  'Per-phase attempt ledger; apply phase must not duplicate after restart.';
COMMENT ON TABLE core.fake_provider_effects IS
  'Independent simulator provider; uniqueness on business_idempotency_key prevents duplicate remote effects.';
COMMENT ON TABLE measure.budget_reservations IS
  'Transactional budget reservations; race-safe against concurrent exhaustion.';
