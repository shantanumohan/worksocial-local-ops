-- Singleton meta for credential-rotation / recovery PG cutover (AA-48 gap).
-- Entity tables live in 024_recovery_evidence.sql and 026_credential_rotation.sql.
-- Live provider revoke stays NOT_WIRED; live recovery stays NOT_RUN; external effects NONE.

CREATE TABLE IF NOT EXISTS credential_rotation_state (
  singleton_id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO credential_rotation_state (singleton_id, updated_at)
VALUES ('default', now())
ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS recovery_evidence_state (
  singleton_id TEXT PRIMARY KEY,
  live_recovery_claim TEXT NOT NULL DEFAULT 'NOT_RUN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO recovery_evidence_state (singleton_id, live_recovery_claim, updated_at)
VALUES ('default', 'NOT_RUN', now())
ON CONFLICT (singleton_id) DO NOTHING;
