-- M5 / NEXT-16: lead capture journeys + synthetic cleanup ledger.
-- File-backed store is authoritative until Postgres cutover.
-- No live Zoho mutations. Temporal may remain NOT_WIRED.

CREATE TABLE IF NOT EXISTS journey.lead_capture_journeys (
  journey_id              text PRIMARY KEY,
  correlation_id          text NOT NULL,
  status                  text NOT NULL,
  stages_completed_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_success_at         timestamptz,
  current_failure_json    jsonb,
  submission_json         jsonb,
  crm_receipt_json        jsonb,
  artifact_refs_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  repair_link_json        jsonb,
  cleanup_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  durable_operation_id    text,
  probe_run_id            text,
  gateway_decision_id     text,
  field_verify_passed     boolean,
  commercial_excluded     boolean NOT NULL DEFAULT true,
  fixture_only            boolean NOT NULL DEFAULT true,
  playwright_mode         text NOT NULL DEFAULT 'FIXTURE',
  created_at              timestamptz NOT NULL,
  updated_at              timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS lead_capture_journeys_corr_idx
  ON journey.lead_capture_journeys (correlation_id);

CREATE TABLE IF NOT EXISTS core.canary_cleanup_events (
  cleanup_id       text PRIMARY KEY,
  correlation_id   text NOT NULL,
  receipt_id       text NOT NULL,
  record_id        text,
  cleaned_at       timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS canary_cleanup_corr_idx
  ON core.canary_cleanup_events (correlation_id);

CREATE TABLE IF NOT EXISTS core.commerce_lead_projection (
  record_id             text PRIMARY KEY,
  synthetic             boolean NOT NULL,
  revenue_minor         bigint NOT NULL DEFAULT 0,
  counted_in_commerce   boolean NOT NULL DEFAULT false,
  CHECK (NOT (synthetic AND counted_in_commerce))
);
