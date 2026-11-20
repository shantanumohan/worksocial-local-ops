-- R1-08 Content and distribution: campaigns, canonical articles, destination
-- registry, variants, publication receipts, and release outcome ledger.
-- Not production-activated. Schema only; file-backed content store is used until Postgres is bound.
-- Live CMS / GBP / social publish remain NOT_WIRED without owner-wired adapters.

CREATE TABLE IF NOT EXISTS growth.content_destinations (
  destination_id         text PRIMARY KEY,
  kind                   text NOT NULL
    CHECK (kind IN (
      'cms', 'gbp', 'linkedin', 'facebook', 'instagram',
      'other_blog', 'directory', 'chatgpt_hub'
    )),
  display_name           text NOT NULL,
  channel_id             text NOT NULL,
  allowed_formats_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_body_chars         integer,
  requires_canonical_url boolean NOT NULL DEFAULT false,
  live_wiring            text NOT NULL
    CHECK (live_wiring IN ('NOT_WIRED', 'FIXTURE')),
  fixture_available      boolean NOT NULL DEFAULT true,
  location_relevant      boolean NOT NULL DEFAULT false,
  notes                  text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS growth.content_campaigns (
  campaign_id            text PRIMARY KEY,
  title                  text NOT NULL,
  topic                  text NOT NULL,
  brief_json             jsonb NOT NULL,
  status                 text NOT NULL
    CHECK (status IN (
      'brief', 'drafting', 'ready', 'distributing', 'complete', 'blocked'
    )),
  canonical_article_id   text,
  destination_ids_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only           boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS content_campaigns_status_idx
  ON growth.content_campaigns (status);

CREATE TABLE IF NOT EXISTS growth.canonical_articles (
  article_id               text PRIMARY KEY,
  campaign_id              text NOT NULL,
  title                    text NOT NULL,
  body                     text NOT NULL,
  content_digest           text NOT NULL,
  version                  integer NOT NULL DEFAULT 1,
  cited_fact_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
  hypothesis_fact_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                   text NOT NULL
    CHECK (status IN (
      'draft',
      'ready_for_review',
      'approved',
      'rejected',
      'released_pending',
      'verified',
      'failed'
    )),
  verified_canonical_url   text,
  fixture_only             boolean NOT NULL DEFAULT false,
  gateway_operation_id     text,
  write_path_id            text,
  created_at               timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS canonical_articles_campaign_idx
  ON growth.canonical_articles (campaign_id);

CREATE TABLE IF NOT EXISTS growth.destination_variants (
  variant_id               text PRIMARY KEY,
  campaign_id              text NOT NULL,
  article_id               text NOT NULL,
  destination_id           text NOT NULL,
  kind                     text NOT NULL,
  format                   text NOT NULL
    CHECK (format IN (
      'full_article', 'short_update', 'image_caption',
      'offer', 'profile_fact', 'event'
    )),
  title                    text NOT NULL,
  body                     text NOT NULL,
  article_content_digest   text NOT NULL,
  status                   text NOT NULL
    CHECK (status IN (
      'draft', 'ready', 'blocked', 'queued',
      'released_pending', 'verified', 'failed', 'skipped'
    )),
  fixture_only             boolean NOT NULL DEFAULT false,
  gateway_operation_id     text,
  write_path_id            text,
  remote_id                text,
  created_at               timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS destination_variants_campaign_idx
  ON growth.destination_variants (campaign_id);

CREATE TABLE IF NOT EXISTS growth.publication_receipts (
  receipt_id             text PRIMARY KEY,
  campaign_id            text NOT NULL,
  article_id             text,
  variant_id             text,
  destination_id         text NOT NULL,
  kind                   text NOT NULL,
  outcome                text NOT NULL
    CHECK (outcome IN (
      'PUBLISHED_VERIFIED',
      'ACCEPTED_PENDING',
      'FAILED',
      'UNKNOWN_REMOTE_OUTCOME',
      'NEEDS_REAUTH',
      'UNSUPPORTED_ACTION'
    )),
  remote_id              text,
  gateway_operation_id   text,
  write_path_id          text,
  summary                text NOT NULL,
  fixture_only           boolean NOT NULL DEFAULT false,
  live_wiring            text NOT NULL
    CHECK (live_wiring IN ('NOT_WIRED', 'FIXTURE')),
  recorded_at            timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS publication_receipts_campaign_idx
  ON growth.publication_receipts (campaign_id);

CREATE TABLE IF NOT EXISTS growth.content_release_outcomes (
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

CREATE INDEX IF NOT EXISTS content_release_outcomes_fixture_idx
  ON growth.content_release_outcomes (fixture_only);
