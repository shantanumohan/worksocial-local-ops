-- R1-10 Bounded repair and release: incidents, tickets, proposals, attempts,
-- test evidence, and release outcome ledger.
-- Not production-activated. Schema only; file-backed repair store is used until Postgres is bound.
-- Live CMS / production repair remains NOT_WIRED without owner credentials.
-- Tables live in journey (created by 001_control_plane.sql) — repair is a journey concern.

CREATE TABLE IF NOT EXISTS journey.incidents (
  incident_id          text PRIMARY KEY,
  title                text NOT NULL,
  summary              text NOT NULL,
  severity             text NOT NULL
    CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
  status               text NOT NULL
    CHECK (status IN (
      'open', 'reproduced', 'repairing', 'resolved', 'escalated', 'closed'
    )),
  asset_id             text NOT NULL,
  site_id              text NOT NULL,
  failing_probe_id     text NOT NULL,
  business_impact      text NOT NULL,
  fixture_only         boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS incidents_asset_idx
  ON journey.incidents (asset_id);

CREATE TABLE IF NOT EXISTS journey.repair_tickets (
  ticket_id            text PRIMARY KEY,
  incident_id          text NOT NULL REFERENCES journey.incidents (incident_id),
  asset_id             text NOT NULL,
  site_id              text NOT NULL,
  repair_class         text NOT NULL
    CHECK (repair_class IN (
      'restore_cta', 'content_formatting', 'metadata_refresh',
      'idempotent_retry', 'fixture_integration'
    )),
  status               text NOT NULL
    CHECK (status IN (
      'open', 'proposal_drafted', 'in_review', 'approved',
      'released_pending', 'verified', 'failed', 'escalated', 'closed'
    )),
  attempt_count        integer NOT NULL DEFAULT 0,
  max_attempts         integer NOT NULL DEFAULT 2,
  worktree_ref         text NOT NULL,
  source_revision      text NOT NULL,
  lease_owner          text,
  lease_expires_at     timestamptz,
  fixture_only         boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS repair_tickets_incident_idx
  ON journey.repair_tickets (incident_id);

CREATE TABLE IF NOT EXISTS journey.repair_proposals (
  proposal_id                     text PRIMARY KEY,
  ticket_id                       text NOT NULL REFERENCES journey.repair_tickets (ticket_id),
  incident_id                     text NOT NULL,
  author_role_id                  text NOT NULL,
  repair_class                    text NOT NULL,
  title                           text NOT NULL,
  summary                         text NOT NULL,
  asset_id                        text NOT NULL,
  patches_json                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  touched_paths_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_operations_json            jsonb NOT NULL DEFAULT '[]'::jsonb,
  regression_probe_id             text NOT NULL,
  test_baseline_digest            text NOT NULL,
  proposed_test_baseline_digest   text NOT NULL,
  change_set_file_count           integer NOT NULL DEFAULT 0,
  estimated_diff_lines            integer NOT NULL DEFAULT 0,
  status                          text NOT NULL
    CHECK (status IN (
      'draft', 'ready_for_review', 'approved', 'rejected',
      'released_pending', 'verified', 'failed', 'blocked'
    )),
  self_approval_attempted         boolean NOT NULL DEFAULT false,
  review_verdict_id               text,
  gateway_operation_id            text,
  write_path_id                   text,
  block_reasons_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only                    boolean NOT NULL DEFAULT false,
  created_at                      timestamptz NOT NULL,
  updated_at                      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS repair_proposals_ticket_idx
  ON journey.repair_proposals (ticket_id);

CREATE TABLE IF NOT EXISTS journey.repair_attempts (
  attempt_id           text PRIMARY KEY,
  ticket_id            text NOT NULL REFERENCES journey.repair_tickets (ticket_id),
  proposal_id          text NOT NULL,
  attempt_number       integer NOT NULL,
  outcome              text NOT NULL
    CHECK (outcome IN (
      'pending', 'tests_passed', 'tests_failed', 'gate_denied',
      'released', 'rolled_back', 'escalated'
    )),
  test_evidence_id     text,
  notes                text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repair_attempts_ticket_number_idx
  ON journey.repair_attempts (ticket_id, attempt_number);

CREATE TABLE IF NOT EXISTS journey.repair_test_evidence (
  evidence_id          text PRIMARY KEY,
  proposal_id          text NOT NULL,
  probe_id             text NOT NULL,
  passed               boolean NOT NULL,
  result_digest        text NOT NULL,
  summary              text NOT NULL,
  fixture_only         boolean NOT NULL DEFAULT false,
  recorded_at          timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS journey.repair_release_outcomes (
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

CREATE INDEX IF NOT EXISTS repair_release_outcomes_fixture_idx
  ON journey.repair_release_outcomes (fixture_only);

-- Standing policy action class already includes bounded_repair (003_identity_authority.sql).
-- Live CMS / production repair wiring is enforced in domain/service as NOT_WIRED.
