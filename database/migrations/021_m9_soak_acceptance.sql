-- M9 / NEXT-20 soak / acceptance evidence harness.
-- File-backed soak store remains the runtime until Postgres cutover.
-- Live CMS/GSC/GA4/Zoho/Temporal remain NOT_WIRED. ChatGPT Ads stays blocked.
-- ACCEPTED requires evidence; VERIFIED for live is never silent.

CREATE TABLE IF NOT EXISTS journey.soak_runs (
  run_id            text PRIMARY KEY,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz NOT NULL,
  duration_ms       bigint NOT NULL CHECK (duration_ms >= 0),
  environment       text NOT NULL
    CHECK (environment IN ('fixture', 'sandbox', 'authorized_production')),
  pilot_gate_status text NOT NULL
    CHECK (pilot_gate_status IN ('NOT_MET', 'MET', 'BLOCKED')),
  pilot_gate_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  chatgpt_ads_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  live_wiring_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  r1_complete_claimed boolean NOT NULL DEFAULT false
    CHECK (r1_complete_claimed = false),
  external_effects  text NOT NULL DEFAULT 'NONE'
    CHECK (external_effects = 'NONE'),
  honest_note       text NOT NULL,
  fixture_only      boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS journey.soak_proofs (
  proof_id            text PRIMARY KEY,
  run_id              text NOT NULL REFERENCES journey.soak_runs (run_id),
  kind                text NOT NULL
    CHECK (kind IN (
      'crash_restart',
      'no_duplicate_effects',
      'job_continuity',
      'unknown_remote_reconcile'
    )),
  passed              boolean NOT NULL,
  details             jsonb NOT NULL DEFAULT '[]'::jsonb,
  apply_attempt_count integer,
  operation_id        text,
  fixture_only        boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS soak_proofs_run_idx
  ON journey.soak_proofs (run_id);

CREATE TABLE IF NOT EXISTS journey.acceptance_evidence_artifacts (
  artifact_id                   text PRIMARY KEY,
  case_id                       text NOT NULL,
  environment                   text NOT NULL
    CHECK (environment IN ('fixture', 'sandbox')),
  redacted                      boolean NOT NULL DEFAULT true
    CHECK (redacted = true),
  summary                       text NOT NULL,
  proof_kinds                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_ref                  text NOT NULL,
  live_provider_success_claimed boolean NOT NULL DEFAULT false
    CHECK (live_provider_success_claimed = false),
  external_effects              text NOT NULL DEFAULT 'NONE'
    CHECK (external_effects = 'NONE'),
  created_at                    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS acceptance_evidence_case_idx
  ON journey.acceptance_evidence_artifacts (case_id);

CREATE TABLE IF NOT EXISTS journey.acceptance_case_ledger (
  case_id       text PRIMARY KEY,
  status        text NOT NULL
    CHECK (status IN ('NOT_RUN', 'ACCEPTED', 'FAILED', 'BLOCKED')),
  environment   text NOT NULL
    CHECK (environment IN ('fixture', 'sandbox', 'authorized_production')),
  artifact_id   text REFERENCES journey.acceptance_evidence_artifacts (artifact_id),
  reasons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL,
  CONSTRAINT acceptance_case_accepted_needs_artifact CHECK (
    status <> 'ACCEPTED' OR artifact_id IS NOT NULL
  )
);
