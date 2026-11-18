-- WorkSocial Operations — control plane schemas (WP01–WP02 stub)
-- Not production-activated. Minimal CREATE SCHEMA only; tables land in later WPs.
-- Logical planes: core / growth / journey / measure / evaluation

CREATE SCHEMA IF NOT EXISTS core;       -- identity, sources, grants, jobs, host lease
CREATE SCHEMA IF NOT EXISTS growth;     -- demand, content, distribution intents
CREATE SCHEMA IF NOT EXISTS journey;    -- probes, form/CRM synthetic journeys, inbox
CREATE SCHEMA IF NOT EXISTS measure;    -- outcomes, costs, budgets, measurement windows
CREATE SCHEMA IF NOT EXISTS evaluation; -- isolated eval runs (no operational write credentials)

-- Notes (future migrations):
-- core: sites, source_bindings, capability_grants, jobs, artifacts, host_leases
-- growth: demand_observations, content_bundles, distribution_intents
-- journey: probe_results, synthetic_transactions, conversations
-- measure: cost_ledgers, daily_budgets, measurement_windows
-- evaluation: eval_suites, eval_runs (test-only providers)
