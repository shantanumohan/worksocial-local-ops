-- WP10 / F24 recovery evidence (schema companion for file-backed store).
-- Fixture-only paths; live recovery remains NOT_RUN / NOT_WIRED.

CREATE TABLE IF NOT EXISTS recovery_timeline_events (
  event_id TEXT PRIMARY KEY,
  recorded_at_iso TIMESTAMPTZ NOT NULL,
  plane TEXT NOT NULL CHECK (plane IN ('host', 'provider', 'none')),
  classification TEXT NOT NULL CHECK (
    classification IN (
      'STALE_OBSERVATION',
      'ACTIVE_INCIDENT',
      'UNKNOWN_REMOTE_OUTCOME'
    )
  ),
  summary TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  related_capability_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  queued_work_count INTEGER NOT NULL DEFAULT 0,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS recovery_queued_work (
  work_id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  operation_id TEXT,
  effect_state TEXT,
  queued_at_iso TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_capability_stops (
  stop_id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  plane TEXT NOT NULL CHECK (plane IN ('host', 'provider')),
  reason TEXT NOT NULL,
  stopped_at_iso TIMESTAMPTZ NOT NULL,
  unrelated_capabilities_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  resume_allowed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS recovery_runs (
  run_id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  status TEXT NOT NULL,
  classification TEXT NOT NULL,
  timeline_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  capability_stop_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  queued_work_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  artifact_id TEXT,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  live_recovery_verified BOOLEAN NOT NULL DEFAULT FALSE,
  live_recovery_claim TEXT NOT NULL DEFAULT 'NOT_RUN',
  external_effects TEXT NOT NULL DEFAULT 'NONE',
  production_activated BOOLEAN NOT NULL DEFAULT FALSE,
  started_at_iso TIMESTAMPTZ NOT NULL,
  ended_at_iso TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_artifacts (
  artifact_id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'fixture',
  redacted BOOLEAN NOT NULL DEFAULT TRUE,
  summary TEXT NOT NULL,
  classification TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  created_at_iso TIMESTAMPTZ NOT NULL
);
