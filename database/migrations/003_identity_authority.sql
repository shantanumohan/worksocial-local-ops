-- R1-02 identity and authority: users, sessions, standing policies, grants, decisions, stop switch
-- Not production-activated. Schema only; file-backed authority store is used until Postgres is bound.

CREATE TABLE IF NOT EXISTS core.local_users (
  user_id            text PRIMARY KEY,
  username           text NOT NULL UNIQUE,
  role               text NOT NULL
    CHECK (role IN ('administrator', 'operator')),
  password_verifier  text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  disabled           boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS core.local_sessions (
  session_id         text PRIMARY KEY,
  user_id            text NOT NULL REFERENCES core.local_users (user_id),
  csrf_token         text NOT NULL,
  origin             text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.standing_policies (
  policy_id          text PRIMARY KEY,
  version            integer NOT NULL DEFAULT 1,
  actor_role         text NOT NULL,
  channel_id         text NOT NULL,
  action_class       text NOT NULL
    CHECK (action_class IN (
      'observe',
      'create',
      'routine_publish',
      'routine_customer_service',
      'bounded_repair',
      'material_change',
      'access_or_policy_change'
    )),
  allowed_asset_scope text[] NOT NULL,
  enabled            boolean NOT NULL DEFAULT false,
  emergency_stop_applies boolean NOT NULL DEFAULT true,
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.capability_grants (
  grant_id           text PRIMARY KEY,
  policy_id          text NOT NULL REFERENCES core.standing_policies (policy_id),
  target_account_id  text NOT NULL,
  allowed_operations text[] NOT NULL,
  allowed_asset_scope text[] NOT NULL,
  content_revision_bound text,
  rate_limit_per_hour integer,
  expires_at         timestamptz,
  revoked            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.policy_decisions (
  decision_id        text PRIMARY KEY,
  operation_id       text NOT NULL,
  payload_digest     text NOT NULL,
  allowed            boolean NOT NULL,
  code               text,
  reason             text NOT NULL,
  grant_id           text,
  policy_id          text,
  decided_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.owner_controls (
  control_key        text PRIMARY KEY,
  outbound_stopped   boolean NOT NULL DEFAULT false,
  operating_mode     text NOT NULL DEFAULT 'observe'
    CHECK (operating_mode IN ('observe', 'operate', 'maintenance')),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id text REFERENCES core.local_users (user_id)
);

CREATE TABLE IF NOT EXISTS core.authority_audit_events (
  event_id           text PRIMARY KEY,
  actor_user_id      text,
  event_type         text NOT NULL,
  detail             text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.standing_policies IS
  'Owner-enabled standing authority by channel and action class; agents cannot self-approve access changes.';
COMMENT ON TABLE core.capability_grants IS
  'Revision-bound scoped grants enforced by the action gateway before every external effect.';
COMMENT ON TABLE core.owner_controls IS
  'Stop switch and operating mode; gateway checks outbound_stopped before every external effect.';
