-- R1-07 SEO and search: page audits, SEO change proposals, schema validation,
-- semantic search index stubs, and release outcome ledger.
-- Not production-activated. Schema only; file-backed seo store is used until Postgres is bound.
-- Live CMS publish remains NOT_WIRED without an owner-wired adapter.

CREATE TABLE IF NOT EXISTS growth.page_audits (
  page_audit_id   text PRIMARY KEY,
  page_asset_id   text NOT NULL,
  site_id         text NOT NULL,
  page_path       text NOT NULL,
  display_name    text NOT NULL,
  status          text NOT NULL
    CHECK (status IN ('healthy', 'needs_attention', 'blocked')),
  score           integer NOT NULL,
  findings_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS page_audits_page_asset_idx
  ON growth.page_audits (page_asset_id);

CREATE TABLE IF NOT EXISTS growth.seo_proposals (
  proposal_id            text PRIMARY KEY,
  page_asset_id          text NOT NULL,
  page_audit_id          text,
  change_kind            text NOT NULL
    CHECK (change_kind IN (
      'metadata', 'content', 'schema', 'internal_link', 'technical'
    )),
  title                  text NOT NULL,
  summary                text NOT NULL,
  proposed_fields_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  cited_fact_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  hypothesis_fact_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                 text NOT NULL
    CHECK (status IN (
      'draft',
      'ready_for_review',
      'approved',
      'rejected',
      'released_pending',
      'verified',
      'failed'
    )),
  fixture_only           boolean NOT NULL DEFAULT false,
  gateway_operation_id   text,
  write_path_id          text,
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS seo_proposals_status_idx
  ON growth.seo_proposals (status);

CREATE TABLE IF NOT EXISTS growth.schema_validations (
  validation_id               text PRIMARY KEY,
  page_asset_id               text NOT NULL,
  proposal_id                 text,
  nodes_json                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict                     text NOT NULL
    CHECK (verdict IN ('pass', 'fail', 'partial')),
  issues_json                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  agrees_with_visible_content boolean NOT NULL DEFAULT false,
  fixture_only                boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS growth.semantic_search_indexes (
  index_id        text PRIMARY KEY,
  version         integer NOT NULL,
  entries_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only    boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS growth.semantic_search_results (
  query_id          text PRIMARY KEY,
  raw_query         text NOT NULL,
  constraints_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  hits_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
  no_match_reason   text,
  index_version     integer NOT NULL,
  created_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS growth.seo_release_outcomes (
  outcome_id       text PRIMARY KEY,
  write_path_id    text NOT NULL,
  operation_id     text NOT NULL,
  label            text NOT NULL
    CHECK (label IN ('SUCCESS', 'FAILURE', 'UNKNOWN')),
  source           text NOT NULL,
  fixture_only     boolean NOT NULL DEFAULT false,
  summary          text NOT NULL,
  feature_hints    jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS seo_release_outcomes_fixture_idx
  ON growth.seo_release_outcomes (fixture_only);
