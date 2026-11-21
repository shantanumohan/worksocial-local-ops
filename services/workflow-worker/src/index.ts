/** @worksocial/workflow-worker — mission enqueue + durable local workflows + Temporal wiring. */

export {
  createMissionEnqueueService,
  type MissionEnqueueRequest,
  type MissionEnqueueResult,
  type MissionEnqueueService,
  type TemporalWiringStatus,
} from "./mission-enqueue.js";

export {
  probeTemporalBinding,
  probeTemporalConnection,
  runtimeTemporalLabel,
  temporalSdkPresent,
  TEMPORAL_TASK_QUEUE,
  type TemporalBindingStatus,
  type TemporalBindingReport,
  type TemporalSdkDependency,
} from "./temporal-binding.js";

export {
  createDurableMissionRuntime,
  createMemoryDurableMissionRuntime,
  createPgDurableMissionRuntime,
  type DurableMissionRuntime,
} from "./durable-mission.js";

export {
  createEvidenceMissionRuntime,
  createMemoryEvidenceMissionRuntime,
  type EvidenceMissionSnapshot,
  type EvidenceMissionResult,
  type EvidenceMissionRuntime,
} from "./evidence-mission.js";

export {
  createTemporalMissionClient,
  type TemporalMissionClient,
} from "./temporal/client.js";

export {
  createTemporalMissionWorker,
  type CreateTemporalWorkerOptions,
} from "./temporal/worker.js";

export {
  createTemporalWorkerMissionStores,
  resolveTemporalWorkerStoreKind,
  type TemporalWorkerMissionStores,
  type TemporalWorkerStoreKind,
} from "./temporal/worker-stores.js";

export type {
  TemporalMissionInput,
  TemporalMissionResult,
  TemporalMissionEnvelope,
} from "./temporal/types.js";

export const packageName = "@worksocial/workflow-worker" as const;
