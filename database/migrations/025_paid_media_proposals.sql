-- AA-19 / WP13–14 paid-media proposals + analysis decision support.
-- Schema companion for file-backed paid-media store. Fixture-only;
-- ChatGPT Ads ACCESS_BLOCKED; live mutations NOT_WIRED.

CREATE TABLE IF NOT EXISTS paid_media_analysis_definitions (
  definition_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  period_start_iso TIMESTAMPTZ NOT NULL,
  period_end_iso TIMESTAMPTZ NOT NULL,
  comparison_label TEXT NOT NULL,
  reporting_timezone TEXT NOT NULL,
  environment TEXT NOT NULL,
  created_at_iso TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paid_media_hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES paid_media_analysis_definitions(definition_id),
  statement TEXT NOT NULL,
  primary_outcome TEXT NOT NULL,
  baseline TEXT NOT NULL,
  comparison TEXT NOT NULL,
  observation_window_days INTEGER NOT NULL CHECK (observation_window_days >= 1),
  environment TEXT NOT NULL,
  created_at_iso TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paid_media_decision_briefs (
  brief_id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  hypothesis_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_caveats JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  redacted BOOLEAN NOT NULL DEFAULT TRUE,
  environment TEXT NOT NULL,
  created_at_iso TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paid_media_proposals (
  proposal_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('google_ads', 'chatgpt_ads')),
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  change_kind TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  exact_change TEXT NOT NULL,
  risk TEXT NOT NULL,
  alternative TEXT NOT NULL,
  diagnosis JSONB NOT NULL,
  financial_diff JSONB NOT NULL,
  status TEXT NOT NULL,
  environment TEXT NOT NULL,
  wiring TEXT NOT NULL,
  created_at_iso TIMESTAMPTZ NOT NULL,
  updated_at_iso TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS paid_media_decisions (
  decision_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES paid_media_proposals(proposal_id),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'decline')),
  actor_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  recorded_at_iso TIMESTAMPTZ NOT NULL,
  mutation_attempted BOOLEAN NOT NULL DEFAULT FALSE,
  external_effects TEXT NOT NULL DEFAULT 'NONE'
);
