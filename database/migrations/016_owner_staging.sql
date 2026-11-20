-- M4 / NEXT-13–15: owner staging workflow companion schema.
-- File-backed store is authoritative until Postgres cutover.
-- Not production-activated. No live CMS mutations.

CREATE TABLE IF NOT EXISTS core.owner_activation_checklists (
  checklist_id   text PRIMARY KEY,
  timezone       text NOT NULL,
  steps_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at     timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.owner_sites (
  site_id               text PRIMARY KEY,
  display_name          text NOT NULL,
  domain                text NOT NULL,
  pilot_page_path       text NOT NULL,
  pilot_page_title      text NOT NULL,
  environment           text NOT NULL
    CHECK (environment IN ('staging', 'fixture')),
  source_binding_label  text NOT NULL,
  created_at            timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.owner_connections (
  connection_id       text PRIMARY KEY,
  kind                text NOT NULL
    CHECK (kind IN ('gsc', 'ga4', 'cms_staging')),
  display_name        text NOT NULL,
  mode                text NOT NULL
    CHECK (mode IN ('NOT_CONFIGURED', 'FIXTURE', 'LIVE')),
  account_label       text,
  capability_summary  text NOT NULL,
  write_ready         boolean NOT NULL DEFAULT false,
  note                text NOT NULL,
  updated_at          timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.owner_page_snapshots (
  snapshot_id        text PRIMARY KEY,
  site_id            text NOT NULL,
  page_path          text NOT NULL,
  title              text NOT NULL,
  canonical          text,
  h1                 text,
  meta_description   text,
  content_digest     text NOT NULL,
  html_byte_length   integer NOT NULL CHECK (html_byte_length >= 0),
  measurement_mode   text NOT NULL
    CHECK (measurement_mode IN ('FIXTURE', 'LIVE', 'UNAVAILABLE')),
  source_label       text NOT NULL,
  checks_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  captured_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.owner_measurements (
  observation_id     text PRIMARY KEY,
  kind               text NOT NULL
    CHECK (kind IN ('gsc', 'ga4', 'cms_staging')),
  measurement_mode   text NOT NULL
    CHECK (measurement_mode IN ('FIXTURE', 'LIVE', 'UNAVAILABLE')),
  rows_json          jsonb NOT NULL DEFAULT '[]'::jsonb,
  window_label       text NOT NULL,
  note               text NOT NULL,
  captured_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.owner_missions (
  mission_id           text PRIMARY KEY,
  site_id              text NOT NULL,
  display_title        text NOT NULL,
  summary              text NOT NULL,
  status               text NOT NULL,
  before_snapshot_id   text,
  after_snapshot_id    text,
  change_id            text,
  review_decision      text,
  review_note          text,
  desired_fields_json  jsonb NOT NULL,
  fixture_only         boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_missions_status_idx
  ON core.owner_missions (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS core.staging_cms_pages (
  page_id         text PRIMARY KEY,
  site_id         text NOT NULL,
  path            text NOT NULL,
  fields_json     jsonb NOT NULL,
  revision        text NOT NULL,
  content_digest  text NOT NULL,
  updated_at      timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.staging_changes (
  change_id           text PRIMARY KEY,
  mission_id          text NOT NULL,
  page_id             text NOT NULL,
  desired_fields_json jsonb NOT NULL,
  desired_digest      text NOT NULL,
  status              text NOT NULL
    CHECK (status IN (
      'DRAFT',
      'APPLIED_PENDING',
      'VERIFIED',
      'MISMATCH',
      'UNKNOWN_REMOTE_OUTCOME',
      'RECOVERED'
    )),
  applied_revision    text,
  observed_digest     text,
  recovery_note       text,
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.owner_evidence (
  evidence_id        text PRIMARY KEY,
  mission_id         text,
  kind               text NOT NULL,
  title              text NOT NULL,
  summary            text NOT NULL,
  measurement_mode   text,
  created_at         timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_evidence_created_idx
  ON core.owner_evidence (created_at DESC);
