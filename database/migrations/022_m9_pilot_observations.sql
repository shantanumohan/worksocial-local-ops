-- M9 Codex follow-up: server-recorded pilot soak observations.
-- Duration for pilotGate=MET must come from these rows (or the file-backed
-- soak-state.json pilotObservations list) — never from client claim dates.
-- Companion to file-backed soak store until Postgres cutover.

CREATE TABLE IF NOT EXISTS journey.soak_pilot_observations (
  observation_id   bigserial PRIMARY KEY,
  kind             text NOT NULL
    CHECK (kind IN ('start', 'heartbeat', 'end')),
  recorded_at      timestamptz NOT NULL,
  -- Host/server clock only; request-body startedAtIso/endedAtIso are rejected.
  source           text NOT NULL DEFAULT 'server_clock'
    CHECK (source = 'server_clock'),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS soak_pilot_observations_recorded_idx
  ON journey.soak_pilot_observations (recorded_at);

COMMENT ON TABLE journey.soak_pilot_observations IS
  'Server-recorded start/heartbeat/end for 72h pilot gate. Client duration claims rejected.';
