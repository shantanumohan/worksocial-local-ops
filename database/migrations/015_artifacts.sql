-- M3 / NEXT-12: immutable artifact revisions for evidence packages + Claude outputs.
-- Schema companion for packages/persistence artifact-store (file-backed until Postgres cutover).
-- Not production-activated. No live provider spend.

CREATE TABLE IF NOT EXISTS core.artifacts (
  artifact_id         text NOT NULL,
  revision            text NOT NULL,
  checksum            text NOT NULL,
  trust_label         text NOT NULL
    CHECK (trust_label IN (
      'trusted_instruction',
      'untrusted_source',
      'measured_evidence'
    )),
  kind                text NOT NULL,
  byte_length         integer NOT NULL CHECK (byte_length >= 0),
  content_text        text NOT NULL,
  previous_revision   text,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL,
  PRIMARY KEY (artifact_id, revision)
);

CREATE INDEX IF NOT EXISTS artifacts_kind_created_idx
  ON core.artifacts (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS core.review_bindings (
  binding_id                 text PRIMARY KEY,
  proposal_id                text NOT NULL,
  proposal_artifact_id       text NOT NULL,
  proposal_revision          text NOT NULL,
  proposal_checksum          text NOT NULL,
  evidence_package_digest    text NOT NULL,
  evidence_artifact_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_role_id             text NOT NULL
    CHECK (author_role_id ~ '^A(0[1-9]|[12][0-9]|30)$'),
  reviewer_role_id           text NOT NULL
    CHECK (reviewer_role_id = 'A25'),
  status                     text NOT NULL
    CHECK (status IN ('bound', 'invalidated', 'accepted', 'rejected')),
  invalidation_reason        text,
  created_at                 timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS review_bindings_proposal_idx
  ON core.review_bindings (proposal_id, created_at DESC);
