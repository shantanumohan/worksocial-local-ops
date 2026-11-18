-- R1-03 production mapping: site/CMS/repo bindings, forms, booking/CRM ownership,
-- journey registry, and read evidence for pilot write paths.
-- Not production-activated. Schema only; file-backed production-mapping store is used until Postgres is bound.
-- No live Zoho/CMS mutations are implied by this migration.

CREATE TABLE IF NOT EXISTS core.sites (
  site_id            text PRIMARY KEY,
  display_name       text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.source_bindings (
  binding_id         text PRIMARY KEY,
  site_id            text NOT NULL REFERENCES core.sites (site_id),
  kind               text NOT NULL
    CHECK (kind IN ('website', 'cms', 'repo')),
  resource_ref       text NOT NULL,
  display_name       text NOT NULL,
  identity_label     text,
  connection_state   text NOT NULL,
  write_readiness    text NOT NULL,
  verification_state text NOT NULL,
  ownership_proven   boolean NOT NULL DEFAULT false,
  observed_revision  text,
  adapter_wiring     text NOT NULL
    CHECK (adapter_wiring IN ('NOT_WIRED', 'FIXTURE', 'LIVE')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.form_mappings (
  form_id            text PRIMARY KEY,
  site_id            text NOT NULL REFERENCES core.sites (site_id),
  page_asset_id      text NOT NULL,
  binding_id         text NOT NULL REFERENCES core.source_bindings (binding_id),
  handler_endpoint   text NOT NULL,
  crm_module_id      text,
  field_map_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ownership_owner    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.booking_ownership (
  booking_ownership_id text PRIMARY KEY,
  site_id              text NOT NULL REFERENCES core.sites (site_id),
  provider_id          text NOT NULL,
  resource_id          text NOT NULL,
  environment          text NOT NULL
    CHECK (environment IN ('fixture', 'sandbox', 'production')),
  owner_system         text NOT NULL,
  ownership_proven     boolean NOT NULL DEFAULT false,
  adapter_wiring       text NOT NULL
    CHECK (adapter_wiring IN ('NOT_WIRED', 'FIXTURE', 'LIVE')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.crm_ownership (
  crm_ownership_id   text PRIMARY KEY,
  organization_id    text NOT NULL,
  environment        text NOT NULL
    CHECK (environment IN ('fixture', 'sandbox', 'production')),
  module_id          text NOT NULL,
  field_ownership_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_data_policy   text NOT NULL,
  ownership_proven   boolean NOT NULL DEFAULT false,
  adapter_wiring     text NOT NULL
    CHECK (adapter_wiring IN ('NOT_WIRED', 'FIXTURE', 'LIVE')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.pilot_write_paths (
  write_path_id      text PRIMARY KEY,
  channel_id         text NOT NULL,
  asset_id           text NOT NULL,
  operation          text NOT NULL,
  site_id            text NOT NULL REFERENCES core.sites (site_id),
  binding_id         text REFERENCES core.source_bindings (binding_id),
  form_id            text REFERENCES core.form_mappings (form_id),
  booking_ownership_id text REFERENCES core.booking_ownership (booking_ownership_id),
  crm_ownership_id   text REFERENCES core.crm_ownership (crm_ownership_id),
  required_evidence_kinds text[] NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, asset_id, operation)
);

CREATE TABLE IF NOT EXISTS core.journey_registry (
  journey_id         text PRIMARY KEY,
  site_id            text NOT NULL REFERENCES core.sites (site_id),
  display_name       text NOT NULL,
  stages             text[] NOT NULL,
  write_path_ids     text[] NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.read_evidence (
  evidence_id        text PRIMARY KEY,
  write_path_id      text NOT NULL REFERENCES core.pilot_write_paths (write_path_id),
  evidence_kind      text NOT NULL
    CHECK (evidence_kind IN (
      'identity',
      'resource',
      'scope',
      'capability_test',
      'read_back'
    )),
  resource_type      text NOT NULL
    CHECK (resource_type IN ('binding', 'form', 'booking', 'crm', 'journey')),
  resource_id        text NOT NULL,
  operation          text NOT NULL,
  summary            text NOT NULL,
  fixture_only       boolean NOT NULL DEFAULT true,
  observed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS read_evidence_write_path_idx
  ON core.read_evidence (write_path_id);

-- Labeled SUCCESS/FAILURE/UNKNOWN outcomes for a later local learning-worker.
-- R1-03 stores durable labels only; no ML frameworks or training in this migration.
CREATE TABLE IF NOT EXISTS core.write_path_outcomes (
  outcome_id         text PRIMARY KEY,
  write_path_id      text NOT NULL REFERENCES core.pilot_write_paths (write_path_id),
  operation_id       text NOT NULL,
  label              text NOT NULL
    CHECK (label IN ('SUCCESS', 'FAILURE', 'UNKNOWN')),
  source             text NOT NULL
    CHECK (source IN (
      'gateway_receipt',
      'read_back',
      'journey_verification',
      'owner_decision',
      'stop_switch',
      'fixture'
    )),
  feature_hints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary            text NOT NULL,
  fixture_only       boolean NOT NULL DEFAULT false,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS write_path_outcomes_path_label_idx
  ON core.write_path_outcomes (write_path_id, label);

COMMENT ON TABLE core.source_bindings IS
  'Website/CMS/repo bindings; connection identity is not write permission.';
COMMENT ON TABLE core.read_evidence IS
  'Prior read/capability-test evidence required before pilot write paths; fixture-only in R1-03.';
COMMENT ON TABLE core.pilot_write_paths IS
  'Registered pilot mutation paths; gateway denies writes without mapped ownership + read evidence.';
COMMENT ON TABLE core.write_path_outcomes IS
  'Durable labeled outcomes (SUCCESS/FAILURE) for future multi-model learning-worker; not trained in R1-03.';
