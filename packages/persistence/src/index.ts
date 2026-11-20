export {
  ARTIFACT_STORAGE_KINDS,
  ALL_STORAGE_ROOT_KINDS,
  DEFAULT_SYNC_DENY_PATTERNS,
  DURABLE_STORAGE_KINDS,
  evaluateSyncPathPolicy,
  isArtifactStorageKind,
  isConsumerSyncPath,
  isDurableStorageKind,
  normalizePathForPolicy,
  resolveCanonicalPath,
  type ArtifactStorageKind,
  type DurableStorageKind,
  type StorageRootKind,
  type SyncPathPolicyOptions,
  type SyncPathPolicyVerdict,
} from "./sync-path-policy.js";

export {
  assertDurableRootsOffSync,
  createEmptyRegistry,
  getRootByKind,
  isStorageRootKind,
  listMissingArtifactRoots,
  listMissingDurableRoots,
  registerStorageRoot,
  validateStorageRootCandidate,
  type StorageRootRecord,
  type StorageRootRegistrySnapshot,
  type StorageRootValidationError,
  type StorageRootValidationResult,
} from "./storage-roots.js";

export {
  acquireHostLease,
  isLeaseExpired,
  isLeaseHeldByGeneration,
  releaseHostLease,
  renewHostLease,
  systemClock,
  type HostLeaseAcquireResult,
  type HostLeaseClock,
  type HostLeaseRecord,
} from "./host-lease.js";

export {
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_SERVICE_SLOTS,
  defaultHeartbeat,
  isHeartbeatStale,
  summarizeHostHealth,
  type HostHealthSnapshot,
  type ServiceHealthStatus,
  type ServiceHeartbeatRecord,
  type ServiceSlotId,
  type ServiceWiringStatus,
} from "./health-records.js";

export {
  createFileLocalStateStore,
  defaultStateDir,
  type LocalStateStore,
  type SupervisorRuntimeState,
} from "./local-state-store.js";

export {
  defaultOwnershipProbe,
  verifyProcessOwnership,
  type ProcessOwnershipClaim,
  type ProcessOwnershipProbe,
} from "./process-ownership.js";

export {
  createFileAuthorityStore,
  ensureBootstrapOwner,
  emptyAuthorityState,
  defaultProviderStatuses,
  createDemoPublishGrant,
  createDemoCanaryGrant,
  defaultAuthorityStateDir,
  hashPassword,
  verifyPassword,
  type AuthorityState,
  type AuthorityStore,
  type AuthorityAuditEvent,
  type OwnerControls,
  type PolicyDecisionRecord,
  type BootstrapOwnerOptions,
} from "./authority-store.js";

export {
  createFileProductionMappingStore,
  defaultProductionMappingStateDir,
  type ProductionMappingStore,
} from "./production-mapping-store.js";

export {
  createFileRoleRuntimeStore,
  defaultRoleRuntimeStateDir,
  emptyRoleRuntimeState,
  type RoleRuntimeStore,
  type RoleRuntimeState,
  type RoleStatusRecord,
  type RoleRunEvidence,
} from "./role-runtime-store.js";

export {
  createFileLearningStore,
  defaultLearningStateDir,
  emptyLearningState,
  type LearningStore,
  type LearningState,
} from "./learning-store.js";

export {
  createFileProbeStore,
  defaultProbeStateDir,
  type ProbeStore,
} from "./probe-store.js";

export {
  createFileKnowledgeStore,
  defaultKnowledgeStateDir,
  type KnowledgeStore,
} from "./knowledge-store.js";

export {
  createFileSeoStore,
  defaultSeoStateDir,
  type SeoStore,
} from "./seo-store.js";
