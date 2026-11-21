-- M8 / NEXT-19 grounded search, analytics honesty, isolated EVAL_ONLY worker.
-- Evaluation entities used by createPgEvaluationStore (AA-21); budget/meta in 025.
-- Live GSC/GA4/eval fleet/ChatGPT Ads remain NOT_WIRED. Temporal may stay NOT_WIRED.

-- Search judgments + remediations (companion to file-backed SeoState).
CREATE TABLE IF NOT EXISTS journey.search_judgments (
  judgment_id   text PRIMARY KEY,
  query_id      text NOT NULL,
  label         text NOT NULL
    CHECK (label IN ('relevant', 'wrong', 'no_match')),
  note          text NOT NULL DEFAULT '',
  fixture_only  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS search_judgments_query_idx
  ON journey.search_judgments (query_id);

CREATE TABLE IF NOT EXISTS journey.search_remediations (
  task_id       text PRIMARY KEY,
  query_id      text NOT NULL,
  judgment_id   text NOT NULL REFERENCES journey.search_judgments (judgment_id),
  summary       text NOT NULL,
  status        text NOT NULL
    CHECK (status IN ('open', 'done')),
  fixture_only  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS search_remediations_query_idx
  ON journey.search_remediations (query_id);

-- Isolated evaluation connections / suites / runs.
CREATE TABLE IF NOT EXISTS journey.eval_connections (
  connection_id text PRIMARY KEY,
  provider      text NOT NULL
    CHECK (provider IN ('claude', 'gemini')),
  capability    text NOT NULL
    CHECK (capability IN ('EVAL_ONLY', 'NOT_CONFIGURED')),
  display_name  text NOT NULL,
  fixture_only  boolean NOT NULL DEFAULT true,
  operational_fallback boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS journey.eval_suites (
  suite_id      text PRIMARY KEY,
  title         text NOT NULL,
  cases         jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS journey.eval_runs (
  run_id            text PRIMARY KEY,
  suite_id          text NOT NULL REFERENCES journey.eval_suites (suite_id),
  provider          text NOT NULL
    CHECK (provider IN ('claude', 'gemini')),
  capability        text NOT NULL
    CHECK (capability = 'EVAL_ONLY'),
  status            text NOT NULL
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'budget_exhausted', 'blocked_tool')),
  reservation_id    text,
  reserved_minor    integer NOT NULL DEFAULT 0,
  settled_minor     integer NOT NULL DEFAULT 0,
  results           jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only      boolean NOT NULL DEFAULT true,
  chatgpt_ads_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL,
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS eval_runs_suite_idx
  ON journey.eval_runs (suite_id);

-- Analytics observation ledger (fixture / unavailable / not-wired provenance).
CREATE TABLE IF NOT EXISTS journey.analytics_observations (
  observation_id    text PRIMARY KEY,
  source            text NOT NULL
    CHECK (source IN ('gsc', 'ga4')),
  environment       text NOT NULL
    CHECK (environment IN ('FIXTURE', 'SANDBOX', 'LIVE', 'NOT_WIRED', 'UNAVAILABLE')),
  rows              jsonb NOT NULL DEFAULT '[]'::jsonb,
  live_wiring       text NOT NULL
    CHECK (live_wiring IN ('NOT_WIRED', 'FIXTURE')),
  note              text NOT NULL,
  captured_at       timestamptz NOT NULL
);
