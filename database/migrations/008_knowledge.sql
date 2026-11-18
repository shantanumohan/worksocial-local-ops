-- R1-06 knowledge and research: fact registry, instruction ingestion,
-- demand/trend/FAQ/rank observations with SUPPORTED|UNKNOWN|HYPOTHESIS labels.
-- Not production-activated. Schema only; file-backed knowledge store is used until Postgres is bound.
-- Live SERP / Google Trends remain NOT_WIRED without owner credentials.

CREATE TABLE IF NOT EXISTS growth.facts (
  fact_id              text PRIMARY KEY,
  statement            text NOT NULL,
  support_label        text NOT NULL
    CHECK (support_label IN ('SUPPORTED', 'UNKNOWN', 'HYPOTHESIS')),
  evidence_links_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_notes_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS facts_support_label_idx
  ON growth.facts (support_label);

CREATE TABLE IF NOT EXISTS growth.instruction_ingestions (
  ingestion_id           text PRIMARY KEY,
  source_path            text NOT NULL,
  checksum               text NOT NULL,
  status                 text NOT NULL
    CHECK (status IN (
      'pending_classification',
      'ingested',
      'rejected',
      'quarantined'
    )),
  instruction_version    text,
  classifier_notes_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_claim_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixture_only           boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS instruction_ingestions_checksum_idx
  ON growth.instruction_ingestions (checksum);

CREATE TABLE IF NOT EXISTS growth.demand_observations (
  observation_id              text PRIMARY KEY,
  kind                        text NOT NULL
    CHECK (kind IN ('trend', 'faq', 'rank', 'query_cluster')),
  query_or_topic              text NOT NULL,
  normalized_intent           text,
  geography                   text,
  device                      text,
  language                    text,
  search_surface              text,
  observed_at                 timestamptz NOT NULL,
  covered_period_start        timestamptz,
  covered_period_end          timestamptz,
  raw_value                   double precision,
  normalized_value            double precision,
  unit                        text,
  sample_size                 integer,
  missing_data_state          text NOT NULL
    CHECK (missing_data_state IN ('complete', 'partial', 'omitted', 'unknown')),
  comparability_group         text,
  support_label               text NOT NULL
    CHECK (support_label IN ('SUPPORTED', 'UNKNOWN', 'HYPOTHESIS')),
  evidence_links_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
  collection_method           text NOT NULL,
  source_system               text NOT NULL,
  fixture_only                boolean NOT NULL DEFAULT false,
  notes_json                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS demand_observations_kind_label_idx
  ON growth.demand_observations (kind, support_label, observed_at DESC);

CREATE TABLE IF NOT EXISTS growth.fact_outcomes (
  outcome_id           text PRIMARY KEY,
  fact_id              text NOT NULL,
  write_path_id        text NOT NULL,
  operation_id         text NOT NULL,
  label                text NOT NULL
    CHECK (label IN ('SUCCESS', 'FAILURE', 'UNKNOWN')),
  source               text NOT NULL,
  feature_hints_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary              text NOT NULL,
  fixture_only         boolean NOT NULL DEFAULT false,
  recorded_at          timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS fact_outcomes_fact_recorded_idx
  ON growth.fact_outcomes (fact_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS growth.knowledge_meta (
  meta_key             text PRIMARY KEY,
  meta_value           text NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO growth.knowledge_meta (meta_key, meta_value)
VALUES
  ('live_serp_wiring', 'NOT_WIRED'),
  ('live_trends_wiring', 'NOT_WIRED')
ON CONFLICT (meta_key) DO NOTHING;
