-- R1-01 local execution: hosts, storage_roots, service_heartbeats
-- Not production-activated. Schema only; file-backed supervisor state is used until Postgres is bound.

CREATE TABLE IF NOT EXISTS core.hosts (
  host_id           text PRIMARY KEY,
  display_name      text,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz,
  unattended_enabled boolean NOT NULL DEFAULT false,
  notes             text
);

CREATE TABLE IF NOT EXISTS core.host_leases (
  lease_id          text PRIMARY KEY,
  host_id           text NOT NULL REFERENCES core.hosts (host_id),
  holder_pid        integer NOT NULL,
  acquired_at       timestamptz NOT NULL,
  renewed_at        timestamptz NOT NULL,
  expires_at        timestamptz NOT NULL,
  scope             text NOT NULL DEFAULT 'local-singleton'
    CHECK (scope = 'local-singleton')
);

-- At most one non-expired local-singleton lease is enforced in application logic;
-- a partial unique index alone cannot express "expires_at > now()" portably.

CREATE TABLE IF NOT EXISTS core.storage_roots (
  id                text PRIMARY KEY,
  kind              text NOT NULL
    CHECK (kind IN (
      'source',
      'working',
      'content',
      'reports',
      'encrypted_backup',
      'database',
      'temporal',
      'secrets'
    )),
  path              text NOT NULL,
  sync_path         boolean NOT NULL DEFAULT false,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  notes             text,
  UNIQUE (kind)
);

CREATE TABLE IF NOT EXISTS core.service_heartbeats (
  service_id        text NOT NULL
    CHECK (service_id IN ('api', 'console', 'temporal-worker')),
  host_id           text NOT NULL REFERENCES core.hosts (host_id),
  status            text NOT NULL,
  wiring_status     text NOT NULL,
  pid               integer,
  last_heartbeat_at timestamptz,
  detail            text NOT NULL DEFAULT '',
  production_activated boolean NOT NULL DEFAULT false
    CHECK (production_activated = false),
  PRIMARY KEY (service_id, host_id)
);

COMMENT ON TABLE core.storage_roots IS
  'Owner-selected roots. Durable kinds (database/temporal/secrets) must not be under consumer sync folders.';
COMMENT ON TABLE core.host_leases IS
  'Singleton local supervisor lease; VS Code close must not invent a second scheduler.';
