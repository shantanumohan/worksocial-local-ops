-- T-X029 explicit different-account rebind (schema companion for file-backed store).
-- Fixture-only local rebind; live provider revocation remains NOT_WIRED.

CREATE TABLE IF NOT EXISTS credential_rebinds (
  rebind_id TEXT PRIMARY KEY,
  old_connection_id TEXT NOT NULL,
  new_connection_id TEXT NOT NULL,
  old_account_label TEXT NOT NULL,
  new_account_label TEXT NOT NULL,
  old_reference_id TEXT NOT NULL,
  new_reference_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  explicit_rebind BOOLEAN NOT NULL DEFAULT TRUE,
  silent_refresh_rejected BOOLEAN NOT NULL DEFAULT TRUE,
  local_switch_complete BOOLEAN NOT NULL DEFAULT TRUE,
  live_provider_revoke TEXT NOT NULL DEFAULT 'NOT_WIRED',
  secrets_exported BOOLEAN NOT NULL DEFAULT FALSE,
  catalog_case_id TEXT NOT NULL DEFAULT 'T-X029',
  external_effects TEXT NOT NULL DEFAULT 'NONE',
  created_at_iso TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL
);
