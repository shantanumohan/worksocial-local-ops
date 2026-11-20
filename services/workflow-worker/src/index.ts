/** @worksocial/workflow-worker — mission enqueue + durable local workflows (Temporal NOT_WIRED). */

export {
  createMissionEnqueueService,
  type MissionEnqueueRequest,
  type MissionEnqueueResult,
  type MissionEnqueueService,
  type TemporalWiringStatus,
} from "./mission-enqueue.js";

export {
  probeTemporalBinding,
  runtimeTemporalLabel,
  type TemporalBindingStatus,
  type TemporalBindingReport,
} from "./temporal-binding.js";

export {
  createDurableMissionRuntime,
  createMemoryDurableMissionRuntime,
  type DurableMissionRuntime,
} from "./durable-mission.js";

export const packageName = "@worksocial/workflow-worker" as const;
