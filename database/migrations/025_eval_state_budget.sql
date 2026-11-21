-- AA-21 / PgEvaluationStore cutover companion.
-- journey.eval_* entity tables live in 020; this adds singleton budget/meta
-- so Postgres-backed evaluation can restart without file state.
-- Live Claude/Gemini fleet and ChatGPT Ads remain NOT_WIRED (enforced in app).

CREATE TABLE IF NOT EXISTS journey.eval_state (
  singleton_id text PRIMARY KEY
    CHECK (singleton_id = 'default'),
  budget_json  jsonb NOT NULL,
  updated_at   timestamptz NOT NULL
);

INSERT INTO journey.eval_state (singleton_id, budget_json, updated_at)
VALUES (
  'default',
  jsonb_build_object(
    'dayKey', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    'currency', 'USD',
    'limitMinor', 5000,
    'reservedMinor', 0,
    'settledMinor', 0,
    'openReservations', '{}'::jsonb,
    'settledReservations', '{}'::jsonb
  ),
  now()
)
ON CONFLICT (singleton_id) DO NOTHING;
