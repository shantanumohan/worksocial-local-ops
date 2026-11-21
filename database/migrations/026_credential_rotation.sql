-- WP10 / F24 credential rotation + offboarding (schema companion for file-backed store).
-- Fixture-only local revoke/rotate; live provider revocation remains NOT_WIRED.

CREATE TABLE IF NOT EXISTS credential_connections (
  connection_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'ROTATED_AWAY')),
  connection_state TEXT NOT NULL,
  write_readiness TEXT NOT NULL,
  verification_state TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at_iso TIMESTAMPTZ NOT NULL,
  revoked_at_iso TIMESTAMPTZ,
  rotated_to_reference_id TEXT,
  approved_by TEXT
);

CREATE TABLE IF NOT EXISTS credential_queued_work (
  work_id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES credential_connections(connection_id),
  capability_id TEXT NOT NULL,
  operation_id TEXT,
  effect_state TEXT NOT NULL,
  queued_at_iso TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credential_audit_entries (
  entry_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  connection_id TEXT,
  reference_id TEXT,
  summary TEXT NOT NULL,
  redacted BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_at_iso TIMESTAMPTZ NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS credential_rotations (
  rotation_id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  old_reference_id TEXT NOT NULL,
  new_reference_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  local_switch_complete BOOLEAN NOT NULL DEFAULT TRUE,
  live_provider_revoke TEXT NOT NULL DEFAULT 'NOT_WIRED',
  secrets_exported BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_iso TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credential_offboarding_manifests (
  manifest_id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  revoked_locally BOOLEAN NOT NULL DEFAULT TRUE,
  schedules_disabled BOOLEAN NOT NULL DEFAULT TRUE,
  queued_cancelled_count INTEGER NOT NULL DEFAULT 0,
  queued_retained_post_apply_count INTEGER NOT NULL DEFAULT 0,
  audit_retained BOOLEAN NOT NULL DEFAULT TRUE,
  residual_obligations JSONB NOT NULL DEFAULT '[]'::jsonb,
  live_provider_revoke TEXT NOT NULL DEFAULT 'NOT_WIRED',
  external_effects TEXT NOT NULL DEFAULT 'NONE',
  production_activated BOOLEAN NOT NULL DEFAULT FALSE,
  catalog_claim TEXT NOT NULL DEFAULT 'NOT_RUN',
  created_at_iso TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL
);
