-- Allow TEMPORAL as an honest mission wiring label when a local Temporal
-- cluster is bound. LOCAL_DURABLE / FIXTURE / NOT_WIRED remain valid.

ALTER TABLE core.mission_workflows
  DROP CONSTRAINT IF EXISTS mission_workflows_temporal_wiring_check;

ALTER TABLE core.mission_workflows
  ADD CONSTRAINT mission_workflows_temporal_wiring_check
  CHECK (temporal_wiring IN ('NOT_WIRED', 'LOCAL_DURABLE', 'FIXTURE', 'TEMPORAL'));
