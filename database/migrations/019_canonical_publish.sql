-- M6 / NEXT-17: canonical publish — claim/source QA, A25 review bindings,
-- multi-destination distribution runs with partial-failure recovery.
-- File-backed content store remains authoritative until Postgres cutover.
-- External effects: none (fixture/simulator). Temporal may remain NOT_WIRED.

CREATE TABLE IF NOT EXISTS growth.content_claim_records (
  claim_id        text PRIMARY KEY,
  article_id      text NOT NULL,
  fact_id         text NOT NULL,
  source_ref      text NOT NULL,
  statement       text NOT NULL,
  created_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS content_claim_article_idx
  ON growth.content_claim_records (article_id);

CREATE TABLE IF NOT EXISTS growth.content_review_bindings (
  binding_id               text PRIMARY KEY,
  article_id               text NOT NULL,
  proposal_id              text NOT NULL,
  proposal_revision        text NOT NULL,
  proposal_checksum        text NOT NULL,
  evidence_package_digest  text NOT NULL,
  author_role_id           text NOT NULL,
  reviewer_role_id         text NOT NULL DEFAULT 'A25',
  status                   text NOT NULL,
  binding_json             jsonb NOT NULL,
  created_at               timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS content_review_bindings_article_idx
  ON growth.content_review_bindings (article_id);

CREATE TABLE IF NOT EXISTS growth.content_distribution_runs (
  run_id                     text PRIMARY KEY,
  campaign_id                text NOT NULL,
  article_id                 text NOT NULL,
  status                     text NOT NULL,
  destination_ids_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_idempotency_key   text NOT NULL,
  fixture_only               boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL,
  updated_at                 timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS content_distribution_biz_key_idx
  ON growth.content_distribution_runs (business_idempotency_key);

CREATE INDEX IF NOT EXISTS content_distribution_article_idx
  ON growth.content_distribution_runs (article_id);
